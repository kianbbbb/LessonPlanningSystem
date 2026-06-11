'use strict';

/**
 * lesson-generator.js
 * Builds a structured lesson plan object from curriculum data and the
 * skills/lesson-structure definition.  The plan can be passed directly
 * to html-presenter.js or augmented with AI-generated content first.
 */

const fs = require('fs');
const path = require('path');
const { loadCurriculum, findTopic, keyStageFromYear } = require('./curriculum-loader');

const SKILLS_PATH = path.join(__dirname, '..', 'skills', 'lesson-structure.json');

function loadSkillsStructure() {
  return JSON.parse(fs.readFileSync(SKILLS_PATH, 'utf8'));
}

/**
 * Generate a complete lesson plan object.
 *
 * @param {object} options
 * @param {string} options.subject    'maths' | 'literacy'
 * @param {string} options.yearGroup  e.g. 'Year 2'
 * @param {string} options.topic      Topic name (partial match supported)
 * @param {string} [options.date]     Display date (defaults to today)
 * @param {string} [options.className]  e.g. '2B'
 * @param {number} [options.duration]   Lesson length in minutes (default 60)
 * @returns {object} Structured lesson plan
 */
function generateLesson(options) {
  const {
    subject,
    yearGroup,
    topic,
    date = new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    className = '',
    duration = 60,
  } = options;

  const keyStage = keyStageFromYear(yearGroup);
  const curriculum = loadCurriculum(subject, keyStage);
  const skills = loadSkillsStructure();

  const result = findTopic(curriculum, topic);
  const topicData = result ? result.topic : null;
  const strandName = result ? result.strand : '';

  const timingKey = duration <= 45 ? '45min' : '60min';
  const timing = skills.timingGuidance[timingKey];

  const lessonTitle = topicData
    ? topicData.name
    : topic.replace(/\b\w/g, c => c.toUpperCase());

  const walt = topicData
    ? topicData.objectives[0]
    : `Understand and apply ${topic} concepts`;

  const wilf = topicData
    ? topicData.masteryIndicators
    : generateDefaultWILF(topic);

  const keyVocabulary = topicData ? topicData.keyVocab : [];

  const slides = buildSlides(skills.components, topicData, topic, timing);

  return {
    meta: {
      subject: capitalise(subject),
      keyStage: keyStage.toUpperCase(),
      yearGroup,
      className,
      date,
      duration,
      strand: strandName,
      curriculum: curriculum.programmeOfStudy || 'UK National Curriculum 2014',
    },
    title: lessonTitle,
    walt,
    wilf,
    keyVocabulary,
    slides,
    differentiation: skills.differentiationStrategies,
    assessmentStrategies: skills.assessmentStrategies,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildSlides(components, topicData, topic, timing) {
  return components.map(component => {
    const content = topicData
      ? resolveContent(component.id, topicData, topic)
      : '';

    // Duration-specific timing guidance takes precedence over any
    // hardcoded per-component timing; component.timing is only a fallback.
    const map = timing
      ? {
          'starter': timing.starter,
          'main-teaching': timing.mainTeaching,
          'guided-practice': timing.guidedPractice,
          'independent-practice': timing.independentPractice,
          'mastery-check': timing.masteryCheck,
          'plenary': timing.plenary,
        }
      : {};
    const timingMins = map[component.id] ?? component.timing ?? null;

    return {
      id: component.id,
      label: component.label,
      fullName: component.fullName,
      description: component.description,
      slideColor: component.slideColor,
      slideTextColor: component.slideTextColor,
      displayType: component.displayType,
      timingMins,
      content,
      differentiation: component.differentiation || null,
    };
  });
}

function resolveContent(componentId, topicData, topic) {
  switch (componentId) {
    case 'walt':
      return topicData.objectives ? topicData.objectives.join('\n') : '';
    case 'wilf':
      return topicData.masteryIndicators
        ? topicData.masteryIndicators.join('\n')
        : '';
    case 'key-vocabulary':
      return topicData.keyVocab ? JSON.stringify(topicData.keyVocab) : '';
    case 'starter':
      return topicData.starter || `Retrieval activity linked to ${topic}`;
    case 'main-teaching':
      return topicData.objectives
        ? topicData.objectives.slice(1).join('\n')
        : `Teach the key concepts of ${topic}`;
    case 'guided-practice':
      return (
        topicData.guidedPractice ||
        `Worked examples for ${topic} — teacher-led with pupil participation`
      );
    case 'independent-practice':
      return (
        topicData.independentPractice ||
        `Developing: scaffolded ${topic} tasks\nExpected: standard tasks\nMastery: reasoning and greater depth`
      );
    case 'mastery-check':
      return (
        topicData.masteryCheck ||
        `Exit ticket: 2–3 questions assessing understanding of ${topic}`
      );
    case 'plenary':
      return (
        topicData.plenary ||
        `Review the WALT. What did we learn today about ${topic}? Address misconceptions.`
      );
    default:
      return '';
  }
}

function generateDefaultWILF(topic) {
  return [
    `I can explain the key ideas in ${topic}`,
    `I can apply ${topic} skills independently`,
    `I can use the correct vocabulary for ${topic}`,
    `I can help a partner understand ${topic}`,
  ];
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = { generateLesson };
