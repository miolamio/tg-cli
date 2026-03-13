---
phase: 09-contacts-crud
plan: 01
subsystem: api
tags: [gramjs, contacts, telegram, crud, typescript]

# Dependency graph
requires:
  - phase: 08-user-profiles-block-unblock
    provides: UserProfile type, block.ts command pattern, translateTelegramError
provides:
  - ContactDeleteResult, ContactListResult, ContactSearchItem, ContactSearchResult types
  - contactDeleteAction handler with entity validation and idempotent delete
  - contactAddAction handler with dual routing (username/ID vs phone)
  - Contact-specific TELEGRAM_ERROR_MAP entries (4 codes)
affects: [09-contacts-crud plan 02, formatters, CLI wiring]

# Tech tracking
tech-stack:
  added: []
  patterns: [dual-route command (phone vs username detection), buildUserProfile helper for GetFullUser enrichment]

key-files:
  created:
    - src/commands/contact/delete.ts
    - src/commands/contact/add.ts
    - tests/unit/contact-delete.test.ts
    - tests/unit/contact-add.test.ts
  modified:
    - src/lib/types.ts
    - src/lib/errors.ts

key-decisions:
  - "isPhoneInput regex (/^\\+?\\d+$/) for auto-detecting phone vs username input"
  - "Duplicated mapUserStatus in add.ts rather than refactoring profile.ts export (minimize cross-file changes)"
  - "BigInt clientId cast to any for gramjs BigInteger type compatibility"

patterns-established:
  - "Dual-route command: isPhoneInput detection routes to ImportContacts vs resolveEntity+AddContact"
  - "buildUserProfile helper: reusable GetFullUser enrichment pattern (duplicated from profile.ts)"

requirements-completed: [CONT-02, CONT-03]

# Metrics
duration: 4min
completed: 2026-03-13
---

# Phase 9 Plan 1: Contact Types, Delete & Add Commands Summary

**ContactDeleteResult/ContactListResult/ContactSearchResult types, delete command with idempotent behavior, and add command with dual phone/username routing via ImportContacts and AddContact APIs**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-13T10:51:53Z
- **Completed:** 2026-03-13T10:56:02Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- ContactDeleteResult, ContactListResult, ContactSearchItem, ContactSearchResult types added to types.ts
- TELEGRAM_ERROR_MAP extended with 4 contact-specific error codes (CONTACT_ID_INVALID, CONTACT_NAME_EMPTY, CONTACT_REQ_MISSING, SEARCH_QUERY_EMPTY)
- contactDeleteAction handler: resolveEntity, User validation, DeleteContacts API, idempotent behavior
- contactAddAction handler: phone detection, ImportContacts for phone route, AddContact for username/ID route, full UserProfile enrichment via GetFullUser

## Task Commits

Each task was committed atomically:

1. **Task 1: Add contact types and extend error map** - `cbc3856` (feat)
2. **Task 2: Implement add contact command with dual routing** - `7222a58` (feat)

_Note: TDD tasks -- tests written first (RED), then implementation (GREEN), committed together per task_

## Files Created/Modified
- `src/lib/types.ts` - Added ContactDeleteResult, ContactListResult, ContactSearchItem, ContactSearchResult types
- `src/lib/errors.ts` - Extended TELEGRAM_ERROR_MAP with 4 contact-specific error codes
- `src/commands/contact/delete.ts` - contactDeleteAction handler following block.ts pattern
- `src/commands/contact/add.ts` - contactAddAction handler with dual routing and UserProfile enrichment
- `tests/unit/contact-delete.test.ts` - 4 tests: success, entity rejection, error translation, auth check
- `tests/unit/contact-add.test.ts` - 7 tests: username add, phone add, missing first-name, unregistered phone, entity rejection, all-digit phone, error translation

## Decisions Made
- Used `isPhoneInput` regex (`/^\+?\d+$/`) for auto-detecting phone vs username input routing
- Duplicated `mapUserStatus` helper in add.ts rather than refactoring profile.ts to export it (minimizes cross-file changes for Plan 01; can be consolidated in future refactor)
- Cast BigInt clientId to `any` for gramjs BigInteger type compatibility (same pattern as `maxId` in profile.ts)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed BigInt/BigInteger type mismatch for InputPhoneContact clientId**
- **Found during:** Task 2 (contactAddAction implementation)
- **Issue:** `npx tsc --noEmit` errored: `Type 'bigint' is not assignable to type 'BigInteger'`
- **Fix:** Cast `BigInt(...)` to `any`, consistent with existing `maxId: BigInt(0) as any` pattern in profile.ts
- **Files modified:** src/commands/contact/add.ts
- **Verification:** `npx tsc --noEmit` clean, all tests still pass
- **Committed in:** 7222a58 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor type cast for gramjs compatibility. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Contact types established for Plan 02 to wire into CLI with formatters
- Delete and add command handlers ready for registration in contact/index.ts
- Error translations in place for all contact operations
- Plan 02 needs: list command, search command, formatters, CLI registration in tg.ts

---
*Phase: 09-contacts-crud*
*Completed: 2026-03-13*
