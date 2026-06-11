'use strict';

/**
 * test/lesson-generator.test.js
 * Unit tests for the primary lesson planning system.
 * Run with: npm test
 */

const assert = require('assert');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const { generateLesson } = require('../src/lesson-generator');
const {
  loadCurriculum,
  keyStageFromYear,
  listTopics,
  findTopic,
  topicsForYear,
  SUPPORTED_SUBJECTS,
  YEAR_TO_KS,
} = require('../src/curriculum-loader');
const { renderToHTML, saveToFile } = require('../src/html-presenter');
const { buildLessonPrompt, parseAIResponse } = require('../src/ai-bridge');

// ---------------------------------------------------------------------------
// Simple test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// curriculum-loader tests
// ---------------------------------------------------------------------------

console.log('\ncurriculum-loader');

test('SUPPORTED_SUBJECTS contains maths and literacy', () => {
  assert.ok(SUPPORTED_SUBJECTS.includes('maths'));
  assert.ok(SUPPORTED_SUBJECTS.includes('literacy'));
});

test('keyStageFromYear returns ks1 for Year 1 and Year 2', () => {
  assert.strictEqual(keyStageFromYear('Year 1'), 'ks1');
  assert.strictEqual(keyStageFromYear('Year 2'), 'ks1');
});

test('keyStageFromYear returns ks2 for Year 3–6', () => {
  assert.strictEqual(keyStageFromYear('Year 3'), 'ks2');
  assert.strictEqual(keyStageFromYear('Year 4'), 'ks2');
  assert.strictEqual(keyStageFromYear('Year 5'), 'ks2');
  assert.strictEqual(keyStageFromYear('Year 6'), 'ks2');
});

test('keyStageFromYear throws for an invalid year', () => {
  assert.throws(() => keyStageFromYear('Year 7'), /Unknown year group/);
});

test('loadCurriculum loads maths KS1', () => {
  const c = loadCurriculum('maths', 'ks1');
  assert.strictEqual(c.subject, 'Maths');
  assert.strictEqual(c.keyStage, 'KS1');
  assert.ok(Array.isArray(c.strands));
  assert.ok(c.strands.length > 0);
});

test('loadCurriculum loads maths KS2', () => {
  const c = loadCurriculum('Maths', 'KS2');
  assert.strictEqual(c.keyStage, 'KS2');
  assert.ok(c.strands.length > 0);
});

test('loadCurriculum loads literacy KS1', () => {
  const c = loadCurriculum('literacy', 'ks1');
  assert.strictEqual(c.subject, 'Literacy');
  assert.ok(c.strands.length > 0);
});

test('loadCurriculum loads literacy KS2', () => {
  const c = loadCurriculum('literacy', 'ks2');
  assert.strictEqual(c.subject, 'Literacy');
  assert.ok(c.strands.length > 0);
});

test('loadCurriculum throws for unsupported subject', () => {
  assert.throws(() => loadCurriculum('science', 'ks1'), /not supported/);
});

test('listTopics returns a non-empty array', () => {
  const c = loadCurriculum('maths', 'ks1');
  const topics = listTopics(c);
  assert.ok(Array.isArray(topics));
  assert.ok(topics.length > 0);
  assert.ok(topics[0].strand);
  assert.ok(topics[0].name);
});

test('findTopic finds a known topic by partial name', () => {
  const c = loadCurriculum('maths', 'ks1');
  const result = findTopic(c, 'Place Value');
  assert.ok(result !== null);
  assert.ok(result.topic.name.toLowerCase().includes('place value'));
  assert.ok(result.strand);
});

test('findTopic returns null for an unknown topic', () => {
  const c = loadCurriculum('maths', 'ks1');
  const result = findTopic(c, 'Trigonometry');
  assert.strictEqual(result, null);
});

test('topicsForYear filters to the correct year', () => {
  const c = loadCurriculum('maths', 'ks2');
  const topics = topicsForYear(c, 'Year 6');
  assert.ok(Array.isArray(topics));
  assert.ok(topics.length > 0);
  const names = topics.map(t => t.name);
  assert.ok(names.includes('Algebra'));
  assert.ok(names.includes('Ratio and Proportion'));
});

test('findTopic returns null for an empty or blank query', () => {
  const c = loadCurriculum('maths', 'ks1');
  assert.strictEqual(findTopic(c, ''), null);
  assert.strictEqual(findTopic(c, '   '), null);
});

test('findTopic does not reverse-match short topic names', () => {
  // A topic name shorter than 4 characters must not match just because it
  // happens to appear inside the query string.
  const synthetic = { strands: [{ name: 'Test', topics: [{ name: 'Ab' }] }] };
  assert.strictEqual(findTopic(synthetic, 'collaborative work'), null);
  // The forward direction (query within name) still works for short names
  assert.ok(findTopic(synthetic, 'Ab') !== null);
});

test('topicsForYear is case-insensitive about the year group', () => {
  const c = loadCurriculum('maths', 'ks1');
  const lower = topicsForYear(c, 'Year 2').map(t => t.name);
  const upper = topicsForYear(c, 'YEAR 2').map(t => t.name);
  assert.ok(lower.length > 0);
  assert.deepStrictEqual(upper, lower);
});

// ---------------------------------------------------------------------------
// lesson-generator tests
// ---------------------------------------------------------------------------

console.log('\nlesson-generator');

test('generateLesson returns a valid lesson plan for Maths Year 2', () => {
  const lesson = generateLesson({ subject: 'maths', yearGroup: 'Year 2', topic: 'Fractions' });
  assert.strictEqual(lesson.meta.subject, 'Maths');
  assert.strictEqual(lesson.meta.yearGroup, 'Year 2');
  assert.strictEqual(lesson.meta.keyStage, 'KS1');
  assert.ok(typeof lesson.title === 'string' && lesson.title.length > 0);
  assert.ok(typeof lesson.walt === 'string' && lesson.walt.length > 0);
  assert.ok(Array.isArray(lesson.wilf) && lesson.wilf.length > 0);
  assert.ok(Array.isArray(lesson.keyVocabulary));
  assert.ok(Array.isArray(lesson.slides) && lesson.slides.length > 0);
});

test('generateLesson returns a valid lesson plan for Literacy Year 5', () => {
  const lesson = generateLesson({ subject: 'literacy', yearGroup: 'Year 5', topic: 'Persuasive Writing' });
  assert.strictEqual(lesson.meta.subject, 'Literacy');
  assert.strictEqual(lesson.meta.keyStage, 'KS2');
  assert.ok(lesson.keyVocabulary.length > 0);
});

test('generateLesson includes all required lesson components', () => {
  const lesson = generateLesson({ subject: 'maths', yearGroup: 'Year 4', topic: 'Multiplication' });
  const ids = lesson.slides.map(s => s.id);
  const required = ['walt', 'wilf', 'key-vocabulary', 'starter', 'main-teaching',
    'guided-practice', 'independent-practice', 'mastery-check', 'plenary'];
  for (const id of required) {
    assert.ok(ids.includes(id), `Missing slide: ${id}`);
  }
});

test('generateLesson uses default date when none provided', () => {
  const lesson = generateLesson({ subject: 'literacy', yearGroup: 'Year 1', topic: 'Phonics' });
  assert.ok(typeof lesson.meta.date === 'string' && lesson.meta.date.length > 0);
});

test('generateLesson respects custom duration and className', () => {
  const lesson = generateLesson({
    subject: 'maths',
    yearGroup: 'Year 3',
    topic: 'Place Value',
    className: '3A',
    duration: 45,
  });
  assert.strictEqual(lesson.meta.className, '3A');
  assert.strictEqual(lesson.meta.duration, 45);
});

test('generateLesson handles unknown topic with fallback content', () => {
  const lesson = generateLesson({
    subject: 'maths',
    yearGroup: 'Year 1',
    topic: 'Some Unknown Topic',
  });
  assert.ok(lesson.walt.includes('Some Unknown Topic'));
  assert.ok(lesson.wilf.length > 0);
});

test('45-minute lesson uses the 45min timing guidance', () => {
  const lesson = generateLesson({
    subject: 'maths',
    yearGroup: 'Year 2',
    topic: 'Fractions',
    duration: 45,
  });
  const byId = Object.fromEntries(lesson.slides.map(s => [s.id, s]));
  assert.strictEqual(byId['starter'].timingMins, 5);
  assert.strictEqual(byId['independent-practice'].timingMins, 12);
  assert.strictEqual(byId['plenary'].timingMins, 3);
});

test('60-minute lesson timings sum to 60 across timed slides', () => {
  const lesson = generateLesson({
    subject: 'maths',
    yearGroup: 'Year 2',
    topic: 'Fractions',
    duration: 60,
  });
  const total = lesson.slides
    .filter(s => typeof s.timingMins === 'number')
    .reduce((sum, s) => sum + s.timingMins, 0);
  assert.strictEqual(total, 60);
});

// ---------------------------------------------------------------------------
// html-presenter tests
// ---------------------------------------------------------------------------

console.log('\nhtml-presenter');

test('renderToHTML returns a non-empty HTML string', () => {
  const lesson = generateLesson({ subject: 'maths', yearGroup: 'Year 2', topic: 'Fractions' });
  const html = renderToHTML(lesson);
  assert.ok(typeof html === 'string');
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('<html'));
  assert.ok(html.includes('</html>'));
});

test('HTML output contains WALT text', () => {
  const lesson = generateLesson({ subject: 'maths', yearGroup: 'Year 2', topic: 'Fractions' });
  const html = renderToHTML(lesson);
  assert.ok(html.includes('WALT') || html.includes('We Are Learning To'));
});

test('HTML output contains key vocabulary', () => {
  const lesson = generateLesson({ subject: 'maths', yearGroup: 'Year 2', topic: 'Fractions' });
  const html = renderToHTML(lesson);
  // The HTML should contain at least one vocab term
  assert.ok(html.includes('vocab') || html.includes('fraction'));
});

test('HTML output contains navigation JavaScript', () => {
  const lesson = generateLesson({ subject: 'maths', yearGroup: 'Year 1', topic: 'Place Value' });
  const html = renderToHTML(lesson);
  assert.ok(html.includes('changeSlide') || html.includes('goToSlide'));
});

test('HTML output contains slide for each component', () => {
  const lesson = generateLesson({ subject: 'literacy', yearGroup: 'Year 3', topic: 'Spelling' });
  const html = renderToHTML(lesson);
  assert.ok(html.includes('Starter'));
  assert.ok(html.includes('Plenary'));
  assert.ok(html.includes('Mastery Check'));
});

test('HTML escapes dangerous characters', () => {
  const lesson = generateLesson({ subject: 'maths', yearGroup: 'Year 4', topic: 'Multiplication' });
  // Force a potentially dangerous string into the lesson
  lesson.meta.className = '<script>alert("xss")</script>';
  const html = renderToHTML(lesson);
  assert.ok(!html.includes('<script>alert("xss")</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('curriculum independent practice content reaches the HTML output', () => {
  const lesson = generateLesson({ subject: 'maths', yearGroup: 'Year 2', topic: 'Fractions' });
  const html = renderToHTML(lesson);
  // Distinctive substrings from curriculum/maths/ks1.json Fractions independentPractice
  assert.ok(html.includes('shade halves/quarters of shapes'));
  assert.ok(html.includes('find fractions of amounts'));
  assert.ok(html.includes('explain equivalence with diagrams'));
  // The single-line string must be parsed into three differentiation cards
  assert.ok(html.includes('diff-developing'));
  assert.ok(html.includes('diff-expected'));
  assert.ok(html.includes('diff-mastery'));
});

test('buildDiffSlide parses single-line Developing/Expected/Mastery content', () => {
  const lesson = generateLesson({ subject: 'maths', yearGroup: 'Year 2', topic: 'Fractions' });
  const slide = lesson.slides.find(s => s.id === 'independent-practice');
  slide.content = 'Developing: Alpha task. Expected: Bravo task. Mastery: Charlie task.';
  const html = renderToHTML(lesson);
  assert.ok(html.includes('Alpha task'));
  assert.ok(html.includes('Bravo task'));
  assert.ok(html.includes('Charlie task'));
});

test('HTML output includes a Teacher Notes slide with strategies', () => {
  const lesson = generateLesson({ subject: 'maths', yearGroup: 'Year 2', topic: 'Fractions' });
  const html = renderToHTML(lesson);
  assert.ok(html.includes('Teacher Notes'));
  assert.ok(html.includes('SEN'));
  assert.ok(html.includes('EAL'));
  assert.ok(html.includes('Gifted &amp; Talented'));
  assert.ok(html.includes('Mini-whiteboard responses'));
});

test('saveToFile writes a file that exists', () => {
  const tmpDir = path.join(require('os').tmpdir(), 'lps-test-' + crypto.randomBytes(6).toString('hex'));
  const lesson = generateLesson({ subject: 'maths', yearGroup: 'Year 6', topic: 'Algebra' });
  const filePath = saveToFile(lesson, tmpDir);
  assert.ok(fs.existsSync(filePath));
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('<!DOCTYPE html>'));
  fs.rmSync(tmpDir, { recursive: true });
});

// ---------------------------------------------------------------------------
// ai-bridge tests
// ---------------------------------------------------------------------------

console.log('\nai-bridge');

test('buildLessonPrompt returns a non-empty string containing WALT', () => {
  const lesson = generateLesson({ subject: 'maths', yearGroup: 'Year 4', topic: 'Fractions' });
  const prompt = buildLessonPrompt(lesson);
  assert.ok(typeof prompt === 'string');
  assert.ok(prompt.length > 100);
  assert.ok(prompt.includes('WALT'));
  assert.ok(prompt.includes('Year 4'));
});

test('buildLessonPrompt includes key vocabulary', () => {
  const lesson = generateLesson({ subject: 'maths', yearGroup: 'Year 4', topic: 'Fractions' });
  const prompt = buildLessonPrompt(lesson);
  assert.ok(prompt.includes('fraction') || prompt.includes('Fraction'));
});

test('parseAIResponse returns null for empty string', () => {
  assert.strictEqual(parseAIResponse(''), null);
  assert.strictEqual(parseAIResponse(null), null);
});

test('parseAIResponse parses a plain JSON string', () => {
  const json = JSON.stringify({ starter: 'Quick quiz', plenary: 'Exit ticket' });
  const result = parseAIResponse(json);
  assert.ok(result !== null);
  assert.strictEqual(result.starter, 'Quick quiz');
});

test('parseAIResponse strips markdown code fences', () => {
  const json = '```json\n' + JSON.stringify({ starter: 'Activity' }) + '\n```';
  const result = parseAIResponse(json);
  assert.ok(result !== null);
  assert.strictEqual(result.starter, 'Activity');
});

test('parseAIResponse handles invalid JSON gracefully', () => {
  const result = parseAIResponse('{ this is not json }');
  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// End-to-end test
// ---------------------------------------------------------------------------

console.log('\nend-to-end');

test('Full pipeline: generate → render → save HTML for Maths Year 2 Fractions', () => {
  const tmpDir = path.join(require('os').tmpdir(), 'lps-e2e-' + crypto.randomBytes(6).toString('hex'));
  const lesson = generateLesson({
    subject: 'maths',
    yearGroup: 'Year 2',
    topic: 'Fractions',
    className: '2B',
    duration: 60,
  });
  assert.ok(lesson.title);
  assert.ok(lesson.slides.length >= 9);
  const filePath = saveToFile(lesson, tmpDir);
  assert.ok(fs.existsSync(filePath));
  const html = fs.readFileSync(filePath, 'utf8');
  assert.ok(html.includes('Maths'));
  assert.ok(html.includes('Year 2'));
  fs.rmSync(tmpDir, { recursive: true });
});

test('Full pipeline: generate → render → save HTML for Literacy Year 5 Persuasive Writing', () => {
  const tmpDir = path.join(require('os').tmpdir(), 'lps-e2e-lit-' + crypto.randomBytes(6).toString('hex'));
  const lesson = generateLesson({
    subject: 'literacy',
    yearGroup: 'Year 5',
    topic: 'Persuasive Writing',
    duration: 45,
  });
  assert.ok(lesson.meta.subject === 'Literacy');
  const filePath = saveToFile(lesson, tmpDir);
  const html = fs.readFileSync(filePath, 'utf8');
  assert.ok(html.includes('Literacy') || html.includes('Persuasive'));
  fs.rmSync(tmpDir, { recursive: true });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(54)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('');

if (failed > 0) process.exit(1);
