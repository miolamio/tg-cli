# Phase 10 External Verification

## Summary

Phase 10 (Polls) реализована полностью. Команда `tg message poll`, типы PollOption/PollData, сериализация опросов во всех контекстах (history, get, pinned, search), formatter formatPoll и валидация работают. Остаётся пробел в интеграционном тесте (message --help не проверяет poll) и 18 падающих тестов в других модулях, не связанных с Phase 10.

## Verification Snapshot

- Phase 10 unit tests: message-poll (26), serialize (9 poll-related), format (13 poll-related) — все проходят
- `npx tsc --noEmit`: passing
- Полный `npm test`: 18 падений в message-forward, message-history, message-search, message-send (существовали до Phase 10)
- Требование WRITE-13 закрыто

## Findings

### 1. Интеграционный тест message --help не проверяет poll

**Status:** Open  
**Severity:** Important

#### Problem

Тест `message --help shows all subcommands including edit, delete, pin, unpin` (cli-entry.test.ts:83) не включает poll. Подкоманда poll зарегистрирована в message index, но не покрыта интеграционным тестом.

#### Code snippet

```ts
// tests/integration/cli-entry.test.ts:83-98
it('message --help shows all subcommands including edit, delete, pin, unpin', () => {
  // ...
  expect(output).toContain('edit');
  expect(output).toContain('delete');
  expect(output).toContain('pin');
  expect(output).toContain('unpin');
  // poll отсутствует
});
```

#### Why this matters

- Подкоманда poll добавлена, но не проверяется в интеграционных тестах.
- Аналогично Phase 9 (contact) — нужна явная проверка.

#### Possible solution methods

- Добавить `expect(output).toContain('poll');` в существующий тест.
- Или добавить отдельный тест `message poll --help shows --question, --option, --quiz, --correct, etc.`

---

### 2. 18 падающих тестов в message-forward, message-history, message-search, message-send

**Status:** Open  
**Severity:** Important (но не Phase 10)

#### Problem

Полный `npm test` показывает 18 падений в четырёх файлах. Эти тесты не используют Phase 10 код; 10-VERIFICATION.md отмечает, что падения были до Phase 10.

#### Why this matters

- Регрессия в других фазах, не в polls.
- Phase 10 сама по себе реализована корректно; падения не связаны с poll.

#### Possible solution methods

- Разобрать и исправить падающие тесты в отдельной задаче.
- Не блокировать закрытие Phase 10 на эти падения.

## Resolved / Verified

### 1. Poll types и сериализация

- PollOption, PollData в types.ts
- MessageItem.poll
- extractPollData, serializeMessage populates poll для MessageMediaPoll
- detectMedia возвращает 'poll'

### 2. Poll command

- messagePollAction с validatePollOpts
- Валидация: question, options (2–10), quiz/--correct/--solution, --multiple/--public/--close-in
- sendFile с InputMediaPoll

### 3. Formatter

- formatPoll: question, numbered options, vote counts, correct ✓, config tags
- formatSingleMessage добавляет poll для history/get/pinned/search

### 4. Error map

- 7 poll error codes: POLL_ANSWERS_INVALID, POLL_OPTION_DUPLICATE, POLL_OPTION_INVALID, POLL_QUESTION_INVALID, QUIZ_CORRECT_ANSWERS_EMPTY, QUIZ_CORRECT_ANSWERS_TOO_MUCH, CHAT_SEND_POLL_FORBIDDEN

### 5. CLI wiring

- poll subcommand с --question, --option (collect), --quiz, --correct, --solution, --multiple, --public, --close-in

## Current Position

Phase 10 достигнута. WRITE-13 выполнен. Рекомендуется добавить проверку poll в интеграционный тест message --help. 18 падающих тестов в других модулях — отдельная задача, не блокирующая Phase 10.
