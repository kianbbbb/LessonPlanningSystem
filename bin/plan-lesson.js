#!/usr/bin/env node
'use strict';

/**
 * bin/plan-lesson.js
 * Executable entry point for the UK Primary Lesson Planning System.
 *
 * Usage:
 *   node bin/plan-lesson.js
 *   node bin/plan-lesson.js --subject maths --year "Year 3" --topic "Fractions"
 *   node bin/plan-lesson.js --subject literacy --year "Year 1" --topic "Phonics" --no-ai
 *
 * Installs as 'plan-lesson' when the package is installed globally:
 *   npm install -g .
 *   plan-lesson
 */

const { run } = require('../src/agent');

run(process.argv.slice(2)).catch(err => {
  console.error('\n  ✗ Unexpected error:', err.message);
  process.exit(1);
});
