# Phase 8 External Verification

## Summary

Phase 8 (User Profiles & Block/Unblock) реализована полностью. Все четыре команды (`profile`, `block`, `unblock`, `blocked`) работают, типы и formatters соответствуют плану, CLI зарегистрирован. Остаётся один незначительный нюанс в логике `supportsInline` и рекомендация по проверке JSONL для `UserProfileResult`.

## Verification Snapshot

- `npm test`: 525/525 tests passing (per 08-VERIFICATION.md)
- `npx tsc --noEmit`: passing
- Все четыре user-команды реализованы и подключены
- Требования USER-01–USER-04 закрыты

## Findings

### 1. `supportsInline` выводится из `botInlinePlaceholder`, а не из отдельного поля API

**Status:** Open  
**Severity:** Suggestion

#### Problem

В `profile.ts` поле `supportsInline` задаётся как `!!userFromResult.botInlinePlaceholder`:

```ts
// profile.ts:161-162
profileData.botInlinePlaceholder =
  userFromResult.botInlinePlaceholder ?? undefined;
profileData.supportsInline =
  !!userFromResult.botInlinePlaceholder;
```

То есть `supportsInline` = «есть placeholder». В Telegram API у User может быть отдельное поле `botInlineGeo` или иная индикация поддержки inline. В gramjs/MTProto `supportsInline` может отсутствовать как отдельное поле.

#### Why this matters

- Для большинства ботов это эквивалентно: если есть placeholder, inline обычно поддерживается.
- Если API имеет отдельное поле `supportsInline`, текущая логика может быть неточной.

#### Possible solution methods

- Оставить как есть; текущая эвристика достаточна.
- Или проверить наличие `userFromResult.botInlineGeo` / `supportsInline` в API и использовать их при наличии.

---

### 2. JSONL для `UserProfileResult`: не проверено явно

**Status:** Open  
**Severity:** Suggestion

#### Problem

`UserProfileResult` имеет форму `{ profiles, notFound }`. LIST_KEYS включает `profiles`, поэтому `extractListItems` вернёт `profiles` и JSONL будет стримить элементы. `notFound` при этом не попадает в JSONL (как и в `message get` с `{ messages, notFound }`).

#### Why this matters

- Поведение согласовано с другими командами: JSONL стримит только массив элементов.
- Для `profile` с `--jsonl` пользователь не увидит `notFound` в потоке JSONL — только профили.

#### Possible solution methods

- Оставить как есть; это соответствует общему паттерну.
- Или добавить явный тест в `output.test.ts` на JSONL для `UserProfileResult`.

## Resolved / Verified

### 1. Все четыре команды реализованы и подключены

- `profile.ts`: GetFullUser + GetUserPhotos, multi-user, partial success
- `block.ts` / `unblock.ts`: contacts.Block/Unblock, проверка Api.User
- `blocked.ts`: GetBlocked, Blocked/BlockedSlice, pagination

### 2. formatData dispatch

- UserProfileResult → formatUserProfile
- BlockedListResult → formatBlockedList / formatMembers
- BlockResult → "Blocked/Unblocked {name}"

### 3. LIST_KEYS и --fields/--jsonl

- `profiles` и `users` добавлены в LIST_KEYS
- extractListItems корректно обрабатывает UserProfileResult и BlockedListResult

### 4. CLI integration

- `tg user --help` показывает profile, block, unblock, blocked
- `tg --help` показывает группу User

### 5. Error map

- USER_BOT_INVALID, INPUT_USER_DEACTIVATED, PEER_ID_INVALID обновлён

## Current Position

Phase 8 достигнута. Все требования USER-01–USER-04 выполнены. Оставшиеся пункты — мелкие улучшения (supportsInline, тест JSONL), не блокирующие закрытие фазы.
