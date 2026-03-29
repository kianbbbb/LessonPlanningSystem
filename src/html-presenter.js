'use strict';

/**
 * html-presenter.js
 * Converts a lesson plan object (from lesson-generator.js) into a
 * self-contained HTML presentation file suitable for classroom display.
 *
 * The output is a single .html file with embedded CSS and minimal JavaScript
 * for slide navigation — no external dependencies required.
 */

const fs = require('fs');
const path = require('path');

/**
 * Render a lesson plan to an HTML string.
 * @param {object} lesson  Output of generateLesson()
 * @returns {string}       Full HTML document
 */
function renderToHTML(lesson) {
  const { meta, title, walt, wilf, keyVocabulary, slides } = lesson;

  const allSlides = buildSlideHTML(slides, { title, walt, wilf, keyVocabulary, meta });
  const totalSlides = allSlides.length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(meta.subject)}: ${escHtml(title)} — ${escHtml(meta.yearGroup)}</title>
  <style>
    ${buildCSS()}
  </style>
</head>
<body>

<div class="presentation" id="presentation">

  <!-- Navigation controls -->
  <div class="nav-bar">
    <button class="nav-btn" id="btn-prev" onclick="changeSlide(-1)" aria-label="Previous slide">&#8592; Prev</button>
    <span class="slide-counter" id="slide-counter">1 / ${totalSlides}</span>
    <button class="nav-btn" id="btn-next" onclick="changeSlide(1)" aria-label="Next slide">Next &#8594;</button>
  </div>

  <!-- Meta ribbon -->
  <div class="meta-ribbon">
    <span>${escHtml(meta.subject)} &nbsp;|&nbsp; ${escHtml(meta.keyStage)} &nbsp;|&nbsp; ${escHtml(meta.yearGroup)}${meta.className ? ' &nbsp;(' + escHtml(meta.className) + ')' : ''} &nbsp;|&nbsp; ${escHtml(meta.date)} &nbsp;|&nbsp; ${escHtml(meta.duration)} min</span>
  </div>

  <!-- Slides -->
  <div class="slides-container">
    ${allSlides.map((s, i) => `<div class="slide${i === 0 ? ' active' : ''}" data-index="${i}">${s}</div>`).join('\n    ')}
  </div>

  <!-- Progress dots -->
  <div class="progress-dots" id="progress-dots">
    ${allSlides.map((_, i) => `<span class="dot${i === 0 ? ' active' : ''}" onclick="goToSlide(${i})" title="Slide ${i + 1}"></span>`).join('')}
  </div>

</div>

<script>
  ${buildJS(totalSlides)}
</script>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Slide builders
// ---------------------------------------------------------------------------

function buildSlideHTML(slides, { title, walt, wilf, keyVocabulary, meta }) {
  const result = [];

  // Title slide
  result.push(buildTitleSlide(title, walt, meta));

  for (const slide of slides) {
    switch (slide.id) {
      case 'walt':
        result.push(buildWaltSlide(slide, walt));
        break;
      case 'wilf':
        result.push(buildWilfSlide(slide, wilf));
        break;
      case 'key-vocabulary':
        result.push(buildVocabSlide(slide, keyVocabulary));
        break;
      case 'independent-practice':
        result.push(buildDiffSlide(slide));
        break;
      default:
        result.push(buildGenericSlide(slide));
    }
  }

  return result;
}

function buildTitleSlide(title, walt, meta) {
  return `
  <div class="slide-inner slide-title">
    <div class="title-content">
      <div class="slide-badge">${escHtml(meta.subject)} &middot; ${escHtml(meta.yearGroup)}</div>
      <h1 class="lesson-title">${escHtml(title)}</h1>
      <p class="walt-subtitle">We Are Learning To&hellip;</p>
      <p class="walt-text">${escHtml(walt)}</p>
      <div class="title-meta">
        <span>${escHtml(meta.date)}</span>
        ${meta.className ? `<span>&nbsp;&middot;&nbsp;${escHtml(meta.className)}</span>` : ''}
        <span>&nbsp;&middot;&nbsp;${escHtml(meta.duration)} min lesson</span>
      </div>
    </div>
  </div>`;
}

function buildWaltSlide(slide, walt) {
  return `
  <div class="slide-inner" style="background:${slide.slideColor};color:${slide.slideTextColor}">
    <div class="slide-label">${escHtml(slide.label)}</div>
    <h2 class="slide-title-text">${escHtml(slide.fullName)}</h2>
    <div class="walt-box">
      <p>${escHtml(walt)}</p>
    </div>
    <p class="slide-description">${escHtml(slide.description)}</p>
  </div>`;
}

function buildWilfSlide(slide, wilf) {
  const items = wilf.map(w => `<li>${escHtml(w)}</li>`).join('\n');
  return `
  <div class="slide-inner" style="background:${slide.slideColor};color:${slide.slideTextColor}">
    <div class="slide-label">${escHtml(slide.label)}</div>
    <h2 class="slide-title-text">${escHtml(slide.fullName)}</h2>
    <p class="slide-subtitle">${escHtml(slide.description)}</p>
    <ul class="checklist">
      ${items}
    </ul>
  </div>`;
}

function buildVocabSlide(slide, keyVocabulary) {
  let vocabHTML = '';
  if (keyVocabulary && keyVocabulary.length > 0) {
    vocabHTML = keyVocabulary
      .map(
        v => `
      <div class="vocab-card">
        <span class="vocab-term">${escHtml(v.term)}</span>
        <span class="vocab-def">${escHtml(v.definition)}</span>
      </div>`
      )
      .join('\n');
  } else {
    vocabHTML = '<p>No vocabulary defined for this topic.</p>';
  }

  return `
  <div class="slide-inner" style="background:${slide.slideColor};color:${slide.slideTextColor}">
    <div class="slide-label">${escHtml(slide.label)}</div>
    <h2 class="slide-title-text">${escHtml(slide.fullName)}</h2>
    ${slide.timingMins ? `<div class="timing-badge">${slide.timingMins} min</div>` : ''}
    <div class="vocab-grid">
      ${vocabHTML}
    </div>
  </div>`;
}

function buildDiffSlide(slide) {
  const lines = (slide.content || '').split('\n').filter(Boolean);
  let levels = '';

  if (slide.differentiation) {
    levels = `
    <div class="diff-grid">
      <div class="diff-card diff-developing">
        <div class="diff-label">&#9733; Developing</div>
        <p>${escHtml(slide.differentiation.developing)}</p>
      </div>
      <div class="diff-card diff-expected">
        <div class="diff-label">&#9733;&#9733; Expected</div>
        <p>${escHtml(slide.differentiation.expected)}</p>
      </div>
      <div class="diff-card diff-mastery">
        <div class="diff-label">&#9733;&#9733;&#9733; Mastery</div>
        <p>${escHtml(slide.differentiation.mastery)}</p>
      </div>
    </div>`;
  } else if (lines.length > 0) {
    // Parse "Developing: …\nExpected: …\nMastery: …" from content
    const developing = lines.find(l => l.toLowerCase().startsWith('developing'));
    const expected = lines.find(l => l.toLowerCase().startsWith('expected'));
    const mastery = lines.find(l => l.toLowerCase().startsWith('mastery'));

    if (developing || expected || mastery) {
      levels = `
      <div class="diff-grid">
        ${developing ? `<div class="diff-card diff-developing"><div class="diff-label">&#9733; Developing</div><p>${escHtml(developing.replace(/^developing:\s*/i, ''))}</p></div>` : ''}
        ${expected ? `<div class="diff-card diff-expected"><div class="diff-label">&#9733;&#9733; Expected</div><p>${escHtml(expected.replace(/^expected:\s*/i, ''))}</p></div>` : ''}
        ${mastery ? `<div class="diff-card diff-mastery"><div class="diff-label">&#9733;&#9733;&#9733; Mastery</div><p>${escHtml(mastery.replace(/^mastery:\s*/i, ''))}</p></div>` : ''}
      </div>`;
    } else {
      levels = `<p>${escHtml(lines.join(' '))}</p>`;
    }
  }

  return `
  <div class="slide-inner" style="background:${slide.slideColor};color:${slide.slideTextColor}">
    <div class="slide-label">${escHtml(slide.label)}</div>
    <h2 class="slide-title-text">${escHtml(slide.fullName)}</h2>
    ${slide.timingMins ? `<div class="timing-badge">${slide.timingMins} min</div>` : ''}
    ${levels}
  </div>`;
}

function buildGenericSlide(slide) {
  const lines = (slide.content || slide.description || '')
    .split('\n')
    .filter(Boolean);

  const contentHTML =
    lines.length > 1
      ? `<ul class="content-list">${lines.map(l => `<li>${escHtml(l)}</li>`).join('')}</ul>`
      : `<p class="content-text">${escHtml(lines[0] || slide.description)}</p>`;

  return `
  <div class="slide-inner" style="background:${slide.slideColor};color:${slide.slideTextColor}">
    <div class="slide-label">${escHtml(slide.label)}</div>
    <h2 class="slide-title-text">${escHtml(slide.fullName)}</h2>
    ${slide.timingMins ? `<div class="timing-badge">${slide.timingMins} min</div>` : ''}
    ${contentHTML}
  </div>`;
}

// ---------------------------------------------------------------------------
// Save to file
// ---------------------------------------------------------------------------

/**
 * Write the HTML presentation to a file.
 * @param {object} lesson  Output of generateLesson()
 * @param {string} [outputDir]  Directory to write into (defaults to ./output)
 * @returns {string} Path of the written file
 */
function saveToFile(lesson, outputDir) {
  const dir = outputDir || path.join(process.cwd(), 'output');
  fs.mkdirSync(dir, { recursive: true });

  const safeName = [
    lesson.meta.subject,
    lesson.meta.yearGroup,
    lesson.title,
  ]
    .join('_')
    .replace(/[^a-z0-9_\-]/gi, '_')
    .toLowerCase();

  const filename = `${safeName}_${Date.now()}.html`;
  const filePath = path.join(dir, filename);

  fs.writeFileSync(filePath, renderToHTML(lesson), 'utf8');
  return filePath;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

function buildCSS() {
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #1a1a2e;
      color: #f0f0f0;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .presentation {
      width: 100%;
      max-width: 1200px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 12px;
    }

    /* Navigation bar */
    .nav-bar {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .nav-btn {
      background: #e8a020;
      color: #111;
      border: none;
      padding: 8px 20px;
      border-radius: 4px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .nav-btn:hover { background: #f5b942; }
    .nav-btn:disabled { background: #555; color: #888; cursor: default; }

    .slide-counter {
      font-size: 0.95rem;
      color: #ccc;
      min-width: 60px;
      text-align: center;
    }

    /* Meta ribbon */
    .meta-ribbon {
      font-size: 0.78rem;
      color: #aaa;
      letter-spacing: 0.04em;
      text-align: center;
    }

    /* Slides container */
    .slides-container {
      width: 100%;
      aspect-ratio: 16 / 9;
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 8px 40px rgba(0,0,0,0.6);
    }

    .slide {
      position: absolute;
      inset: 0;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.35s ease;
    }
    .slide.active {
      opacity: 1;
      pointer-events: auto;
    }

    /* Generic slide inner */
    .slide-inner {
      width: 100%;
      height: 100%;
      padding: 48px 64px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      background: #1e3a5f;
      color: #fff;
      overflow: hidden;
    }

    /* Title slide */
    .slide-title {
      background: linear-gradient(135deg, #0d2137 0%, #1a4f80 100%);
    }
    .title-content { text-align: center; }
    .slide-badge {
      display: inline-block;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 20px;
      padding: 4px 16px;
      font-size: 0.85rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 24px;
    }
    .lesson-title {
      font-size: clamp(1.8rem, 4vw, 3rem);
      font-weight: 700;
      margin-bottom: 20px;
      line-height: 1.2;
    }
    .walt-subtitle {
      font-size: 1rem;
      opacity: 0.7;
      margin-bottom: 8px;
      font-style: italic;
    }
    .walt-text {
      font-size: clamp(0.95rem, 1.8vw, 1.3rem);
      opacity: 0.9;
      max-width: 80%;
      margin: 0 auto 24px;
      line-height: 1.5;
    }
    .title-meta {
      font-size: 0.85rem;
      opacity: 0.6;
    }

    /* Slide label (WALT / WILF / Starter etc.) */
    .slide-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      opacity: 0.65;
      margin-bottom: 8px;
    }
    .slide-title-text {
      font-size: clamp(1.2rem, 2.5vw, 2rem);
      font-weight: 700;
      margin-bottom: 16px;
      line-height: 1.2;
    }
    .slide-subtitle {
      font-size: 0.9rem;
      opacity: 0.75;
      margin-bottom: 16px;
      font-style: italic;
    }
    .slide-description {
      font-size: 0.85rem;
      opacity: 0.7;
      margin-top: 20px;
      font-style: italic;
    }

    /* Timing badge */
    .timing-badge {
      display: inline-block;
      background: rgba(255,255,255,0.2);
      border-radius: 12px;
      padding: 2px 12px;
      font-size: 0.78rem;
      margin-bottom: 16px;
      align-self: flex-start;
    }

    /* WALT box */
    .walt-box {
      background: rgba(255,255,255,0.12);
      border-left: 4px solid rgba(255,255,255,0.5);
      border-radius: 4px;
      padding: 16px 20px;
      margin-bottom: 16px;
      font-size: clamp(1rem, 1.8vw, 1.3rem);
      line-height: 1.5;
    }

    /* WILF checklist */
    .checklist {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .checklist li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: clamp(0.85rem, 1.5vw, 1.1rem);
      line-height: 1.4;
    }
    .checklist li::before {
      content: "\\2714";
      font-size: 1.1rem;
      flex-shrink: 0;
      opacity: 0.8;
    }

    /* Vocabulary grid */
    .vocab-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
      overflow-y: auto;
      max-height: 70%;
    }
    .vocab-card {
      background: rgba(255,255,255,0.12);
      border-radius: 6px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .vocab-term {
      font-weight: 700;
      font-size: 1rem;
    }
    .vocab-def {
      font-size: 0.82rem;
      opacity: 0.85;
      line-height: 1.4;
    }

    /* Differentiation grid */
    .diff-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 16px;
      flex: 1;
    }
    .diff-card {
      border-radius: 6px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .diff-label {
      font-weight: 700;
      font-size: 0.9rem;
      margin-bottom: 4px;
    }
    .diff-card p {
      font-size: 0.85rem;
      line-height: 1.5;
      opacity: 0.9;
    }
    .diff-developing { background: rgba(255,255,255,0.12); }
    .diff-expected   { background: rgba(255,255,255,0.20); }
    .diff-mastery    { background: rgba(232,160,32,0.30); }

    /* Generic content */
    .content-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow-y: auto;
    }
    .content-list li {
      font-size: clamp(0.9rem, 1.5vw, 1.1rem);
      line-height: 1.5;
      padding-left: 1.2em;
      position: relative;
    }
    .content-list li::before {
      content: "\\25B8";
      position: absolute;
      left: 0;
      opacity: 0.7;
    }
    .content-text {
      font-size: clamp(0.95rem, 1.6vw, 1.25rem);
      line-height: 1.6;
      opacity: 0.95;
    }

    /* Progress dots */
    .progress-dots {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: rgba(255,255,255,0.3);
      cursor: pointer;
      transition: background 0.2s, transform 0.2s;
    }
    .dot:hover { background: rgba(255,255,255,0.6); transform: scale(1.2); }
    .dot.active { background: #e8a020; transform: scale(1.2); }

    /* Keyboard hint */
    body::after {
      content: "Use \\2190 \\2192 arrow keys to navigate";
      position: fixed;
      bottom: 8px;
      right: 12px;
      font-size: 0.65rem;
      color: rgba(255,255,255,0.25);
    }

    @media print {
      body { background: #fff; }
      .nav-bar, .progress-dots, .meta-ribbon, body::after { display: none; }
      .slides-container { box-shadow: none; aspect-ratio: auto; height: auto; }
      .slide { position: relative; opacity: 1; pointer-events: auto; page-break-after: always; }
      .slide-inner { min-height: 18cm; }
    }
  `;
}

// ---------------------------------------------------------------------------
// JavaScript for navigation
// ---------------------------------------------------------------------------

function buildJS(totalSlides) {
  return `
    var current = 0;
    var total = ${totalSlides};

    function goToSlide(n) {
      var slides = document.querySelectorAll('.slide');
      var dots   = document.querySelectorAll('.dot');
      slides[current].classList.remove('active');
      dots[current].classList.remove('active');
      current = Math.max(0, Math.min(n, total - 1));
      slides[current].classList.add('active');
      dots[current].classList.add('active');
      document.getElementById('slide-counter').textContent = (current + 1) + ' / ' + total;
      document.getElementById('btn-prev').disabled = current === 0;
      document.getElementById('btn-next').disabled = current === total - 1;
    }

    function changeSlide(delta) { goToSlide(current + delta); }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') changeSlide(1);
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   changeSlide(-1);
    });

    // Initialise button state
    document.getElementById('btn-prev').disabled = true;
  `;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { renderToHTML, saveToFile };
