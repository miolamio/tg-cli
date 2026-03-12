# AI Writing Markers in Russian (Маркеры ИИ-текста)

Synthesized from AI cleanup patterns and Russian-specific anti-patterns. Use this checklist to detect and remove signs of AI-generated text.

---

## 1. ChatGPT-isms (Лексические маркеры)

Words and phrases that appear far more frequently in AI-generated Russian text than in human writing. Replace or remove.

| AI marker | Why it's suspicious | Natural replacement |
|-----------|--------------------|--------------------|
| Погружаться / углубляться (в тему) | Calque of "delve" | Изучить / Разобраться / Подробнее о... |
| Ландшафт (угроз, возможностей) | Calque of "landscape" | Ситуация / Обстановка / Сфера |
| Гобелен / полотно (метафора) | Calque of "tapestry" | Разнообразие / Сочетание / Картина |
| Свидетельство / является свидетельством | Calque of "testament" | Доказывает / Говорит о том, что... |
| Подчёркивать (важность) | Calque of "underscore" | Показывает / Напоминает |
| Ключевой / поворотный (момент) | Calque of "pivotal/key" | Важный / Решающий |
| Служить чем-то / являться чем-то | Calque of "serve as" | Быть / (опустить глагол) |
| Воспитывать / способствовать | Calque of "foster" | Развивать / Поддерживать / Создавать условия |
| Высвободить / развязать (потенциал) | Calque of "unleash" | Раскрыть / Использовать |
| Обуздать (технологию) | Calque of "harness" | Использовать / Задействовать |
| Навигация (по миру чего-л.) | Calque of "navigating" | Ориентироваться / Разбираться |
| Демонстрировать (в каждом абзаце) | Calque of "showcase" | Показывать / Представлять |
| Более того / К тому же | Calque of "Moreover/Furthermore" | (удалить) или перестроить фразу |
| В заключение | Calque of "In conclusion" | (удалить) или «Итог:» |
| Не только... но и... (в каждом абзаце) | Calque of "Not only... but also..." | Перестроить фразу |

**Rule:** If a word from this table appears once in a long text, it may be acceptable. If it appears 2+ times, or in combination with other markers, it is almost certainly AI-generated and must be replaced.

---

## 2. Structural AI Markers (Структурные маркеры)

Patterns in how the text is organized that betray machine generation.

### Rule of three
AI forces ideas into groups of three to appear comprehensive:
- «инновации, качество и надёжность»
- «быстрый, удобный и эффективный»
- Three bullet points per section, exactly

**Fix:** If the grouping of three is arbitrary, reduce to what's relevant or expand to actual count.

### Synonym cycling (элегантная вариация)
AI avoids repeating a word by cycling through synonyms, even when the same word is correct:
- «продукт» → «решение» → «инструмент» → «платформа» (for the same thing)
- «пользователь» → «клиент» → «человек» → «специалист» (for the same person)

**Fix:** Use one term consistently. Synonym variation for the same concept is a stronger AI marker than repetition.

### Em dash overuse
AI uses em dashes more than humans, mimicking "punchy" writing:
- «Наш продукт — это не просто инструмент — это революция — и она уже здесь.»

**Fix:** Replace most em dashes with commas, periods, or restructure. One em dash per paragraph is a reasonable ceiling.

### Bold overuse
AI mechanically emphasizes words with **bold**:
- Every list item starts with a **Bold Header:**
- Key terms bolded 5+ times per paragraph

**Fix:** Remove most bold. Reserve for truly important terms, not mechanical emphasis.

### Inline-header vertical lists
AI structures information as bold-header-colon lists:
```
**Преимущество 1:** описание
**Преимущество 2:** описание
**Преимущество 3:** описание
```

**Fix:** Convert to flowing prose, or use proper list markers without inline bold headers.

### Identical section structure
Every section follows the same template:
- Introduction sentence → 3 bullet points → summary sentence
- Or: Definition → Advantages → Challenges → Future outlook

**Fix:** Vary section structure. Some sections should be longer, some shorter. Some need lists, others work as prose.

---

## 3. Tone Markers (Маркеры тона)

### Sycophancy
Overly positive, people-pleasing language:
- «Отличный вопрос!»
- «Вы абсолютно правы!»
- «Это действительно важная тема.»
- Generic positive conclusions: «Будущее выглядит многообещающим.»

**Fix:** Delete. If a positive assessment is needed, make it specific and earned.

### Collaborative artifacts
Traces of chatbot dialogue left in text:
- «Надеюсь, это поможет!»
- «Если у вас есть вопросы, не стесняйтесь спрашивать.»
- «Давайте рассмотрим это подробнее.»
- «Конечно!» / «Разумеется!» at the start

**Fix:** Delete entirely. These are conversation artifacts, not content.

### Undue emphasis on significance
AI puffs up importance of mundane things:
- «Это стало поворотным моментом в истории...»
- «...что подчёркивает важность данного подхода»
- «...играет ключевую роль в формировании...»
- «...является свидетельством приверженности...»

**Fix:** State the fact. Let the reader judge its significance.

### Hedging overload
Over-qualifying every statement:
- «Возможно, можно было бы предположить, что...»
- «В определённой степени это потенциально может...»

**Fix:** Be direct. «Это работает» or «Это не работает».

### Generic positive conclusions
AI wraps up with vague optimism:
- «Перспективы развития выглядят многообещающе.»
- «Впереди нас ждут захватывающие возможности.»
- «Это открывает новые горизонты.»

**Fix:** End with a concrete fact, specific next step, or just stop. No ceremonial conclusions.

---

## 4. Russian-Specific Amplifiers (Русские усилители ИИ-стиля)

These are problems that exist in human Russian writing too, but AI amplifies them dramatically.

### Bureaucratese as AI amplifier
AI gravitates toward official-sounding constructions:
- «данный» вместо «этот»
- «является» вместо тире или «это»
- «осуществляется» вместо конкретного глагола
- «в целях» вместо «чтобы»
- «в связи с» вместо «из-за» или «потому что»
- «в рамках» вместо «при» или «во время»

**Fix:** See `informational-style.md` for complete bureaucratese replacement table.

### Nominalizations as AI signature
AI hides action behind nouns more aggressively than human writers:
- «Осуществление внедрения инновационных решений» (three nominalizations!)
- «Обеспечение процесса оптимизации»
- «Проведение мероприятий по повышению»

**Fix:** Find the hidden verb and rebuild the sentence around it. «Мы внедрили» is always better than «было осуществлено внедрение».

### Excessive pronouns
AI copies English pronoun patterns into Russian, where they're unnatural:
- «Вы можете использовать вашу учётную запись для входа в ваш личный кабинет»

**Fix:** Drop pronouns where context makes ownership clear: «Используйте учётную запись для входа в личный кабинет.»

---

## 5. Close Synonym Clusters (Кучи близких синонимов)

AI piles up near-synonyms to appear thorough and balanced. Humans pick one strong word.

### Detection

| AI-style synonym cluster | Human version |
|--------------------------|--------------|
| быстро, точно и пунктуально | за полчаса |
| мучается и страдает | страдает |
| аккуратный и вдумчивый | вдумчивый |
| долгого и нудного редактирования | нудного редактирования |
| ясности и точности | точности |
| постоянного, всеобъемлющего и непреходящего | постоянного |
| коротким, лаконичным, сухим, неэмоциональным и сдержанным | сухим и сдержанным |

**Rule:** If words in a list are close in meaning, keep the strongest. Delete the rest.

**Exception:** Keep synonyms that are genuinely different categories (e.g., «имена, даты и статистику» — three distinct data types).

### Overlap with rule-of-three

Synonym clusters often combine with the rule-of-three pattern. AI creates exactly three near-synonyms grouped together: «инновации, качество и надёжность» — none of which carry specific meaning. This double-pattern (synonym cluster + rule of three) is an extremely strong AI marker.

---

## 6. Pretentious Word Overuse (Избыток зауми)

AI-generated Russian uses complex borrowed words at 2–3x the rate of human writing. See `pretentious-words.md` for the full replacement table.

### Quick markers

If you see multiple words from this list in a single sentence, it needs a full rewrite:

| AI-heavy | Human |
|----------|-------|
| имплементация инновационных решений для оптимизации | внедрили новые решения, чтобы работать быстрее |
| трансформация парадигмы коммуникации | изменили подход к общению |
| верификация детализированной концепции | проверили, что идея работает |
| систематизация и унификация процессов | упорядочили процессы |

**Detection rule:** Read the sentence aloud. Would you say this to a colleague over coffee? If not, simplify. See `pretentious-words.md` for the complete «заумно → просто» table.

---

## 7. Euphemism Overuse (Избыток эвфемизмов)

AI text softens everything. Problems become "challenges", failures become "areas for improvement", crises become "temporary difficulties". This is both an AI marker and a style problem.

| AI-soft | Direct |
|---------|--------|
| Определённые сложности | Серьёзные проблемы |
| Неоднозначный результат | Провал |
| Не соответствует ожиданиям | Плохая работа |
| Оптимизация штата | Увольнения |
| Корректировка ожиданий | Не получилось |

**Rule:** If the reader can't tell there's a problem after reading the sentence, the euphemism must go. See `informational-style.md` section 6 for the complete euphemism table.

---

## Quick Detection Checklist

Read the text and count. If you find 3+ of these, the text needs heavy editing:

- [ ] ChatGPT-ism words (from table in section 1)
- [ ] Rule-of-three groupings (2+ instances)
- [ ] Bold-header-colon lists
- [ ] Every paragraph same length (within ~10%)
- [ ] No first-person voice, all neutral reporting
- [ ] Generic positive conclusion
- [ ] Bureaucratese density (данный, является, осуществляется)
- [ ] Synonym cycling for the same concept
- [ ] Em dashes in every other sentence
- [ ] Hedging phrases stacked together
- [ ] Close synonym clusters (section 5) — near-synonyms piled in lists
- [ ] Pretentious word density (section 6) — 3+ borrowed words per sentence
- [ ] Euphemism overuse (section 7) — problems softened beyond recognition
- [ ] Transitional words at every paragraph start (во-первых, далее, более того)
- [ ] Unfounded claims (всё больше, в последнее время, стремительно)
