'use strict';

/**
 * agent.js
 * Interactive CLI agent for planning primary school lessons.
 * Supports Maths and Literacy across KS1 (Years 1–2) and KS2 (Years 3–6)
 * using the UK National Curriculum 2014.
 *
 * Usage:
 *   node bin/plan-lesson.js
 *   node bin/plan-lesson.js --subject maths --year "Year 3" --topic "Fractions" --no-ai
 */

const readline = require('readline');
const path = require('path');
const { generateLesson } = require('./lesson-generator');
const { topicsForYear, SUPPORTED_SUBJECTS, YEAR_TO_KS } = require('./curriculum-loader');
const { detectAvailableCLIs, enrichLesson } = require('./ai-bridge');
const { saveToFile } = require('./html-presenter');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const YEAR_GROUPS = Object.keys(YEAR_TO_KS).map(y =>
  y.replace(/^\w/, c => c.toUpperCase())
);

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function run(argv) {
  printBanner();

  // Parse any CLI flags passed directly (non-interactive mode)
  const flags = parseFlags(argv);

  // Detect AI availability early so we can inform the user
  const clis = detectAvailableCLIs();
  const aiAvailable = clis.opencode || clis.copilot;

  if (aiAvailable) {
    const toolName = clis.opencode ? 'OpenCode' : 'GitHub Copilot';
    console.log(`\n  ✓ AI assistant detected: ${toolName}\n`);
  } else {
    console.log('\n  ℹ  No AI CLI detected — lesson will use curriculum template content.');
    console.log('     Install "gh" (GitHub Copilot) or "opencode" for AI-enriched lessons.\n');
  }

  let subject, yearGroup, topic, className, duration, useAI;

  // ----------------------------------------------------------------
  // Non-interactive mode (all flags provided)
  // ----------------------------------------------------------------
  if (flags.subject && flags.year && flags.topic) {
    subject = flags.subject;
    yearGroup = flags.year;
    topic = flags.topic;
    className = flags.class || '';
    duration = Number(flags.duration) || 60;
    useAI = flags.ai !== false && aiAvailable;
  } else {
    // ---------------------------------------------------------------
    // Interactive mode
    // ---------------------------------------------------------------
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (question, choices) => askQuestion(rl, question, choices);

    subject = await ask(
      'Which subject?',
      SUPPORTED_SUBJECTS.map(s => s.charAt(0).toUpperCase() + s.slice(1))
    );

    yearGroup = await ask('Which year group?', YEAR_GROUPS);

    // List topics available for this year
    let availableTopics = [];
    try {
      const { loadCurriculum, keyStageFromYear } = require('./curriculum-loader');
      const ks = keyStageFromYear(yearGroup);
      const curriculum = loadCurriculum(subject, ks);
      availableTopics = topicsForYear(curriculum, yearGroup).map(t => t.name);
    } catch {
      // Fall through to free-text input
    }

    if (availableTopics.length > 0) {
      topic = await ask('Which topic?', [...availableTopics, '[ Enter custom topic ]']);
      if (topic === '[ Enter custom topic ]') {
        topic = await askFreeText(rl, 'Enter topic name: ');
      }
    } else {
      topic = await askFreeText(rl, 'Enter topic name: ');
    }

    className = await askFreeTextOptional(rl, 'Class name (optional, e.g. 3B): ');

    const durationAnswer = await ask('Lesson duration?', ['60 minutes', '45 minutes']);
    duration = durationAnswer.startsWith('45') ? 45 : 60;

    if (aiAvailable) {
      const aiChoice = await ask(
        'Use AI to enhance lesson content?',
        ['Yes — use AI assistant', 'No — use curriculum template only']
      );
      useAI = aiChoice.startsWith('Yes');
    } else {
      useAI = false;
    }

    rl.close();
  }

  // ----------------------------------------------------------------
  // Generate lesson plan
  // ----------------------------------------------------------------
  console.log('\n  ⏳ Generating lesson plan…');

  let lesson;
  try {
    lesson = generateLesson({
      subject,
      yearGroup,
      topic,
      className,
      duration,
    });
  } catch (err) {
    console.error(`\n  ✗ Error generating lesson: ${err.message}\n`);
    process.exit(1);
  }

  // ----------------------------------------------------------------
  // Optionally enrich with AI
  // ----------------------------------------------------------------
  let aiUsed = null;
  if (useAI) {
    console.log('  🤖 Contacting AI assistant (this may take a moment)…');
    const result = enrichLesson(lesson, { verbose: true });
    lesson = result.lesson;
    aiUsed = result.aiUsed;
  }

  // ----------------------------------------------------------------
  // Save HTML presentation
  // ----------------------------------------------------------------
  const outputDir = path.join(process.cwd(), 'output');
  const filePath = saveToFile(lesson, outputDir);

  // ----------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------
  console.log('\n  ✅ Lesson plan created successfully!\n');
  console.log(`     Subject:    ${lesson.meta.subject}`);
  console.log(`     Year:       ${lesson.meta.yearGroup}`);
  console.log(`     Topic:      ${lesson.title}`);
  console.log(`     WALT:       ${lesson.walt}`);
  console.log(`     Duration:   ${lesson.meta.duration} min`);
  console.log(`     AI used:    ${aiUsed || 'No (template mode)'}`);
  console.log(`\n     📄 Saved to: ${filePath}\n`);
  console.log('     Open the HTML file in any browser to present the lesson.\n');

  return filePath;
}

// ---------------------------------------------------------------------------
// Interactive helpers
// ---------------------------------------------------------------------------

function printBanner() {
  console.log('');
  console.log('  ┌───────────────────────────────────────────────────────┐');
  console.log('  │         UK Primary Lesson Planning System             │');
  console.log('  │   UK National Curriculum 2014 · KS1 & KS2            │');
  console.log('  │   Maths & Literacy · AI-powered HTML presentations   │');
  console.log('  └───────────────────────────────────────────────────────┘');
  console.log('');
}

/**
 * Ask a multiple-choice question and return the chosen answer.
 */
function askQuestion(rl, question, choices) {
  return new Promise(resolve => {
    console.log(`\n  ${question}`);
    choices.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));

    const onAnswer = answer => {
      rl.removeListener('line', onAnswer);
      const idx = parseInt(answer.trim(), 10) - 1;
      if (idx >= 0 && idx < choices.length) {
        resolve(choices[idx]);
      } else {
        // Try matching by text
        const match = choices.find(
          c => c.toLowerCase().startsWith(answer.trim().toLowerCase())
        );
        if (match) {
          resolve(match);
        } else {
          console.log('  Please enter a number from the list.');
          rl.once('line', onAnswer);
        }
      }
    };

    process.stdout.write('  Enter number: ');
    rl.once('line', onAnswer);
  });
}

function askFreeText(rl, prompt) {
  return new Promise(resolve => {
    process.stdout.write(`\n  ${prompt}`);
    rl.once('line', answer => resolve(answer.trim()));
  });
}

function askFreeTextOptional(rl, prompt) {
  return new Promise(resolve => {
    process.stdout.write(`\n  ${prompt}`);
    rl.once('line', answer => resolve(answer.trim()));
  });
}

// ---------------------------------------------------------------------------
// Flag parser
// ---------------------------------------------------------------------------

function parseFlags(argv) {
  const flags = {};
  const args = argv || process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-ai') { flags.ai = false; continue; }
    if (arg === '--ai')    { flags.ai = true;  continue; }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      flags[key] = value;
    }
  }
  return flags;
}

module.exports = { run };
