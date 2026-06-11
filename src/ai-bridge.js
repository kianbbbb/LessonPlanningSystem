'use strict';

/**
 * ai-bridge.js
 * Interfaces with AI CLI tools to enhance lesson plan content.
 *
 * Supported CLIs (detected automatically):
 *   - GitHub Copilot CLI: `gh copilot suggest`
 *   - OpenCode CLI:       `opencode`
 *
 * Falls back to template-only generation if neither CLI is available.
 */

const { execSync, spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// CLI detection (results cached so detection only blocks once per process)
// ---------------------------------------------------------------------------

let _cliCache = null;

/**
 * Detect which AI CLI tools are available on PATH.
 * Result is cached after the first call to avoid repeated blocking.
 * @returns {{ copilot: boolean, opencode: boolean }}
 */
function detectAvailableCLIs() {
  if (_cliCache) return _cliCache;
  // 'gh' alone only proves the GitHub CLI is installed — the Copilot
  // extension must respond for Copilot to be usable.
  const copilot = isCommandAvailable('gh copilot');
  const opencode = isCommandAvailable('opencode');
  _cliCache = { copilot, opencode };
  return _cliCache;
}

function isCommandAvailable(cmd) {
  try {
    execSync(`${cmd} --version 2>/dev/null`, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Build a detailed prompt that asks an AI to enrich a lesson plan.
 * The prompt includes all curriculum context so the AI response is accurate.
 *
 * @param {object} lesson  Output of generateLesson()
 * @returns {string}       Ready-to-send prompt string
 */
function buildLessonPrompt(lesson) {
  const { meta, title, walt, wilf, keyVocabulary, slides } = lesson;

  const vocabList = keyVocabulary.length
    ? keyVocabulary.map(v => `  - ${v.term}: ${v.definition}`).join('\n')
    : '  (none defined)';

  const wilfList = wilf.map(w => `  - ${w}`).join('\n');

  const slideContext = slides
    .filter(s => !['walt', 'wilf', 'key-vocabulary'].includes(s.id))
    .map(
      s =>
        `[${s.label}] ${s.fullName}${s.timingMins ? ` (${s.timingMins} min)` : ''}\n  Current content: ${s.content || '(needs content)'}`
    )
    .join('\n\n');

  return `You are an experienced UK primary school teacher creating a lesson for ${meta.yearGroup} (${meta.keyStage}, ages ${meta.keyStage === 'KS1' ? '5-7' : '7-11'}).

LESSON DETAILS
==============
Subject:      ${meta.subject}
Year Group:   ${meta.yearGroup}
Topic:        ${title}
Duration:     ${meta.duration} minutes
Curriculum:   ${meta.curriculum}

WALT (We Are Learning To):
  ${walt}

WILF (What I'm Looking For / Success Criteria):
${wilfList}

Key Vocabulary:
${vocabList}

LESSON STRUCTURE TO COMPLETE
=============================
${slideContext}

YOUR TASK
=========
For each lesson phase above, provide rich, specific and age-appropriate content.
Follow these rules:
1. Keep language appropriate for ${meta.yearGroup} pupils and their teacher.
2. Starter: provide a concrete retrieval activity with clear instructions.
3. Main Teaching: list 3–5 clear teaching points the teacher should cover.
4. Guided Practice: describe a specific worked example or activity.
5. Independent Practice: provide three differentiated tasks (Developing / Expected / Mastery).
6. Mastery Check: write 2–3 specific exam-style questions to assess the WALT.
7. Plenary: describe a brief consolidation activity or discussion prompt.
8. Format your response as JSON matching this structure:
{
  "starter": "...",
  "main-teaching": "...",
  "guided-practice": "...",
  "independent-practice": "Developing: ...\\nExpected: ...\\nMastery: ...",
  "mastery-check": "...",
  "plenary": "..."
}`;
}

// ---------------------------------------------------------------------------
// AI CLI callers
// ---------------------------------------------------------------------------

/**
 * Call GitHub Copilot CLI with a prompt.
 * Uses `gh copilot suggest -t shell` to get a suggestion, but for lesson
 * generation we use a piped shell prompt approach.
 *
 * @param {string} prompt
 * @returns {string | null}  AI response or null on failure
 */
function callGitHubCopilot(prompt) {
  try {
    const result = spawnSync(
      'gh',
      ['copilot', 'suggest', '--hostname', 'github.com', '-t', 'shell', prompt],
      { encoding: 'utf8', timeout: 30000, input: '\n' }
    );
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Call OpenCode CLI with a prompt.
 *
 * @param {string} prompt
 * @returns {string | null}  AI response or null on failure
 */
function callOpenCode(prompt) {
  try {
    const result = spawnSync(
      'opencode',
      ['run', '--no-interactive'],
      {
        encoding: 'utf8',
        timeout: 60000,
        input: prompt,
      }
    );
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

/**
 * Attempt to parse a JSON block from an AI response string.
 * The AI may include markdown fences or prose around the JSON.
 * @param {string} response
 * @returns {object | null}
 */
function parseAIResponse(response) {
  if (!response) return null;

  // Strip markdown code fences if present
  const stripped = response
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Find the outermost JSON object
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1) return null;

  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to enrich the lesson plan slides with AI-generated content.
 * Tries each available CLI in order: OpenCode → GitHub Copilot.
 * If neither succeeds, the lesson plan is returned unchanged.
 *
 * @param {object} lesson     Output of generateLesson()
 * @param {object} [options]
 * @param {boolean} [options.verbose]  Log progress to stderr
 * @returns {{ lesson: object, aiUsed: string | null }}
 */
function enrichLesson(lesson, options = {}) {
  const { verbose = false } = options;
  const clis = detectAvailableCLIs();

  if (!clis.copilot && !clis.opencode) {
    if (verbose) {
      process.stderr.write(
        '[ai-bridge] No AI CLI found (gh copilot / opencode). Using template content.\n'
      );
    }
    return { lesson, aiUsed: null };
  }

  const prompt = buildLessonPrompt(lesson);
  let rawResponse = null;
  let aiUsed = null;

  if (clis.opencode) {
    if (verbose) process.stderr.write('[ai-bridge] Trying opencode…\n');
    rawResponse = callOpenCode(prompt);
    if (rawResponse) aiUsed = 'opencode';
  }

  if (!rawResponse && clis.copilot) {
    if (verbose) process.stderr.write('[ai-bridge] Trying gh copilot…\n');
    rawResponse = callGitHubCopilot(prompt);
    if (rawResponse) aiUsed = 'gh copilot';
  }

  if (!rawResponse) {
    if (verbose) process.stderr.write('[ai-bridge] AI call returned no content. Using template.\n');
    return { lesson, aiUsed: null };
  }

  const parsed = parseAIResponse(rawResponse);
  if (!parsed) {
    if (verbose) process.stderr.write('[ai-bridge] Could not parse AI JSON response. Using template.\n');
    return { lesson, aiUsed: null };
  }

  // Merge AI content into slides (only string values are usable)
  const enrichedLesson = {
    ...lesson,
    slides: lesson.slides.map(slide => {
      if (typeof parsed[slide.id] === 'string' && parsed[slide.id].trim()) {
        return { ...slide, content: parsed[slide.id].trim(), aiEnriched: true };
      }
      return slide;
    }),
  };

  if (verbose) process.stderr.write(`[ai-bridge] Enriched lesson using ${aiUsed}.\n`);
  return { lesson: enrichedLesson, aiUsed };
}

module.exports = {
  detectAvailableCLIs,
  buildLessonPrompt,
  enrichLesson,
  parseAIResponse,
};
