# UK Primary Lesson Planning System

An AI-powered lesson planning tool for **primary school teachers** (KS1 & KS2, Years 1–6). Plans lessons against the **UK National Curriculum 2014** and outputs a professional **HTML presentation** ready for classroom display — no PowerPoint required.

---

## Screenshots

| Slide | Preview |
|---|---|
| Title slide | ![Title slide — Maths Year 2 Fractions](https://github.com/user-attachments/assets/4b9c7c5e-cccb-4c9f-97c9-bd67be90cad3) |
| WALT | ![WALT slide](https://github.com/user-attachments/assets/5717981c-f810-4469-9892-a7e79b2d010a) |
| WILF (success criteria) | ![WILF slide](https://github.com/user-attachments/assets/c8c1a7e3-38f3-4af3-a6d7-3909e09f4fb3) |
| Key Vocabulary cards | ![Key Vocabulary slide](https://github.com/user-attachments/assets/6d54aa21-5879-49d2-96bd-9c5f7ed8d86c) |
| Independent Practice (★/★★/★★★) | ![Independent Practice — differentiation tiers](https://github.com/user-attachments/assets/5eb4e4b1-a983-43eb-8a43-7acfceaf1016) |

---

## Features

- 🏫 **UK National Curriculum 2014** — authentic objectives, key vocabulary and mastery indicators for every topic
- 📚 **Maths & Literacy** across **KS1** (Years 1–2) and **KS2** (Years 3–6)
- 📋 **Structured lesson format** using the `skills/lesson-structure.json` file:
  - **WALT** — We Are Learning To
  - **WILF** — What I'm Looking For (success criteria / mastery check)
  - **Key Vocabulary** — subject-specific terms with definitions
  - **Starter** — retrieval activity (10 min)
  - **Main Teaching** — direct instruction points (15 min)
  - **Guided Practice** — worked examples (10 min)
  - **Independent Practice** — three differentiation tiers: ★ Developing / ★★ Expected / ★★★ Mastery (15 min)
  - **Mastery Check** — exit ticket questions (5 min)
  - **Plenary** — consolidation and reflection (5 min)
  - **Teacher Notes** — SEN / EAL / Gifted & Talented differentiation strategies and assessment strategies on a final slide
- 🤖 **AI assistant integration** — enriches lesson content via:
  - **GitHub Copilot CLI** (`gh copilot suggest`)
  - **OpenCode CLI** (`opencode`)
  - Falls back gracefully to curriculum template content if neither is available
- 🖥️ **Self-contained HTML presentations** — no internet, no dependencies, works in any browser
  - Keyboard navigation (← → arrow keys)
  - Progress dot indicators
  - Print-friendly (each slide becomes a page)
- 🎨 **Colour-coded slides** — each lesson phase has its own colour
- 🔒 **XSS-safe** — all user input is HTML-escaped before rendering

---

## Requirements

- **Node.js 18+** (tested on Node.js 24)
- Optional AI CLI (for AI-enriched content):
  - [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli/about-github-copilot-in-the-cli): `gh extension install github/gh-copilot`
  - [OpenCode CLI](https://opencode.ai): `npm install -g opencode-ai`

---

## Quick Start

```bash
# Clone and enter the repo
git clone https://github.com/kianbbbb/LessonPlanningSystem.git
cd LessonPlanningSystem

# Run the interactive agent
node bin/plan-lesson.js
```

The agent will prompt you for:
1. Subject (Maths / Literacy)
2. Year group (Year 1 – Year 6)
3. Topic (from a list derived from the curriculum, or enter your own)
4. Class name (optional)
5. Lesson duration (60 or 45 minutes)
6. Whether to use an AI assistant (if available)

The HTML presentation is saved to `output/` and can be opened in any browser.

---

## Non-interactive (CLI flags)

```bash
# Maths — Year 2 — Fractions — class 2B — no AI
node bin/plan-lesson.js --subject maths --year "Year 2" --topic "Fractions" --class 2B --no-ai

# Literacy — Year 5 — Persuasive Writing — 45 min lesson — use AI
node bin/plan-lesson.js --subject literacy --year "Year 5" --topic "Persuasive Writing" --duration 45 --ai

# Install globally and use the short command
npm install -g .
plan-lesson --subject maths --year "Year 4" --topic "Multiplication"

# Show all available flags
node bin/plan-lesson.js --help

# Show the version number
node bin/plan-lesson.js --version
```

Flags: `--subject`, `--year`, `--topic`, `--class` (optional), `--duration`
(45 or 60, default 60), `--ai` / `--no-ai`, `--help` / `-h` and `--version`.

---

## Supported Curriculum

### Maths — KS1 (Years 1–2)
| Strand | Topics |
|---|---|
| Number and Place Value | Counting and Place Value, Addition and Subtraction within 20 |
| Addition and Subtraction | Addition and Subtraction within 100 |
| Multiplication and Division | Multiplication and Division (×2, ×5, ×10) |
| Fractions | Fractions (halves, quarters, thirds) |
| Measurement | Length and Height |
| Geometry | 2D and 3D Shapes |

### Maths — KS2 (Years 3–6)
| Strand | Topics |
|---|---|
| Number and Place Value | Place Value (up to 10,000,000) |
| Addition, Subtraction, Multiplication, Division | Written methods, Long multiplication/division |
| Fractions, Decimals and Percentages | Equivalent fractions, FDP conversions |
| Ratio and Proportion | Sharing in ratio, Scaling (Year 6) |
| Algebra | Formulae, Sequences, Equations (Year 6) |
| Geometry | Angles, Properties of shape |
| Statistics | Bar charts, Line graphs, Mean |

### Literacy — KS1 (Years 1–2)
| Strand | Topics |
|---|---|
| Spoken Language | Speaking and Listening |
| Word Reading | Phonics – Decoding, Fluency and Comprehension |
| Reading | Reading Comprehension |
| Writing – Transcription | Spelling, Handwriting |
| Writing – Composition | Narrative Writing, Non-fiction Writing |
| Writing – Grammar | Sentence Grammar (capital letters, full stops, conjunctions) |

### Literacy — KS2 (Years 3–6)
| Strand | Topics |
|---|---|
| Spoken Language | Oracy and Presentation |
| Word Reading | Word Reading and Vocabulary |
| Reading | Reading for Meaning (Y3–4), Critical Reading (Y5–6) |
| Writing – Transcription | Spelling (morphology, etymology, homophones) |
| Writing – Composition | Narrative Writing, Persuasive Writing, Poetry |
| Writing – Grammar | Fronted adverbials, Relative clauses, Direct speech, Colons/semi-colons |

---

## Project Structure

```
LessonPlanningSystem/
├── bin/
│   └── plan-lesson.js          # Executable CLI entry point
├── src/
│   ├── agent.js                # Interactive CLI orchestrator
│   ├── curriculum-loader.js    # Loads & queries curriculum JSON data
│   ├── lesson-generator.js     # Builds structured lesson plan object
│   ├── html-presenter.js       # Renders lesson plan to HTML presentation
│   └── ai-bridge.js            # GitHub Copilot / OpenCode CLI integration
├── curriculum/
│   ├── maths/
│   │   ├── ks1.json            # KS1 Maths (Years 1–2)
│   │   └── ks2.json            # KS2 Maths (Years 3–6)
│   └── literacy/
│       ├── ks1.json            # KS1 Literacy (Years 1–2)
│       └── ks2.json            # KS2 Literacy (Years 3–6)
├── skills/
│   └── lesson-structure.json   # Lesson component definitions (WALT, WILF, etc.)
├── output/                     # Generated HTML lesson plans (git-ignored)
├── test/
│   └── lesson-generator.test.js
└── package.json
```

---

## Skills File

The `skills/lesson-structure.json` file defines the structure of every lesson plan. You can edit it to:

- Add, remove or reorder lesson phases
- Change phase durations in `timingGuidance`
- Update differentiation strategy descriptions
- Modify slide colours per phase

```json
{
  "components": [
    { "id": "walt",    "label": "WALT",    "fullName": "We Are Learning To", ... },
    { "id": "wilf",    "label": "WILF",    "fullName": "What I'm Looking For", ... },
    { "id": "starter", "label": "Starter", "timing": 10, ... }
  ],
  "timingGuidance": {
    "60min": { "starter": 10, "mainTeaching": 15, ... },
    "45min": { "starter": 5,  "mainTeaching": 10, ... }
  }
}
```

---

## Running Tests

```bash
npm test
```

42 tests covering curriculum loading, lesson generation, HTML rendering and AI bridge parsing.

---

## AI Integration

When an AI CLI is available, the agent sends a structured prompt containing:
- The curriculum objective (WALT)
- Success criteria (WILF)
- Key vocabulary list
- All lesson phase descriptions

The AI fills in the specific content for each phase. The response is parsed as JSON and merged into the presentation. If the AI is unavailable or returns an error, all content falls back to the rich template data from the curriculum files.

### Adding your own AI CLI

Implement your CLI as a program that reads a prompt from stdin and writes a JSON response to stdout matching:

```json
{
  "starter": "...",
  "main-teaching": "...",
  "guided-practice": "...",
  "independent-practice": "Developing: ...\nExpected: ...\nMastery: ...",
  "mastery-check": "...",
  "plenary": "..."
}
```

Then update `src/ai-bridge.js` to call your tool.

---

## Licence

MIT
