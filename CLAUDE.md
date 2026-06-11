# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

A zero-dependency Node.js CLI that generates UK primary school (KS1/KS2, Years 1–6)
lesson plans from UK National Curriculum 2014 data and renders them as
self-contained HTML slide presentations. Subjects: Maths and Literacy.

## Commands

```bash
npm test                  # Run the full test suite (custom runner, no framework)
npm start                 # Interactive lesson planner
node bin/plan-lesson.js --subject maths --year "Year 2" --topic "Fractions" --class 2B --no-ai
node bin/plan-lesson.js --help
```

There is no build step, no linter, and **no npm dependencies** — keep it that way.
Everything runs on Node.js >= 18 built-ins (`fs`, `path`, `readline`, `child_process`).

## Architecture

Data flows in one direction through a pipeline:

```
curriculum/*/*.json ─┐
                     ├─> lesson-generator.js ──> ai-bridge.js (optional) ──> html-presenter.js ──> output/*.html
skills/lesson-structure.json ─┘
```

- `bin/plan-lesson.js` — thin executable shim; calls `run()` from `src/agent.js`.
- `src/agent.js` — CLI orchestrator. Parses flags (non-interactive mode) or prompts
  via readline (interactive mode), then runs generate → enrich → save.
- `src/curriculum-loader.js` — loads and queries `curriculum/<subject>/<ks>.json`.
  Owns the subject/key-stage/year-group validation and `YEAR_TO_KS` mapping.
- `src/lesson-generator.js` — builds the structured lesson plan object: merges a
  matched curriculum topic with the slide skeleton from `skills/lesson-structure.json`.
  Unknown topics fall back to generated placeholder content rather than failing.
- `src/ai-bridge.js` — optional enrichment via external AI CLIs (`opencode`, then
  `gh copilot`). Builds a prompt, parses a JSON response, merges per-slide content.
  Every failure path falls back silently to template content — AI must never be
  required for the tool to work.
- `src/html-presenter.js` — renders the lesson object to a single self-contained
  HTML string (inline CSS + JS, no external assets) and writes it to `output/`.

### Key data shapes

- **Lesson plan object** (produced by `generateLesson`): `{ meta, title, walt, wilf,
  keyVocabulary, slides[], differentiation, assessmentStrategies }`. Each slide is
  `{ id, label, fullName, description, slideColor, slideTextColor, displayType,
  timingMins, content, differentiation }`.
- **Curriculum JSON** (`curriculum/<subject>/<ks>.json`): `{ programmeOfStudy,
  strands: [{ name, topics: [{ name, years, objectives, keyVocab, masteryIndicators,
  starter, guidedPractice, independentPractice, masteryCheck }] }] }`. The
  `starter`/`guidedPractice`/`independentPractice`/`masteryCheck` fields are
  optional — `resolveContent()` in `src/lesson-generator.js` supplies template
  fallbacks for missing fields.
- **Skills file** (`skills/lesson-structure.json`): ordered `components[]` defining
  every lesson phase (WALT, WILF, vocabulary, starter, main teaching, guided practice,
  independent practice, mastery check, plenary), plus `timingGuidance` for 60/45-minute
  lessons and differentiation/assessment strategy text.

Slide `id` values (`walt`, `wilf`, `key-vocabulary`, `starter`, `main-teaching`,
`guided-practice`, `independent-practice`, `mastery-check`, `plenary`) are the
contract shared by the skills file, `resolveContent()` in lesson-generator,
the AI response JSON keys, and the per-slide renderers in html-presenter.
If you add or rename a phase, update all four places.

## Conventions

- All HTML output must go through `escHtml()` in html-presenter — every value that
  originates from user input or JSON data is escaped before interpolation (XSS-safe
  is an advertised feature).
- UK English throughout user-facing text ("Licence", "colour", "Maths").
- Curriculum content must stay faithful to the UK National Curriculum 2014;
  topics carry a `years` array restricting which year groups see them.
- Errors for bad user input should be thrown with actionable messages listing the
  valid values (see curriculum-loader for the pattern); `agent.js` catches them and
  exits with code 1.

## Tests

`test/lesson-generator.test.js` is a self-contained runner (no framework) using a
local `test(name, fn)` helper with `assert`. Add new tests to the relevant section
(curriculum-loader / lesson-generator / html-presenter / ai-bridge / end-to-end)
and keep them runnable via plain `node test/lesson-generator.test.js`. Tests must
not require network access or AI CLIs.
