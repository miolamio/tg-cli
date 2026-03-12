# Glossary Strategy and Terminology Consistency

## Why This Matters

Inconsistent terminology is one of the strongest markers of machine translation. When the same concept is called "коннектор" in one paragraph, "интеграция" in the next, and "подключение" in the third — without explanation — the reader's trust drops immediately.

A human translator maintains a mental glossary. A machine translator picks whatever synonym scores highest at each occurrence. The fix is to build and maintain a glossary.

## When to Build a Glossary

Build a glossary when translating:
- Documents longer than 2 pages;
- Documents with domain-specific terminology (IT, legal, medical, financial);
- Series of related documents (a documentation set, a course, a product guide);
- Texts where the same English term appears 5+ times.

## How to Build the Glossary

### Step 1: Extract key terms

Before translating, scan the source text for:
- Repeated domain terms (skill, connector, workflow, trigger, workspace);
- Terms with multiple possible translations;
- Product-specific names and UI labels;
- Abbreviations and acronyms.

### Step 2: Choose one Russian equivalent per term

For each term, decide:

| English | Preferred Russian | Alternatives (do NOT use) | Notes |
|---------|------------------|--------------------------|-------|
| skill | навык | скилл, умение | «скилл» — разговорный англицизм |
| connector | коннектор | подключение, интеграция | Если UI показывает "Connector", оставляем «коннектор» |
| workflow | рабочий процесс | воркфлоу | В формальном тексте |
| trigger | триггер | условие запуска | «триггер» устоялся в IT |
| workspace | рабочее пространство | воркспейс | В продуктовых текстах Claude допустимо «проект» |
| frontmatter | YAML-шапка | преамбула, заголовок | «Преамбула» — юридический термин |
| deploy | развернуть | задеплоить | Формальный текст |
| publish | опубликовать | выложить, зарелизить | |
| distribution | публикация | распространение | В контексте навыков/плагинов |

### Step 3: Apply consistently

- Use the chosen term every time the concept appears;
- If you need to introduce a synonym for stylistic variety, do it explicitly: "коннекторы (также называемые интеграциями)";
- After the first explicit introduction, use only the primary term.

## Mixed-Language Decisions

For each term, decide which of these categories it falls into:

### Category A: Always in English (Latin script)
- Product names: Claude, MCP, Docker, GitHub, VS Code
- Technical identifiers: API, SDK, CLI, JSON, YAML, HTTP
- Code elements: `SKILL.md`, `scripts/`, `pip install`
- UI labels when the product has no Russian localization

### Category B: Always in Russian
- Generic concepts with good Russian equivalents: навык, задача, рабочий процесс, публикация, развёртывание
- Actions: настроить, запустить, проверить, обновить

### Category C: English on first mention, Russian thereafter
- Terms that need introduction: "Frontmatter (YAML-шапка) — это блок метаданных..." → далее только «YAML-шапка»

### Category D: English term in Latin + Russian gloss
- UI menu paths: Settings (Настройки) > Extensions (Расширения) > Claude
- Official document titles: «Skills API Quickstart (краткое руководство по API навыков)»

## Glossary Template for Common Skill/Claude Documentation

| English | Russian | Category | Notes |
|---------|---------|----------|-------|
| skill | навык | B | |
| SKILL.md | `SKILL.md` | A | Always code-formatted |
| frontmatter | YAML-шапка | C | Introduce on first use |
| description field | поле описания | B | |
| trigger | триггер | B | Established in IT |
| workspace | рабочее пространство | B | |
| MCP server | MCP-сервер | A+B hybrid | MCP stays Latin, «сервер» in Cyrillic |
| connector | коннектор | B | |
| tool | инструмент | B | In Claude context |
| progressive disclosure | постепенная подача | C | Introduce with English on first use |
| composability | сочетаемость | B | |
| distribution | публикация | B | In context of publishing skills |
| deploy | развернуть | B | |
| bundle | комплект / набор | B | |
| workflow | рабочий процесс | B | |
| reference file | справочный файл | B | |
| asset | ресурс | B | |
| kebab-case | kebab-case | A | Technical formatting term |

## Handling Terminology Drift

If during translation you realize a term needs a different translation than initially chosen:
1. Go back and update ALL previous instances;
2. Do not leave mixed terminology "for later" — it is the #1 source of quality regression;
3. If the document is too long to re-scan manually, use find-and-replace after completing the draft.

## What NOT to Do

- Do not alternate synonyms for the same technical term "for variety" — terminology consistency trumps stylistic variation;
- Do not transliterate when a Russian equivalent exists: «скилл» → «навык», «воркфлоу» → «рабочий процесс»;
- Do not translate established English terms that have no good Russian equivalent: API, Docker, JSON, MCP;
- Do not mix Latin and Cyrillic scripts within a single word: «MCP-сервер» (correct), «МСР-сервер» (wrong).
