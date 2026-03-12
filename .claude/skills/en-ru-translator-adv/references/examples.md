# Translation Examples by Text Type

Each example shows the English original, a bad literal translation, a good natural translation, and an explanation of what went wrong.

---

## Marketing Text

### Example 1

English: "Unlock the full potential of your team with our cutting-edge platform. We've reimagined collaboration from the ground up."

Bad: "Раскройте полный потенциал вашей команды с нашей передовой платформой. Мы переосмыслили коллаборацию с нуля."

Good: "Помогите команде работать в полную силу. Мы создали платформу для совместной работы с чистого листа — и она меняет правила игры."

What went wrong: "раскройте полный потенциал" is a calque, "передовой" is a cliche filler, "коллаборация" is an anglicism where "совместная работа" is natural, the whole sentence structure follows English syntax.

### Example 2

English: "Join thousands of satisfied customers who have already transformed their business with our solution."

Bad: "Присоединяйтесь к тысячам удовлетворённых клиентов, которые уже трансформировали свой бизнес с помощью нашего решения."

Good: "Тысячи компаний уже изменили свой подход к работе. Попробуйте и вы."

What went wrong: "присоединяйтесь к тысячам" is an unnatural construction in Russian, "удовлетворённых" sounds bureaucratic, "трансформировали" is an anglicism.

### Example 3

English: "Ready to take your productivity to the next level? Start your free trial today."

Bad: "Готовы вывести вашу продуктивность на следующий уровень? Начните ваш бесплатный пробный период сегодня."

Good: "Хотите успевать больше? Попробуйте бесплатно."

What went wrong: "вывести на следующий уровень" is a direct calque of "take to the next level", "вашу продуктивность" has redundant pronoun and anglicism, "бесплатный пробный период" is unnecessarily wordy.

---

## Technical Text

### Example 1

English: "This feature allows users to configure automated workflows that are triggered based on predefined conditions."

Bad: "Эта функция позволяет пользователям конфигурировать автоматизированные рабочие процессы, которые запускаются на основе предопределённых условий."

Good: "С помощью этой функции можно настроить автоматические сценарии, которые срабатывают при заданных условиях."

What went wrong: "конфигурировать" is an anglicism where "настроить" works, "автоматизированные рабочие процессы" is a heavy nominalization, "предопределённых" is unnecessarily complex.

### Example 2

English: "The application leverages machine learning algorithms to provide real-time insights into user behavior patterns."

Bad: "Приложение использует алгоритмы машинного обучения для предоставления инсайтов в реальном времени о паттернах поведения пользователей."

Good: "Приложение анализирует поведение пользователей в реальном времени с помощью машинного обучения."

What went wrong: "предоставления инсайтов" is a double anglicism plus nominalization, "паттернах поведения" is an anglicism, the entire sentence structure is too heavy.

### Example 3

English: "Deploy your changes to the staging environment and verify that all integration tests pass before merging to main."

Bad: "Задеплойте ваши изменения в стейджинг-среду и верифицируйте, что все интеграционные тесты проходят перед мерджем в мейн."

Good: "Разверните изменения на тестовом стенде и убедитесь, что все интеграционные тесты проходят, прежде чем вливать в основную ветку."

What went wrong: "задеплойте" is slang acceptable in chat but not in documentation, "стейджинг-среда" can be "тестовый стенд", "верифицируйте" is an anglicism for "убедитесь", "мердж в мейн" is raw English jargon. Note: in informal technical texts (Slack, comments), some of these are acceptable.

### Example 4: API description with noun stacks

English: "The API provides direct control over skill management and execution, including version control through the Claude Console."

Bad: "API обеспечивает прямой контроль над управлением и выполнением навыков, включая контроль версий и управление через Claude Console."

Good: "Через API вы напрямую управляете навыками и запускаете их, а в Claude Console отслеживаете версии."

What went wrong: triple nominalization "контроль над управлением и выполнением", канцелярит "обеспечивает", repeated word "контроль", "управление" used twice with different meanings. The fix converts nouns back to verbs and splits the sentence.

### Example 5: What is a skill (compound definition)

English: "A skill is a set of instructions, packaged into a regular folder, that teaches Claude how to perform a specific task."

Bad: "Навык — это набор инструкций, упакованный в обычную папку, который учит Claude выполнять определённую задачу."

Good: "Навык — это обычная папка с набором инструкций, обучающих Claude выполнению определённой задачи."

What went wrong: "упакованный" calques "packaged" (use "оформленный", "собранный"), too many relative clauses stacked. The fix restructures so the main noun ("папка") comes first and the participle naturally attaches.

---

## Educational Text

### Example 1

English: "In this lesson, you will learn how to leverage AI-powered tools to streamline your daily operations and boost productivity."

Bad: "В этом уроке вы научитесь, как использовать инструменты на базе искусственного интеллекта для оптимизации ваших ежедневных операций и повышения продуктивности."

Good: "На этом уроке разберёмся, как с помощью ИИ упростить рутину и успевать больше."

What went wrong: "инструменты на базе искусственного интеллекта" is wordy, "оптимизации ваших ежедневных операций" is bureaucratic nominalization, "повышения продуктивности" sounds like a corporate report, not a lesson.

### Example 2

English: "Let's explore how you can take advantage of these powerful features to get the most out of your experience."

Bad: "Давайте исследуем, как вы можете воспользоваться этими мощными функциями, чтобы получить максимум от вашего опыта."

Good: "Давайте разберёмся, как использовать эти возможности на полную."

What went wrong: "исследуем" is too academic for educational tone, "воспользоваться этими мощными функциями" is heavy, "получить максимум от вашего опыта" is a calque from "get the most out of your experience".

### Example 3

English: "By the end of this module, you'll be able to create custom dashboards that visualize your key metrics in real time."

Bad: "К концу этого модуля вы будете способны создавать кастомные дашборды, которые визуализируют ваши ключевые метрики в реальном времени."

Good: "После этого модуля вы сможете собирать собственные панели мониторинга с нужными показателями в реальном времени."

What went wrong: "будете способны" is a calque of "will be able to" (use "сможете"), "кастомные дашборды" is double anglicism, "визуализируют ваши ключевые метрики" is jargon-heavy.

---

## Business / Corporate Text

### Example 1

English: "We are pleased to announce that the company has successfully completed the acquisition of TechCorp, which will enable us to expand our product portfolio and better serve our customers."

Bad: "Мы рады объявить, что компания успешно завершила приобретение TechCorp, что позволит нам расширить наш продуктовый портфель и лучше обслуживать наших клиентов."

Good: "Рады сообщить: мы завершили сделку по покупке TechCorp. Это позволит расширить линейку продуктов и улучшить сервис для клиентов."

What went wrong: "объявить" is too solemn, "продуктовый портфель" is an anglicism, excessive pronouns "нам/наш/наших", one long sentence where two shorter ones work better.

### Example 2

English: "Going forward, our strategic priority will be to optimize operational efficiency while maintaining our commitment to innovation and customer satisfaction."

Bad: "Двигаясь вперёд, нашим стратегическим приоритетом будет оптимизация операционной эффективности при сохранении нашей приверженности инновациям и удовлетворённости клиентов."

Good: "Наша главная задача — повысить эффективность работы, не снижая темпов развития и качества обслуживания."

What went wrong: "двигаясь вперёд" is a calque of "going forward", chain of nominalizations "оптимизация операционной эффективности", "приверженности инновациям" is bureaucratic, "удовлетворённости клиентов" sounds like a government report.

---

## Technical Documentation (IT-specific patterns)

### Example 1: Chapter heading

English: "Chapter 4. Distribution"

Bad: "Глава 4. Распространение"

Good: "4. Публикация навыков"

What went wrong: "Глава" is unnecessary in web documentation (adds visual noise). "Распространение" is the wrong semantic field — for publishing plugins/skills to a catalog, use "публикация" or "размещение".

### Example 2: Frontmatter terminology

English: "The YAML frontmatter at the top of SKILL.md contains metadata."

Bad: "YAML-преамбула в начале SKILL.md содержит метаданные."

Good: "YAML-шапка в начале SKILL.md содержит метаданные."

What went wrong: "преамбула" is a legal term (Конституция). In IT documentation, the standard terms are "шапка", "блок метаданных", or "заголовок".

### Example 3: Whether you... or...

English: "Whether you're building a skill for yourself, your team, or the community — this guide has what you need."

Bad: "Строите ли вы навык для себя, для команды или для сообщества — здесь найдётся всё необходимое."

Good: "Не важно, делаете вы навык для себя, команды или сообщества — здесь есть всё необходимое."

What went wrong: "Строите ли вы" is a stiff calque of "Whether you're building". The Russian "Не важно, ..." pattern is more natural. Also dropped redundant "для" repetition.

### Example 4: "Two ways through this guide"

English: "There are two ways through this guide."

Bad: "Два пути через это руководство."

Good: "Как работать с руководством: два сценария."

What went wrong: "Пути через руководство" is a spatial metaphor that doesn't work in Russian. We don't walk "through" a guide — we read it, study it, work with it.

### Example 5: Канцелярит in skill description

English: "Skills are especially useful for repetitive tasks: generating frontend designs from specs, conducting research using a consistent methodology, preparing documents in your team's style... And for those building MCP integrations, skills add another layer — turning tool access into reliable, polished workflows."

Bad: "Навыки особенно полезны при повторяющихся задачах: генерация фронтенд-дизайна по спецификации, проведение исследований по единой методологии, подготовка документов в стиле вашей команды... А для тех, кто разрабатывает MCP-интеграции, навыки добавляют ещё один уровень — превращая доступ к инструментам в надёжные, отлаженные рабочие процессы."

Good: "Навыки незаменимы для рутинных задач: вёрстки фронтенда по спецификации, исследований по заданной методологии или подготовки документов в корпоративном стиле. Разработчикам MCP-интеграций навыки позволяют выйти на новый уровень: они превращают простой набор инструментов в надёжные и отлаженные рабочие процессы."

What went wrong: "особенно полезны при повторяющихся задачах" is wordy (→ "незаменимы для рутинных задач"), "генерация... проведение... подготовка" is a chain of nominalizations, "в стиле вашей команды" has a redundant pronoun (→ "в корпоративном стиле"), the em dash mid-sentence is awkward — better to split into two sentences.

---

## Structural Monotony (document-level anti-pattern)

This is not about individual sentences but about how a translated document feels as a whole. Even if every sentence is well-translated, the document can still read as machine-produced if structural patterns repeat mechanically.

### Example: repeated subheadings

English original has "Key techniques:" repeated 5 times in different sections. This is normal for English technical writing — readers skim by heading.

Bad (preserves repetition): every section has "Ключевые приёмы:" as subheading.

Good (varies naturally):

Section 1: "На что обратить внимание:"
Section 2: "Что делает этот подход эффективным:"
Section 3: "Важно учесть:"
Section 4: (no subheading — points woven into prose)
Section 5: "Здесь помогают:"

Why: a Russian author writing an original text would instinctively vary the phrasing. Mechanical repetition is a strong signal of machine translation.

### Example: repeated sentence structure in a list

English: "Skills extend... Skills package... Skills transform... Skills enable..."

Bad: "Навыки расширяют... Навыки упаковывают... Навыки превращают... Навыки позволяют..."

Good: "Навыки расширяют возможности Claude. Ваши знания и опыт упаковываются в готовые блоки, универсальный агент превращается в специализированного — и всё это можно комбинировать."

Why: the bad version starts four consecutive sentences with the same subject. The good version varies the subject and merges related ideas.

### Example: "positioning" as a heading

English: "Positioning your skill"

Bad: "Позиционирование вашего навыка"

Good: "Как описать навык" or "Как подать навык"

Why: "позиционирование" is a marketing anglicism. In Russian, the natural question is "как описать / как подать / как представить" — what you actually do, not a nominalization of the process.

---

## List Parallelism (document-level anti-pattern)

### Example: "What you'll learn" with broken parallelism

English:
```
What you'll learn:
- Technical requirements and best practices
- Templates for autonomous skills
- Approaches that...
- Testing and iteration
```

Bad (noun phrases after a verb-expecting heading):
```
Чему вы научитесь:
- Технические требования и лучшие практики
- Шаблоны для автономных навыков
- Подходы, которые...
- Тестирование и доработка
```

Good (Option A — verbs matching the heading):
```
Чему вы научитесь:
- понимать технические требования и лучшие практики;
- использовать шаблоны для автономных навыков;
- применять подходы, которые...;
- тестировать и дорабатывать навыки.
```

Good (Option B — change the heading to match nouns):
```
В этом разделе:
- Технические требования и лучшие практики.
- Шаблоны для автономных навыков.
- Подходы, которые...
- Тестирование и доработка.
```

Why: when the heading sets up a question with a verb ("чему научитесь"), the items must answer with verbs. If items are naturally nouns, change the heading instead.

### Example: list punctuation inconsistency

Bad (no terminal punctuation):
```
- **SKILL.md** (обязательно): инструкции в формате Markdown с YAML-преамбулой
- **scripts/** (необязательно): исполняемый код
```

Good (System 2 — semicolons, period at end):
```
- **SKILL.md** (обязательно) — инструкции в формате Markdown с YAML-шапкой;
- **scripts/** (необязательно) — исполняемый код;
- **assets/** (необязательно) — шаблоны, шрифты, иконки.
```
