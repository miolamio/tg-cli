# Russian Typography Rules

## Quotation Marks

Primary: guillemets «ёлочки». Nested: German-style „лапки".

Correct: He said: "This is important" translates to: Он сказал: «Это важно».

For nested quotes: «Он сказал: „Это важно"».

Use Russian quotation marks in all Russian text. Never use English double quotes ("\u2026") or straight quotes ("...").

### Quotation marks around English text within Russian

When an English phrase is kept in Latin script inside a Russian sentence, wrap it in «ёлочки», not English quotes:

| Bad | Good |
|-----|------|
| Спросите Claude: "When would you use this?" | Спросите Claude: «When would you use this?» |
| Документ называется "Skills API Quickstart" | Документ называется «Skills API Quickstart» |

Exception: inside code blocks and inline `code`, use straight quotes as required by the programming language.

## Dashes: Three Types

Russian uses three distinct characters. Never confuse them.

**Hyphen (-, дефис):** compound words and particles only.
Examples: кто-то, из-за, по-русски, всё-таки, как-нибудь.

**En dash (–, короткое тире):** numeric ranges, without spaces.
Examples: 10–15 минут, 2020–2025, стр. 40–45, понедельник–пятница.

**Em dash (—, длинное тире):** everything else. Always with spaces on both sides.
Examples:
- Definitions: Автоматизация — ключ к эффективности.
- Parenthetical: Навыки — один из самых мощных способов — позволяют настроить Claude.
- Subject–predicate replacement: Компания — лидер рынка.
- Before clauses: Мы завершили сделку — это позволит расширить линейку.

CRITICAL: always use proper Unicode characters in translation output.
- Em dash: — (U+2014), not double hyphen (--)
- En dash: – (U+2013), not single hyphen (-)
- Never use double hyphen (--) as a substitute for any type of dash.

### Dashes in numeric ranges — consistency

All ranges in a document must use the same format. Choose en dash without spaces:

| Bad | Good |
|-----|------|
| 15-30 минут | 15–30 минут |
| 1-500 символов | 1–500 символов |
| 2-3 сценария | 2–3 сценария |
| страницы 10 - 20 | страницы 10–20 |

## Lists and Enumerations

Rules based on «Полный академический справочник» and «Справочник издателя и автора».

### Core principle

The marker type determines capitalization and end punctuation. There are two systems, and **they must never be mixed within a single list**:

**System 1: Uppercase start, period at end.**
Used when items are marked with a number + period (1.) or uppercase letter + period (А.).
Each item is treated as a separate sentence.

```
1. Каждый элемент начинается с заглавной буквы.
2. В конце каждого элемента ставится точка.
3. Это относится и к коротким пунктам.
```

**System 2: Lowercase start, semicolon between items, period at the end of the last item.**
Used when items are marked with a number + parenthesis (1)), lowercase letter + parenthesis (а)), dash (—), or bullet marker.

```
Навыки бывают трёх типов:
— автономные, не требующие внешних инструментов;
— связанные с MCP-серверами;
— комбинированные, сочетающие оба подхода.
```

### Simplified rules for Markdown bullet lists

Since Markdown uses `- ` (dash) or `* ` (asterisk) as markers, apply these rules:

**Items are complete sentences** → capital letter, period at end of each:

```
- Навык загружается автоматически.
- Claude следует инструкциям из SKILL.md.
- Результат сохраняется в выходной файл.
```

**Items are phrases or fragments** → lowercase, semicolon, period at the very end:

```
Для создания навыка потребуется:
- файл SKILL.md с YAML-шапкой;
- описание сценариев использования;
- примеры входных и выходных данных.
```

**Items are single words or very short noun phrases** → lowercase, comma or semicolon, period at the very end:

```
Поддерживаемые форматы:
- PDF,
- DOCX,
- PPTX,
- XLSX.
```

### Common errors to avoid

| Error | Why it's wrong | How to fix |
|-------|---------------|------------|
| Uppercase items without periods | Incomplete System 1 | Add periods |
| Lowercase items with periods | Hybrid system | Use semicolons, period only at end |
| No punctuation at all | Missing standard | Choose a system and apply consistently |
| Mixing complete sentences and noun phrases | Broken parallelism | Make all items the same type |

### Special cases

**Mixed list with an internal full sentence.** Even if a lowercase item contains a full sentence inside, the item still ends with semicolon (§ 166 of «Полный академический справочник»):

```
Состав подписи зависит от типа иллюстрации:
а) только порядковый номер. Так делается, когда содержание ясно из самой иллюстрации;
б) сокращение «рис.» и порядковый номер;
в) тема изображения без номера.
```

**"И т. д.", "и др.", "и т. п."** at the end of a list are not placed on a separate line — they stay at the end of the previous item:

```
- природные каменные;
- керамические;
- лесные материалы и др.
```

### What NOT to do

- Do not mix systems: all items in one list must follow the same punctuation pattern.
- Do not put a period after items that start with lowercase (except the very last item).
- Do not leave items without any end punctuation — every item must have either a comma, semicolon, or period.
- Do not use a period after every item in a lowercase list — that is the single most common error.

### Numbered lists for procedures

For step-by-step instructions (шаги 1–N), use numbered lists. Each step:
- Either a complete sentence with a period;
- Or a brief command without a period — but then ALL steps must be the same.

If a step starts with an imperative verb ("Проверьте", "Сравните", "Откройте"), adding a period at the end makes the text cleaner and more readable on screen.

## Colon Before a List

Use a colon when the introductory phrase directly leads into the list ("включает:", "содержит:", "шаги:").

If the list doesn't grammatically flow from the introduction, use a period and start the list as a separate block.

## Numbers and Units

- Thousands separator: non-breaking space (1 000 000, not 1,000,000)
- Decimal separator: comma (3,14 not 3.14)
- Space before units: 50 %, 100 кг, 25 °C
- Currency after number with space: 100 $, 50 EUR, 1 000 руб.
- Ordinal numbers: use Russian endings with hyphen — 1-й, 2-я, 3-е, 5-го

## Dates

Full format: 15 января 2025 года.

Short format: 15.01.2025.

Never use American format (01/15/2025).
Never use slashes for Russian text.

Months are not capitalized in Russian: январь, февраль, март.

## Abbreviations

Common Russian abbreviations:
- т. е. (то есть)
- т. д. (так далее)
- т. п. (тому подобное)
- и др. (и другие)
- и пр. (и прочее)
- напр. (например)
- см. (смотри)
- ср. (сравни)

Each part separated by a non-breaking space. Do not merge into "т.е." or "т.д."

## Spaces

- Non-breaking space between number and unit: 5 кг, 100 %
- Non-breaking space between initials and surname: А. С. Пушкин
- Non-breaking space after single-letter prepositions: в, с, к, о, у
- No space before colon, semicolon, exclamation mark, question mark
- Space after all punctuation marks except opening brackets and quotes

## Commas in Set Phrases

Machine-generated text often drops necessary Russian commas. Watch for:

| Bad (missing comma) | Good |
|---------------------|------|
| при условии что | при условии, что |
| несмотря на то что | несмотря на то, что |
| в связи с тем что | в связи с тем, что |
| для того чтобы | для того, чтобы |

## Special Characters

- Use proper Russian letters, not Latin lookalikes (а, е, о, р, с, х in Russian vs a, e, o, p, c, x in English)
- Ellipsis: three dots (...) with space before next word
- Number sign with space: № 5, § 3

## The Letter «Ё»

Use «ё» consistently throughout the text. This is the standard for professional publishing.

| Bad | Good |
|-----|------|
| еще | ещё |
| все (when meaning "всё") | всё |
| ее (when meaning "её") | её |
| прием | приём |
| елочки | ёлочки |
