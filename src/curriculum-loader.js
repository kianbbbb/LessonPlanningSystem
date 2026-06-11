'use strict';

/**
 * curriculum-loader.js
 * Loads and queries UK National Curriculum 2014 data for primary school
 * (KS1: Years 1–2, KS2: Years 3–6). Supports Maths and Literacy.
 */

const fs = require('fs');
const path = require('path');

const CURRICULUM_DIR = path.join(__dirname, '..', 'curriculum');

const SUPPORTED_SUBJECTS = ['maths', 'literacy'];
const SUPPORTED_KEY_STAGES = ['ks1', 'ks2'];

const YEAR_TO_KS = {
  'year 1': 'ks1',
  'year 2': 'ks1',
  'year 3': 'ks2',
  'year 4': 'ks2',
  'year 5': 'ks2',
  'year 6': 'ks2',
};

/**
 * Load a curriculum file for a given subject and key stage.
 * @param {string} subject  e.g. 'maths' or 'literacy'
 * @param {string} keyStage e.g. 'ks1' or 'ks2'
 * @returns {object} Parsed curriculum data
 */
function loadCurriculum(subject, keyStage) {
  const subjectNorm = subject.toLowerCase();
  const ksNorm = keyStage.toLowerCase();

  if (!SUPPORTED_SUBJECTS.includes(subjectNorm)) {
    throw new Error(
      `Subject '${subject}' is not supported. Supported subjects: ${SUPPORTED_SUBJECTS.join(', ')}`
    );
  }
  if (!SUPPORTED_KEY_STAGES.includes(ksNorm)) {
    throw new Error(
      `Key stage '${keyStage}' is not supported for primary. Supported: ${SUPPORTED_KEY_STAGES.join(', ')}`
    );
  }

  const filePath = path.join(CURRICULUM_DIR, subjectNorm, `${ksNorm}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Curriculum file not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Derive the key stage from a year group string.
 * @param {string} yearGroup  e.g. 'Year 3' or 'year 3'
 * @returns {string} e.g. 'ks2'
 */
function keyStageFromYear(yearGroup) {
  const ks = YEAR_TO_KS[yearGroup.toLowerCase()];
  if (!ks) {
    throw new Error(
      `Unknown year group '${yearGroup}'. Valid values: ${Object.keys(YEAR_TO_KS).map(y => y.replace(/^\w/, c => c.toUpperCase())).join(', ')}`
    );
  }
  return ks;
}

/**
 * List all topic names (and their strand) for a curriculum.
 * @param {object} curriculum  Parsed curriculum JSON
 * @returns {Array<{strand: string, name: string}>}
 */
function listTopics(curriculum) {
  const topics = [];
  for (const strand of curriculum.strands || []) {
    for (const topic of strand.topics || []) {
      topics.push({ strand: strand.name, name: topic.name });
    }
  }
  return topics;
}

/**
 * Find a topic object by name (partial, case-insensitive match).
 * Returns the topic data along with its parent strand name.
 * @param {object} curriculum  Parsed curriculum JSON
 * @param {string} topicName   Full or partial topic name to search for
 * @returns {{topic: object, strand: string} | null}
 */
function findTopic(curriculum, topicName) {
  const query = (topicName || '').trim().toLowerCase();
  if (!query) return null;
  for (const strand of curriculum.strands || []) {
    for (const topic of strand.topics || []) {
      const name = topic.name.toLowerCase();
      // Always allow the query to match within the topic name. Only allow
      // the reverse direction (topic name inside the query) for reasonably
      // long topic names, so tiny names cannot match almost anything.
      if (name.includes(query) || (topic.name.length >= 4 && query.includes(name))) {
        return { topic, strand: strand.name };
      }
    }
  }
  return null;
}

/**
 * Find topics that are suitable for a given year group.
 * @param {object} curriculum  Parsed curriculum JSON
 * @param {string} yearGroup   e.g. 'Year 4'
 * @returns {Array<{strand: string, name: string}>}
 */
function topicsForYear(curriculum, yearGroup) {
  const yearNorm = yearGroup.toLowerCase();
  const topics = [];
  for (const strand of curriculum.strands || []) {
    for (const topic of strand.topics || []) {
      if (!topic.years || topic.years.some(y => y.toLowerCase() === yearNorm)) {
        topics.push({ strand: strand.name, name: topic.name });
      }
    }
  }
  return topics;
}

module.exports = {
  loadCurriculum,
  keyStageFromYear,
  listTopics,
  findTopic,
  topicsForYear,
  SUPPORTED_SUBJECTS,
  SUPPORTED_KEY_STAGES,
  YEAR_TO_KS,
};
