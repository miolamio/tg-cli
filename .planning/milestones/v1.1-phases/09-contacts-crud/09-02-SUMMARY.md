---
phase: 09-contacts-crud
plan: 02
subsystem: api
tags: [gramjs, contacts, telegram, crud, typescript, formatters]

# Dependency graph
requires:
  - phase: 09-contacts-crud plan 01
    provides: ContactDeleteResult, ContactListResult, ContactSearchItem, ContactSearchResult types, contactDeleteAction, contactAddAction
  - phase: 08-user-profiles-block-unblock
    provides: UserProfile type, formatMembers, formatData dispatch pattern, blocked.ts command pattern
provides:
  - contactListAction with GetContacts + GetFullUser enrichment, pagination, alphabetical sort
  - contactSearchAction with myResults/results separation, isContact flag, GetFullUser enrichment
  - createContactCommand factory wiring list, add, delete, search subcommands
  - formatContactList and formatContactSearch formatters
  - formatData auto-dispatch for ContactListResult, ContactSearchResult, ContactDeleteResult shapes
  - Contact command group registered in CLI under Contact heading
affects: [10-poll-crud, 11-toon-output-format]

# Tech tracking
tech-stack:
  added: []
  patterns: [batch GetFullUser enrichment with Promise.allSettled (batch size 5), concurrent mock ordering for batch tests]

key-files:
  created:
    - src/commands/contact/list.ts
    - src/commands/contact/search.ts
    - src/commands/contact/index.ts
    - tests/unit/contact-list.test.ts
    - tests/unit/contact-search.test.ts
  modified:
    - src/lib/format.ts
    - src/lib/fields.ts
    - src/bin/tg.ts

key-decisions:
  - "Duplicated mapUserStatus and buildUserProfile in list.ts and search.ts (same pattern as add.ts, minimizes cross-file coupling)"
  - "Contact formatData dispatch placed before BlockedListResult to avoid shape collision (contacts[] vs users[])"
  - "formatContactSearch shows [contact] tag for myResults items, no tag for global-only results"

patterns-established:
  - "Concurrent batch enrichment: Promise.allSettled with batch size 5 for GetFullUser + GetUserPhotos"
  - "Mock ordering for concurrent batches: all GetFullUser mocks first, then all GetUserPhotos mocks (matching microtask scheduling)"

requirements-completed: [CONT-01, CONT-04]

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 9 Plan 2: Contact List, Search, Formatters & CLI Wiring Summary

**contactListAction with paginated alphabetical listing, contactSearchAction with local/global modes and isContact tagging, formatContactList/formatContactSearch formatters, createContactCommand factory, and CLI registration**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-13T10:59:36Z
- **Completed:** 2026-03-13T11:04:36Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- contactListAction: GetContacts + GetFullUser enrichment in batches of 5, alphabetical sort by firstName+lastName, client-side pagination (limit/offset), ContactsNotModified handling
- contactSearchAction: contacts.Search API with myResults-only (default) and global mode (myResults + results), isContact flag for distinguishing contacts from non-contacts, GetFullUser enrichment
- formatContactList delegates to formatMembers, formatContactSearch shows [contact] tag
- formatData auto-dispatches for ContactListResult (contacts[]+total), ContactSearchResult (results[]+total), ContactDeleteResult (userId+action=deleted)
- LIST_KEYS extended with 'contacts' and 'results' for --fields/--jsonl support
- createContactCommand registers list, add, delete, search subcommands
- Contact command group registered in tg.ts under Contact heading
- Full test suite: 545 tests passing across 44 files

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement contact list and search commands with tests** - `ccedc8a` (feat)
2. **Task 2: Formatters, formatData dispatch, fields.ts, command group, CLI wiring** - `f6428f9` (feat)

_Note: TDD task -- tests written first (RED), then implementation (GREEN), committed together per task_

## Files Created/Modified
- `src/commands/contact/list.ts` - contactListAction with GetContacts, alphabetical sort, pagination, GetFullUser enrichment
- `src/commands/contact/search.ts` - contactSearchAction with myResults/global mode, isContact flag, GetFullUser enrichment
- `src/commands/contact/index.ts` - createContactCommand factory with list, add, delete, search subcommands
- `src/lib/format.ts` - formatContactList, formatContactSearch, formatData dispatch for 3 contact shapes
- `src/lib/fields.ts` - LIST_KEYS extended with 'contacts' and 'results'
- `src/bin/tg.ts` - Contact command group registered under Contact heading
- `tests/unit/contact-list.test.ts` - 5 tests: success, ContactsNotModified, pagination, sort, auth check
- `tests/unit/contact-search.test.ts` - 4 tests: contacts-only search, global search with isContact, empty results, auth check

## Decisions Made
- Duplicated mapUserStatus and buildUserProfile helpers in list.ts and search.ts (same as add.ts pattern, minimizes cross-file coupling; can be consolidated in future refactor)
- Placed contact formatData dispatch before BlockedListResult check to avoid shape collision (contacts[] key is distinct from users[] key)
- formatContactSearch shows [contact] tag (green) for myResults items, no tag for global-only results

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed mock ordering for concurrent batch enrichment tests**
- **Found during:** Task 1 (contact list and search tests)
- **Issue:** Tests failed because mock invocation responses were ordered sequentially (GetFullUser+GetUserPhotos per user) but actual execution via Promise.allSettled runs all GetFullUser calls first, then all GetUserPhotos calls
- **Fix:** Reordered mock responses to match concurrent batch execution: all GetFullUser mocks first, then all GetUserPhotos mocks
- **Files modified:** tests/unit/contact-list.test.ts, tests/unit/contact-search.test.ts
- **Verification:** All 9 tests pass
- **Committed in:** ccedc8a (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Mock ordering adjustment for test correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 9 (Contacts CRUD) fully complete -- all 4 contact commands operational
- Contact command group appears in tg --help under Contact heading
- Full output pipeline (JSON, human-readable, --fields, --jsonl) working for all contact shapes
- Ready for Phase 10 (Poll CRUD) or Phase 11 (TOON output format)

---
*Phase: 09-contacts-crud*
*Completed: 2026-03-13*
