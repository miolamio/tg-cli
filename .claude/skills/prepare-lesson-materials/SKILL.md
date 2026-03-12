---
name: prepare-lesson-materials
description: Researches and prepares complete lesson materials for the Claude Code course. Use when told to prepare materials for a specific session/lesson number (e.g., "/prepare-lesson-materials 3"). Takes a lesson number as argument ($ARGUMENTS), researches the topic deeply (official docs, web), generates slides content, FAQ, static visual ideas for slides, and reference guides. After generation, runs RU Editor checks on all text and validates against course personas. FAQ is generated from each persona's perspective.
---

# Prepare Lesson Materials

Researches and produces a complete set of teaching materials for a given session of the course "Claude Code: суперсила для НЕпрограммистов".

## Arguments

`$ARGUMENTS` — lesson number (1-5). Required.

## Session Map

| # | Folder slug | Topic | Demo folder |
|---|-------------|-------|-------------|
| 1 | 01-setup | Установка, настройка, первые задачи | sessions/01-setup/demo/ |
| 2 | 02-context-skills | Контекст и навыки (CLAUDE.md, Skills) | sessions/02-context-skills/demo/ |
| 3 | 03-mcp | MCP — подключение внешних сервисов | sessions/03-mcp/demo/ |
| 4 | 04-agents | Агенты и субагенты (Task Tool, хуки) | sessions/04-agents/demo/ |
| 5 | 05-agent-teams | Agent Teams, оркестрация, n8n | sessions/05-agent-teams/demo/ |

## Key Paths

- **Course outline:** `course-outline.md`
- **Personas:** `slides/personas.md`
- **Slide template (.pen):** `slides/template.pen`
- **Humanizer guide:** `assets/humanizer.md`
- **Session slides output:** `slides/{folder-slug}/slides/`
- **Session reference output:** `slides/{folder-slug}/reference/`
- **Session demos:** `sessions/{folder-slug}/demo/`
- **Existing session materials (for format reference):** `slides/01-setup/`

## Workflow

Execute these 6 phases in order. Use parallel agents where indicated.

### Phase 1 — Gather Context

1. Read `course-outline.md` — extract the block for session `$ARGUMENTS`.
2. Read `slides/personas.md` — load all 5 personas and their testing criteria.
3. Read all `README.md` files inside `sessions/{folder-slug}/demo/*/README.md` — understand demo scenarios.
4. Read all data files in demo subdirectories (CSV, JSON, MD, TXT) — understand what the demos actually work with.
5. Read the existing Session 01 materials for **format reference**:
   - `slides/01-setup/slides/slides-final-content.md` — canonical slide format
   - `slides/01-setup/reference/faq-session-01.md` — canonical FAQ format
   - `slides/01-setup/slides/animation-ideas-agent.md` — canonical visual ideas format (file name is historical; content describes static visual concepts for slides)
6. If materials for this session already exist in `slides/{folder-slug}/`, read them to understand what is already done.

### Phase 2 — Deep Research

Launch 3-4 parallel research agents (Task tool, subagent_type: "general-purpose"):

1. **Official documentation agent** — search Anthropic's official docs, changelog, and Claude Code documentation for features relevant to this session's topic. Use WebSearch and WebFetch.
2. **Community & ecosystem agent** — search for community tutorials, blog posts, real-world examples of the session's topic. Look for common pitfalls, tips, and non-obvious use cases.
3. **Technical details agent** — read the demo data files in depth, understand the scenarios, identify what makes each demo compelling for the audience.
4. **Competitor/context agent** (if relevant) — research how the session's topic compares to alternatives (e.g., for MCP session: compare to other tool integration approaches; for agents: compare to AutoGPT, CrewAI, etc.).

Collect all findings before proceeding.

### Phase 3 — Generate Materials

Launch 4 parallel writing agents (Task tool, subagent_type: "general-purpose"):

#### Agent 1: slides-final-content.md

Create `slides/{folder-slug}/slides/slides-final-content.md`.

Requirements:
- Follow the exact format from Session 01's slides-final-content.md (master slide IDs, structure, formatting conventions).
- Organize into blocks matching the course outline for this session.
- Each slide: master slide type, title, content, speaker notes where needed.
- Include all demos from the session's demo folder as practical slides.
- Target: 35-50 slides.

#### Agent 2: FAQ

Create `slides/{folder-slug}/reference/faq-session-{nn}.md`.

**Critical: persona-driven FAQ.** Structure the FAQ by persona perspective:

```markdown
# FAQ — Занятие N: [Topic]

## Общие вопросы
[5-8 questions anyone would ask]

## Вопросы от Оксаны (аналитик-новичок)
[Questions a non-technical analyst would ask — fears about complexity, practical applicability to her daily reports]

## Вопросы от Андрея (предприниматель)
[Questions about ROI, time investment, cost, practical business value]

## Вопросы от Елены (руководитель дизайн-команды)
[Questions about corporate security, non-programmer accessibility, team applicability]

## Вопросы от Алексея (автоматизатор)
[Advanced questions, edge cases, integration with n8n, limitations, performance]

## Вопросы от Анатолия (маркетолог + ИИ)
[Questions about client-facing use cases, selling as a service, Russian language support]

## Технические вопросы
[Troubleshooting, setup issues, common errors]
```

Each persona section: 5-8 questions with detailed answers. Answers must be specific, not generic.

#### Agent 3: visual-ideas.md (static graphic concepts for slides)

Create `slides/{folder-slug}/slides/visual-ideas.md`.

This file contains **static visual concepts** for slides that benefit from graphic representation rather than bullet points. All slides are static (no animation). The goal: identify 4-8 concepts from this session that are best explained visually (diagrams, schemas, comparisons, metaphors) and describe each as a detailed static composition.

Requirements:
- 4-8 visual concepts for key ideas that are hard to explain with text alone.
- For each concept:
  - **Which slide it replaces or accompanies** (slide number from slides-final-content.md).
  - **Visual layout**: precise description of the composition — what elements, where they are positioned, how they relate to each other. Use ASCII diagrams where helpful.
  - **Color specs**: full hex codes, matching the course palette (#0C0C0E background, #FF6B35 accent, #1A1A1F cards, #FAFAFA text, #5A5A60 secondary, #6BCB77 success, #7EB6FF info, #C084FC intermediate, #FBBF24 highlight).
  - **Typography**: font (Onest for text, JetBrains Mono for code), weight, size for each text element.
  - **Dimensions**: element sizes in px, positioned on a 1920x1080 canvas.
- Types of visuals that work well:
  - **Hierarchies and nesting** (e.g., CLAUDE.md levels, Skill structure).
  - **Before/after comparisons** (split-screen, with vs without).
  - **Process flows** (left-to-right or top-to-bottom pipelines).
  - **Ecosystem maps** (radial layouts, connected nodes).
  - **Metaphor illustrations** (filing cabinet, instruction manual, toolkit).
  - **Data-driven infographics** (tables with visual emphasis, metric cards).
- Reference format: see `slides/01-setup/slides/animation-ideas-agent.md` for layout and specification depth (ignore animation-specific instructions like timing/transitions — focus on the static final frame only).
- Do NOT describe animations, transitions, or timing. Every visual must work as a single static slide.

#### Agent 4: Reference guides

Create 1-3 reference guides in `slides/{folder-slug}/reference/` depending on session topic. Examples:
- Session 2: claude-md-guide.md, skills-guide.md
- Session 3: mcp-setup-guide.md, mcp-servers-catalog.md
- Session 4: agents-guide.md, hooks-reference.md
- Session 5: agent-teams-guide.md, n8n-integration-guide.md

Each guide: practical, hands-on, with examples from the demos.

### Phase 4 — RU Editor Check

After all materials are generated, invoke the **ru-editor** skill on each generated file.

For each file:
1. Read the generated content.
2. Apply ru-editor's three-step workflow (Edit, Self-Reflection, Polish).
3. Focus on:
   - Removing AI markers and ChatGPT-isms.
   - Applying informational style.
   - Fixing typography (dashes, quotes, letter "ё").
   - Ensuring natural, human-sounding Russian.
4. Write the cleaned version back to the file.

Do NOT skip this phase. Course materials must read as if written by an experienced human author.

### Phase 5 — Persona Validation

Read `slides/personas.md` and validate every generated file against all 5 personas.

For each major content file (slides, FAQ, reference guides), run these checks:

| Persona | Check |
|---------|-------|
| **Оксана** (аналитик-новичок) | Can she explain each slide to a colleague? Are technical terms defined? Would she feel lost at any point? |
| **Андрей** (предприниматель) | Does every block answer "зачем мне это"? Is the practical value obvious? Are cost/time implications clear? |
| **Елена** (дизайн-руководитель) | Does anything feel "programmer-only"? Are there examples beyond finance/sales (documents, presentations, feedback)? Would she feel this course is for her? |
| **Алексей** (автоматизатор) | Is there a "hook" for advanced users on basic slides? Are there bonus challenges? Is the "What's new in 2026" content substantive? |
| **Анатолий** (маркетолог + ИИ) | Can he apply or sell each concept to clients? Are the prompt examples strong? Does it work in Russian? |

Write a validation report as comments in each file or as a separate `slides/{folder-slug}/reference/persona-validation.md` file listing:
- Issues found per persona
- Fixes applied
- Remaining trade-offs (e.g., "basic for Алексей but necessary for Оксана — added speaker note with advanced tip")

Apply all fixes to the content files.

### Phase 6 — Final Review

1. Verify all files exist and are non-empty.
2. Check consistency across files (same terminology, same demo references, no contradictions).
3. Report the final deliverable list with line counts.

## Output Deliverables

| File | Location |
|------|----------|
| Slide content | `slides/{folder-slug}/slides/slides-final-content.md` |
| Visual ideas (static graphics) | `slides/{folder-slug}/slides/visual-ideas.md` |
| FAQ (persona-driven) | `slides/{folder-slug}/reference/faq-session-{nn}.md` |
| Reference guide(s) | `slides/{folder-slug}/reference/*.md` |
| Persona validation | `slides/{folder-slug}/reference/persona-validation.md` |

## Quality Standards

- All text in Russian.
- No AI-isms (see `assets/humanizer.md` and ru-editor skill references).
- Specific examples over vague claims.
- Consistent use of letter "ё".
- Proper typography: «ёлочки» for quotes, em dash (—), en dash (–).
- No emojis.
- Every slide tested against 5 personas.
- FAQ answers must be detailed and actionable, not generic.
