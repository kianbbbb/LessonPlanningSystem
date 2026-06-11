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
const {
  loadCurriculum,
  keyStageFromYear,
  findTopic,
  topicsForYear,
  SUPPORTED_SUBJECTS,
  YEAR_TO_KS,
} = require('./curriculum-loader');
const { detectAvailableCLIs, enrichLesson } = require('./ai-bridge');
const { saveToFile } = require('./html-presenter');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const YEAR_GROUPS = Object.keys(YEAR_TO_KS).map(y =>
  y.replace(/^\w/, c => c.toUpperCase())
);

const USAGE = `  Usage: plan-lesson [options]

  Run with no options for interactive mode, or provide --subject, --year
  and --topic together for non-interactive mode.

  Options:
    --subject <subject>   Subject: maths or literacy
    --year <year>         Year group, e.g. "Year 2" (Year 1 – Year 6)
    --topic <topic>       Topic name, e.g. "Fractions" (partial match supported)
    --class <name>        Class name shown on the slides, e.g. 2B (optional)
    --duration <mins>     Lesson duration in minutes: 45 or 60 (default: 60)
    --ai                  Use an AI CLI (gh copilot / opencode) to enrich content
    --no-ai               Disable AI enrichment (curriculum template content only)
    --help, -h            Show this help screen
    --version             Show the version number

  Examples:
    node bin/plan-lesson.js
    node bin/plan-lesson.js --subject maths --year "Year 2" --topic "Fractions" --class 2B --no-ai
    node bin/plan-lesson.js --subject literacy --year "Year 5" --topic "Persuasive Writing" --duration 45 --ai
`;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function run(argv) {
  // Parse any CLI flags passed directly (non-interactive mode)
  const flags = parseFlags(argv);

  if (flags.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (flags.version) {
    console.log(require('../package.json').version);
    process.exit(0);
  }

  printBanner();

  // Validate that any provided required flag carries a real value —
  // parseFlags yields boolean true for valueless flags.
  for (const name of ['subject', 'year', 'topic']) {
    if (name in flags && (typeof flags[name] !== 'string' || flags[name].trim() === '')) {
      console.error(`  ✗ Error: --${name} requires a value.\n`);
      console.error(USAGE);
      process.exit(1);
    }
  }

  // Detect AI availability early so we can inform the user — but skip the
  // (slow) detection entirely when AI has been disabled with --no-ai.
  let clis = { copilot: false, opencode: false };
  let aiAvailable = false;
  if (flags.ai !== false) {
    clis = detectAvailableCLIs();
    aiAvailable = clis.opencode || clis.copilot;

    if (aiAvailable) {
      const toolName = clis.opencode ? 'OpenCode' : 'GitHub Copilot';
      console.log(`\n  ✓ AI assistant detected: ${toolName}\n`);
    } else {
      console.log('\n  ℹ  No AI CLI detected — lesson will use curriculum template content.');
      console.log('     Install "opencode" or the GitHub Copilot CLI extension');
      console.log('     ("gh extension install github/gh-copilot") for AI-enriched lessons.\n');
    }
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
    duration = validateDuration(flags.duration);
    useAI = flags.ai !== false && aiAvailable;
  } else {
    // ---------------------------------------------------------------
    // Interactive mode (also works with piped stdin — answers arriving
    // before a prompt is shown are queued, not dropped)
    // ---------------------------------------------------------------
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // A single persistent 'line' listener queues every line as it arrives.
    // When stdin is a pipe, readline can flush all buffered lines in one
    // tick — long before the later questions have been printed — so each
    // answer must be kept until nextLine() asks for it.
    const lineQueue = [];
    let pendingResolve = null;
    let inputClosed = false;

    const failOnEarlyEOF = () => {
      console.error('\n\n  ✗ Input ended before all questions were answered. No lesson generated.\n');
      process.exit(1);
    };

    rl.on('line', line => {
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve(line);
      } else {
        lineQueue.push(line);
      }
    });

    // If stdin ends (Ctrl+D / EOF / empty pipe) while a question is still
    // waiting for an answer, exit cleanly instead of hanging.
    rl.on('close', () => {
      inputClosed = true;
      if (pendingResolve) failOnEarlyEOF();
    });

    const nextLine = () => {
      if (lineQueue.length > 0) return Promise.resolve(lineQueue.shift());
      if (inputClosed) failOnEarlyEOF();
      return new Promise(resolve => {
        pendingResolve = resolve;
      });
    };

    const ask = (question, choices) => askQuestion(nextLine, question, choices);

    subject = await ask(
      'Which subject?',
      SUPPORTED_SUBJECTS.map(s => s.charAt(0).toUpperCase() + s.slice(1))
    );

    yearGroup = await ask('Which year group?', YEAR_GROUPS);

    // List topics available for this year
    let availableTopics = [];
    try {
      const ks = keyStageFromYear(yearGroup);
      const curriculum = loadCurriculum(subject, ks);
      availableTopics = topicsForYear(curriculum, yearGroup).map(t => t.name);
    } catch {
      // Fall through to free-text input
    }

    if (availableTopics.length > 0) {
      topic = await ask('Which topic?', [...availableTopics, '[ Enter custom topic ]']);
      if (topic === '[ Enter custom topic ]') {
        topic = await askFreeText(nextLine, 'Enter topic name: ');
      }
    } else {
      topic = await askFreeText(nextLine, 'Enter topic name: ');
    }

    className = await askFreeTextOptional(nextLine, 'Class name (optional, e.g. 3B): ');

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

  // Warn (but still proceed) when the topic was not found in the curriculum,
  // so the teacher knows the lesson contains generic template content.
  try {
    const ks = keyStageFromYear(yearGroup);
    const curriculum = loadCurriculum(subject, ks);
    if (!findTopic(curriculum, topic)) {
      const available = topicsForYear(curriculum, yearGroup).map(t => t.name);
      console.log(`\n  ⚠  Warning: topic '${topic}' is not in the ${lesson.meta.subject} ${ks.toUpperCase()} curriculum.`);
      console.log('     Generic template content will be used for this lesson.');
      if (available.length > 0) {
        console.log(`     Available ${yearGroup} topics:`);
        for (const name of available) console.log(`       - ${name}`);
      }
    }
  } catch {
    // Curriculum lookup problems were already surfaced by generateLesson.
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
 * @param {() => Promise<string>} nextLine  Yields the next line of input
 */
async function askQuestion(nextLine, question, choices) {
  console.log(`\n  ${question}`);
  choices.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
  process.stdout.write('  Enter number: ');

  for (;;) {
    const trimmed = (await nextLine()).trim();
    if (trimmed === '') {
      // An empty answer must not match anything (startsWith('') is
      // always true) — reprompt instead.
      console.log('  Please enter a number from the list.');
      process.stdout.write('  Enter number: ');
      continue;
    }
    const idx = parseInt(trimmed, 10) - 1;
    if (idx >= 0 && idx < choices.length) return choices[idx];
    // Try matching by text
    const match = choices.find(
      c => c.toLowerCase().startsWith(trimmed.toLowerCase())
    );
    if (match) return match;
    console.log('  Please enter a number from the list.');
  }
}

async function askFreeText(nextLine, prompt) {
  process.stdout.write(`\n  ${prompt}`);
  return (await nextLine()).trim();
}

async function askFreeTextOptional(nextLine, prompt) {
  process.stdout.write(`\n  ${prompt}`);
  return (await nextLine()).trim();
}

// ---------------------------------------------------------------------------
// Flag parser & validation
// ---------------------------------------------------------------------------

function parseFlags(argv) {
  const flags = {};
  const args = argv || process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-ai') { flags.ai = false; continue; }
    if (arg === '--ai')    { flags.ai = true;  continue; }
    if (arg === '-h')      { flags.help = true; continue; }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      flags[key] = value;
    }
  }
  return flags;
}

/**
 * Validate a --duration value. Only 45 and 60 minute lessons are supported
 * (they are the only entries in skills/lesson-structure.json timingGuidance).
 * @param {*} raw  Raw flag value
 * @returns {number} 45 or 60
 */
function validateDuration(raw) {
  if (raw === undefined) return 60;
  if (raw === true) {
    // parseFlags yields boolean true for a valueless flag.
    console.log('  ⚠  Warning: --duration requires a value (45 or 60). Using 60 minutes.');
    return 60;
  }
  const value = Number(raw);
  if (value === 45 || value === 60) return value;
  console.log(`  ⚠  Warning: duration '${raw}' is not supported (only 45 or 60 minutes). Using 60 minutes.`);
  return 60;
}

module.exports = { run };
