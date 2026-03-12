# Informational Style for Editors (Инфостиль для редактуры)

Based on the principles of «Пиши, сокращай» and adapted for editing existing Russian text (not translation).

---

## Core Principle

Care for the reader. Every word must earn its place. If a word can be removed without losing meaning, remove it. If an adjective has no proof behind it, cut it. If a sentence can be shorter, make it shorter.

The goal: **clarity, usefulness, human voice**.

---

## 1. Stop Words (Стоп-слова)

Delete these. They add zero meaning.

### Introductory trash (Вводный мусор)

| Delete | Why |
|--------|-----|
| Как известно, ... | Reader doesn't need you to tell them what's "known" |
| Не секрет, что ... | If it's not a secret, just say it |
| Стоит отметить, что ... | Just note it directly |
| Важно подчеркнуть, что ... | If it's important, say it. Don't announce importance |
| Честно говоря, ... | Implies you're normally dishonest |
| На мой взгляд, ... | Obvious in first-person text, delete |
| В общем, ... | Filler |
| Кстати, ... | Usually irrelevant tangent |
| Более того, ... | AI filler calque of "Moreover" |
| Дополнительно, ... | AI filler calque of "Additionally" |
| В заключение, ... | AI filler calque of "In conclusion" |
| Допустим, ... | Start the example directly |

### Time parasites (Паразиты времени)

These mark the present tense redundantly. Delete.

| Delete | Replace with |
|--------|-------------|
| На сегодняшний день | Сейчас (or delete) |
| В настоящее время | Сейчас (or delete) |
| В наши дни | (delete — it's always "our days") |
| На данный момент | Сейчас |
| На данный момент времени | Сейчас |

### Intensifiers (Усилители)

Words that try to add emphasis but actually weaken the text.

| Weak | Strong |
|------|--------|
| Очень важный | Важный (or explain WHY) |
| Крайне необходимый | Необходимый (or explain WHY) |
| Абсолютно уникальный | Уникальный (or describe HOW) |
| Весьма значительный | Значительный (or give numbers) |

**Rule:** If removing the intensifier changes nothing, remove it.

---

## 2. Evaluations (Оценки)

Subjective adjectives without proof. The biggest quality killer in Russian text.

### The principle: show, don't tell

| Empty evaluation | Question to ask | Example replacement |
|-----------------|-----------------|---------------------|
| Качественный | Из чего сделан? Сколько служит? | Из стали / Работает 10 лет |
| Эффективный | Сколько экономит? Какой результат? | Экономит 20% времени |
| Уникальный | Чем отличается? | Единственный в своём роде |
| Удобный | Что именно удобно? | Помещается в карман / Кнопка под большим пальцем |
| Профессиональный | Какой опыт? Какие проекты? | 10 лет стажа, 50 проектов |
| Успешный | В чём успех? | Прибыльный / Популярный |
| Инновационный | Что нового? | Первый на рынке с функцией X |
| Передовой | В чём передовой? | Использует технологию Y (с 2024 года) |
| Широкий спектр | Сколько? | 50 видов / Всё от А до Я |
| Захватывающий | Почему захватывает? | (опишите конкретно) |

**Rule:** If facts unavailable, delete the evaluation entirely. «Мы делаем обувь» лучше, чем «Мы делаем качественную обувь».

### Indefinite weasel words (Неопределённые)

| Vague | Specific |
|-------|---------|
| Более 100 | 100 / 120 / «сотня» |
| Около 5 | 5 |
| Порядка 1000 | 1000 |
| Различные | (перечислите) |
| Некоторые | (назовите) |
| Ряд преимуществ | (перечислите) |
| Многие эксперты | (назовите хотя бы одного) |

---

## 3. Syntax and Action (Синтаксис и действие)

### Verbal nouns → verbs

Russian loves verbs. Nominalizations kill the text.

| Dead (nominalization) | Alive (verb) |
|----------------------|-------------|
| Осуществление продажи | Продаём |
| Производить ремонт | Ремонтируем |
| Оказание поддержки | Помогаем |
| Обеспечение безопасности | Защищаем |
| Проведение анализа | Анализируем |
| Принятие решения | Решаем |
| Предоставление доступа | Даём доступ |
| Осуществление контроля | Контролируем |

**Detection rule:** If you see «осуществление / проведение / обеспечение / оказание + noun», a verb is hiding. Extract it.

### Passive → active

| Passive | Active |
|---------|--------|
| Было принято решение | Мы решили |
| Ошибка была допущена | Допустили ошибку |
| Данные были получены | Получили данные |
| Функция была добавлена | Добавили функцию |
| Работа была выполнена | Сделали |

**Exception:** Passive is OK when the agent is unknown, irrelevant, or the state matters more: «Магазин открыт», «Дом построен в 1905 году».

### Participle chains

Heavy structures that clutter Russian text.

| Heavy | Light |
|-------|-------|
| Человек, читающий книгу, сидящий на скамейке | Человек сидит на скамейке и читает книгу |
| Документ, содержащий информацию, необходимую для... | В документе — всё, что нужно для... |

**Rule:** If a participle chain is longer than 3 words, rewrite as a separate clause or sentence.

### «Который» nesting

| Bad (nested) | Good (flat) |
|-------------|------------|
| Продукт, который создан командой, которая работает в компании, которая... | Продукт создала команда из компании X. |

**Rule:** Maximum one «который» per sentence. Two is a warning. Three is an error.

---

## 4. Bureaucratese (Канцелярит)

Official-sounding words that make text feel like a government memo.

| Avoid | Use instead |
|-------|-------------|
| Данный | Этот |
| Является | — (тире) или «это» |
| Представляет собой | — (тире) или «это» |
| Осуществляется | (конкретный глагол) |
| В целях | Чтобы |
| В связи с | Из-за / Потому что |
| Во избежание | Чтобы не |
| В рамках | При / Во время / На |
| Вышеуказанный | Этот / Упомянутый |
| Нижеследующий | Следующий |
| Надлежащий | Нужный / Правильный |
| В соответствии с | По / Согласно |
| По причине того, что | Потому что |
| В случае если | Если |

---

## 5. Cliches and Stamps (Штампы)

Corporate boilerplate that could describe any company.

| Stamp | Why it's bad | What to do |
|-------|-------------|-----------|
| Динамично развивающаяся компания | Describes every company | Name specific growth: «выросли в 3 раза за год» |
| Индивидуальный подход | Meaningless | Describe what's individual: «менеджер на связи 24/7» |
| Широкий спектр услуг | Vague | List the services |
| Команда профессионалов | Every team says this | «Работаем 10 лет, сделали 50 проектов» |
| Высокое качество | Unmeasurable | Describe quality: materials, tests, guarantees |
| В кратчайшие сроки | How short? | «За 2 дня» / «В течение часа» |
| Ваш надёжный партнёр | Trust cliché | Show reliability: reviews, uptime, guarantees |
| Мы стремимся к совершенству | Empty | Delete or replace with specific goals |

---

## 6. Euphemisms (Эвфемизмы)

Euphemisms hide unpleasant truths behind soft words. AI text and corporate writing love to smooth out corners. The result: reader doesn't understand what actually happened.

**Principle:** «Мямлить умеют все. А говорить честно, прямо и уважительно — единицы.»

### Common euphemisms → direct replacements

| Эвфемизм | Прямо |
|----------|-------|
| Трудность, затруднение | Проблема |
| Экономическая нестабильность | Кризис |
| Инцидент | Авария |
| Неоднозначный результат | Провал / Плохой результат |
| Не соответствует ожиданиям | Плохая работа |
| Область развития | Недостатки |
| Возможные меры | Увольнение / Штраф / Понижение |
| Повышенное внимание | Работай над этим |
| Организационные проблемы | Бардак / Провал руководства |
| Непредвиденные обстоятельства | Мы не подготовились |
| Продуктивный диалог | Переговоры |
| Делаем всё возможное | Не знаем, что делать |
| Временно приостановить | Остановить |
| Нецелевое использование средств | Растрата |

### Corporate euphemism patterns

AI amplifies these patterns from corporate culture:

| Euphemism pattern | What it hides |
|-------------------|--------------|
| «Мы расстаёмся с сотрудником» | Увольняем |
| «Оптимизация штата» | Массовые увольнения |
| «Пересмотр стратегических приоритетов» | Мы ошиблись |
| «Определённые сложности» | Серьёзные проблемы |
| «Корректировка ожиданий» | Не получилось |

**Rule:** If the text softens a problem to the point where the reader can't tell there IS a problem, replace the euphemism with a direct statement. Criticism of work is fine; criticism of a person is not.

---

## 7. Unfounded Claims (Брехня)

Vague assertions that are technically not lies but carry no verifiable truth. AI produces these constantly — broad generalizations presented as facts without evidence.

**Principle:** «Правда сильнее брехни. Если нет фактов — удалите утверждение.»

### Markers of unfounded claims

| Marker | What's wrong | Fix |
|--------|-------------|-----|
| Всё больше людей... | How many? Growth rate? | Cite data or delete |
| В последнее время... | When exactly? | Give a date or delete |
| Судя по всему... | Based on what? | State the source or delete |
| Стремительно набирает популярность... | How fast? Measured how? | Numbers or delete |
| Едва ли найдётся человек, которому... | Survey? Data? | Replace with actual stat |
| Кто, как не мы, знает... | Prove it | State credentials or delete |
| Многие эксперты считают... | Name at least one | Quote a specific expert |
| Не секрет, что... | Then just say it | Delete the preamble |
| Пожалуй, лучший... | By what measure? | State the measure or delete |
| Всем известно, что... | Apparently not | Delete and state the fact |

### The substitution test

If you can replace the subject of a «брехня» sentence with anything and it still sounds plausible, the sentence is empty:

- «В последнее время всё больше внимания общественности приковано к...»
  - ...глобальному потеплению
  - ...разведению кроликов
  - ...зарплатам чиновников

All three work equally well → the sentence says nothing.

**Rule:** Every claim must be either backed by facts or deleted. «Мы делаем обувь» лучше, чем «Мы делаем обувь, которая стремительно набирает популярность среди требовательных покупателей».

---

## 8. Redundancy (Избыточность)

| Redundant | Concise |
|-----------|---------|
| Redundant | Concise |
|-----------|---------|
| Своя собственная | Своя / Собственная |
| Полностью и целиком | Полностью / Целиком |
| Каждый и любой | Каждый / Любой |
| Впервые познакомиться | Познакомиться |
| Совместное сотрудничество | Сотрудничество |
| Перспектива на будущее | Перспектива |
| Главный приоритет | Приоритет |
| Свободная вакансия | Вакансия |
| Памятный сувенир | Сувенир |

---

## 9. Sentence Structure

### One thought per sentence
If a sentence has more than one main idea, split it.

### Vary sentence length
Short sentences create rhythm. Long sentences carry complex ideas. Mix them. Monotonous length (all medium) is a strong AI marker.

### Break the template
If every paragraph follows Introduction → Details → Summary, vary the structure. Start some paragraphs with a detail. End some abruptly. Let some flow into the next without a formal conclusion.

---

## 10. The Read-Aloud Test

Read the edited text with your inner voice. Check for:

- **Stumbling** — if you stumble on a phrase, it needs rewriting
- **Breathlessness** — if you run out of breath, the sentence is too long
- **Boredom** — if your attention drifts, the text is too monotonous
- **Robotic feel** — if it sounds like a press release or government report, add human voice

---

## 11. Action vs Inaction (Действие и бездействие)

Text should read like a movie, not a still life. Every sentence should ideally have an ACTOR performing an ACTION.

### Strong vs weak subjects

**Strong subjects** can perform actions: people, companies, teams, even software.
**Weak subjects** cannot act: abstract concepts, nominalizations, states.

| Weak (still life) | Strong (movie) |
|--------------------|---------------|
| Ежедневная уборка сделает ваш дом чистым | Если вы будете убирать 20 минут в день, дом засияет |
| Рефорестация привела к снижению CO₂ | Волонтёры восстановили лес, и CO₂ в регионе уменьшилось |
| Наличие справки не гарантирует пересдачу | Даже если студент принесёт справку, преподаватель может не назначить пересдачу |
| Внедрение CRM обеспечит прирост продаж | Когда мы внедрим CRM, менеджеры будут продавать на треть больше |

### Weak verbs (глаголы-пустышки)

These verbs describe states, not actions. When the sentence implies action, replace them:

являться, находиться, иметься, располагаться, становиться, казаться, относиться, принадлежать, указывать, предполагать, сигнализировать, следовать, вызывать, обеспечивать

| Weak verb | Replacement |
|-----------|------------|
| В Москве **располагается** 70% складов | 70% складов — в Москве |
| На складе **имеются** запчасти | Мы держим на складе запчасти |
| Рост отказов **указывает** на проблемы | Клиенты всё чаще отказываются. Похоже, менеджеры плохо обслуживают |
| Работа **предполагает** высокую загрузку | Вы будете работать по 6–7 смен в неделю |

**Exception:** State verbs are fine when you genuinely describe a state, not a hidden action: «Магазин открыт», «Дом построен в 1905 году».

**Rule:** Find the hidden actor. Find the hidden action. Rebuild the sentence around them.

---

## 12. Close Synonyms in Lists (Однородные члены)

When listing multiple items, check if they're close in meaning. If yes — keep the strongest, delete the rest. AI text piles up synonyms to look thorough.

| Redundant list | After cleanup |
|---------------|--------------|
| мучается и страдает | страдает |
| быстро, точно и пунктуально | за полчаса |
| постоянного, всеобъемлющего и непреходящего | постоянного |
| аккуратный и вдумчивый | вдумчивый |
| ясности и точности | точности |
| гнева, недовольства или несогласия | гнева |
| долгого и нудного | нудного |

### When to keep synonyms

Keep them when they are genuinely different in meaning AND each adds value:

- «имена, даты и статистику» — three different categories of knowledge, keep
- «коллегам, клиентам, знакомым и родственникам» — four distinct groups, keep

**Detection rule:** If you can remove one synonym and the sentence says the same thing, remove it. If meaning is lost, keep both.

**AI marker:** AI often uses exactly THREE synonyms in a row (rule-of-three). Two occurrences of this in a text is a strong AI signal.

---

## 13. Paragraph Transitions (Переходные слова)

In spoken language, transitions help the listener follow along. In written text, paragraph breaks do this job. Transitional words at the start of paragraphs are redundant — delete them.

### Delete these paragraph openers

| Delete | Why |
|--------|-----|
| Во-первых, Во-вторых, В-третьих | Numbering shows order already |
| Далее | The next paragraph IS "далее" |
| Наконец | Don't announce the ending |
| Прежде всего | Just start with the most important thing |
| Для начала | Just begin |
| Рассмотрим | Just examine it |
| Отметим также | Just note it |
| Подведём итог | Just give the conclusion |
| Таким образом | Just state the result |
| В завершение | Just finish |
| Какие выводы? | Just state the conclusions |
| Представьте себе | Just describe it |
| Допустим | Just give the example |
| Скажем | Just say it |

### First sentence principle

The first sentence of a paragraph determines whether the reader will read the rest.

**For informational text:** Start with the main idea. If interesting — reader continues. If familiar — reader skips to next paragraph. Both outcomes are fine.

| Bad first sentence | Good first sentence |
|-------------------|-------------------|
| Когда запланировать работы — непростой вопрос. | Предлагаю запланировать работы на ночь четверга. |
| Далее мы рассмотрим деталь, которая... | Резистор создаёт сопротивление и понижает напряжение. |
| Я давно думал, чем хочу заняться... | Хочу помогать вашей компании с текстом. |

**AI marker:** AI starts almost every paragraph with a transitional word or a meta-sentence about what will follow. Humans start with the content itself.

---

## 14. Split Constructions and Indirect Speech (Разделённые конструкции)

### Split constructions

When parts of a paired construction are far apart, the reader must hold the first part in memory while reading the second. This overloads working memory.

**Problem patterns:**
- «Не только [long phrase], но и [long phrase]»
- «Как [long phrase], так и [long phrase]»
- «Если [long phrase], то [long phrase]»

**Fix:** Break into separate sentences or use a list with a colon.

| Heavy | Light |
|-------|-------|
| Не только должны выписать все замечания и отсортировать, но и оценить время на исправление | Нужно сделать три вещи: выписать замечания, отсортировать и оценить время |
| Как замечания по сути, которые полезны, так и замечания по эстетике, которые нужны для... | Два вида замечаний: по сути и по эстетике. Сутевые полезны. Эстетические чаще... |
| Если для клиента дать замечания легко, то для вас внести их будет проблемой | Клиенту легко дать замечания. А вам внести их будет трудно |

### Indirect speech simplification

Constructions with «сказал, что», «думаю, что», «хочу, чтобы» can almost always be simplified:

| Indirect | Direct |
|----------|--------|
| Пресс-секретарь сказал, чтобы все вопросы задавали ему | Пресс-секретарь попросил задавать вопросы ему |
| Я считаю, что уволиться — не лучший способ | Уволиться — не лучший способ |
| Я бы хотел, чтобы исправления вносились через редполитику | Вносите исправления через редполитику |
| Мы ожидаем, что вы проведёте презентацию не позже вторника | Мы рассчитываем на презентацию не позже вторника |
| Местные говорят, что по ночам в этот район лучше не ходить | Местные не советуют ходить в этот район по ночам |

**Rule:** «Сказал, что», «думаю, что» и «хочу, чтобы» — упрощать.

---

## Tool Reference

**glvrd.ru** — online text analysis tool for informational style. Scores Russian text for informational style compliance. Useful as a final check, but don't optimize for the score — optimize for readability.
