# Phase 9 External Verification

## Summary

Phase 9 (Contacts CRUD) реализована полностью. Все четыре команды (`list`, `add`, `delete`, `search`) работают, dual routing для add (username/ID vs phone), formatters и formatData dispatch подключены. Остаётся один важный пробел в интеграционных тестах и рекомендация по рефакторингу дублирующегося кода.

## Verification Snapshot

- `npm test`: 545/545 tests passing
- `npx tsc --noEmit`: passing
- Все четыре contact-команды реализованы и подключены
- Требования CONT-01–CONT-04 закрыты

## Findings

### 1. Интеграционный тест не проверяет группу Contact — ИСПРАВЛЕНО

**Status:** Resolved  
**Severity:** Important

#### Что сделано

- Тест обновлён: «all 7 command groups» с проверкой Contact и contact
- Добавлен тест `contact --help shows list, add, delete, search subcommands`

---

### 2. Дублирование mapUserStatus и buildUserProfile в трёх contact-файлах — ИСПРАВЛЕНО

**Status:** Resolved
**Severity:** Suggestion

#### Что сделано

- Создан `src/lib/user-profile.ts` с экспортированными `mapUserStatus` и `buildUserProfile`
- Удалены дублированные копии из `add.ts`, `list.ts`, `search.ts` (3 копии) и `profile.ts` (1 копия)
- `profile.ts` рефакторнут: inline-логика построения профиля заменена на вызов `buildUserProfile`
- 546/546 тестов зелёные, tsc чисто, E2E верифицирован

## Resolved / Verified

### 1. Все четыре команды реализованы и подключены

- `list.ts`: GetContacts + GetFullUser enrichment, pagination, alphabetical sort, ContactsNotModified
- `add.ts`: dual routing (isPhoneInput → ImportContacts vs resolveEntity → AddContact), GetFullUser enrichment
- `delete.ts`: DeleteContacts, idempotent
- `search.ts`: contacts.Search, myResults/results, isContact flag, --global

### 2. formatData dispatch

- ContactListResult → formatContactList
- ContactSearchResult → formatContactSearch
- ContactDeleteResult → "Deleted contact {name}"

### 3. LIST_KEYS и --fields/--jsonl

- `contacts` и `results` добавлены в LIST_KEYS
- extractListItems корректно обрабатывает ContactListResult и ContactSearchResult

### 4. Error map

- CONTACT_ID_INVALID, CONTACT_NAME_EMPTY, CONTACT_REQ_MISSING, SEARCH_QUERY_EMPTY

### 5. Dual routing для add

- Phone: `+1234567890` или `1234567890` → ImportContacts, обязательный --first-name
- Username/ID → resolveEntity + AddContact + GetFullUser

## Current Position

Phase 9 достигнута. Все требования CONT-01–CONT-04 выполнены. Оба findings внешней верификации исправлены: интеграционный тест обновлён, дублирование устранено через `src/lib/user-profile.ts`.
