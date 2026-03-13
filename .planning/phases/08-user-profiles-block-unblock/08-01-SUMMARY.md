---
phase: 08-user-profiles-block-unblock
plan: 01
subsystem: api
tags: [gramjs, user-profile, block, unblock, telegram-api]

# Dependency graph
requires:
  - phase: 07-message-write-operations
    provides: "translateTelegramError, action handler pattern, error map"
provides:
  - "UserProfile, UserProfileResult, BlockResult, BlockedListItem, BlockedListResult types"
  - "userProfileAction handler with multi-user support and partial success"
  - "userBlockAction and userUnblockAction handlers"
  - "Extended TELEGRAM_ERROR_MAP with USER_BOT_INVALID, INPUT_USER_DEACTIVATED"
affects: [08-02, user-cli-wiring, formatters]

# Tech tracking
tech-stack:
  added: []
  patterns: [className-based entity validation, multi-user partial success, status mapping]

key-files:
  created:
    - src/commands/user/profile.ts
    - src/commands/user/block.ts
    - src/commands/user/unblock.ts
    - tests/unit/user-profile.test.ts
    - tests/unit/user-block.test.ts
    - tests/unit/user-unblock.test.ts
  modified:
    - src/lib/types.ts
    - src/lib/errors.ts
    - tests/unit/errors.test.ts

key-decisions:
  - "Used className-based entity validation instead of instanceof Api.User for better testability"
  - "Changed PEER_ID_INVALID message from 'Chat not found' to 'Peer not found' (shared by chat and user commands)"

patterns-established:
  - "className entity check: (entity as any).className !== 'User' instead of instanceof"
  - "Multi-user partial success: { profiles: [], notFound: [] } with ok if any succeed"
  - "Status mapping: className-based switch on gramjs UserStatus types"

requirements-completed: [USER-01, USER-02, USER-03]

# Metrics
duration: 6min
completed: 2026-03-13
---

# Phase 8 Plan 01: User Types, Profile, Block & Unblock Summary

**UserProfile/BlockResult types with multi-user profile lookup (6 status types, privacy-restricted fields, bot-specific enrichment) and idempotent block/unblock commands**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-13T09:28:30Z
- **Completed:** 2026-03-13T09:35:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Added 5 Phase 8 type interfaces (UserProfile, UserProfileResult, BlockResult, BlockedListItem, BlockedListResult) to types.ts
- Implemented profile command with comma-separated multi-user input, all 6 UserStatus mappings, privacy-restricted phone indicator, and bot-specific fields
- Implemented block and unblock commands with entity validation and idempotent operation
- Extended error map with USER_BOT_INVALID and INPUT_USER_DEACTIVATED translations
- 28 unit tests covering all behaviors including edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Phase 8 types and extend error map** - `cebf87f` (feat)
2. **Task 2: Implement profile, block, and unblock commands with tests** - `4ef6462` (feat)

## Files Created/Modified
- `src/lib/types.ts` - Added UserProfile, UserProfileResult, BlockResult, BlockedListItem, BlockedListResult interfaces
- `src/lib/errors.ts` - Extended TELEGRAM_ERROR_MAP with USER_BOT_INVALID, INPUT_USER_DEACTIVATED; updated PEER_ID_INVALID message
- `src/commands/user/profile.ts` - Multi-user profile lookup with partial success, status mapping, privacy-restricted fields
- `src/commands/user/block.ts` - Block user action handler with entity validation
- `src/commands/user/unblock.ts` - Unblock user action handler with entity validation
- `tests/unit/user-profile.test.ts` - 19 tests covering single/multi-user, status mapping, bot fields, photo count, auth
- `tests/unit/user-block.test.ts` - 5 tests covering success, entity rejection, error translation, idempotency
- `tests/unit/user-unblock.test.ts` - 4 tests covering success, entity rejection, error translation, idempotency
- `tests/unit/errors.test.ts` - Updated PEER_ID_INVALID expected message to 'Peer not found'

## Decisions Made
- Used className-based entity validation (`(entity as any).className !== 'User'`) instead of `instanceof Api.User` -- gramjs entities always carry className and this approach is more testable since vitest mock classes don't share identity with source imports
- Changed PEER_ID_INVALID error message from 'Chat not found' to 'Peer not found' -- this error code is shared by chat and user commands, so a more generic message is appropriate

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed instanceof Api.User check failing in tests**
- **Found during:** Task 2 (command implementation)
- **Issue:** `instanceof Api.User` fails when vitest mocks create separate class instances for test and source module
- **Fix:** Changed to `(entity as any).className !== 'User'` which is also the pattern gramjs uses internally
- **Files modified:** src/commands/user/profile.ts, src/commands/user/block.ts, src/commands/user/unblock.ts
- **Verification:** All 28 tests pass, type-check clean
- **Committed in:** 4ef6462

**2. [Rule 1 - Bug] Updated existing PEER_ID_INVALID test expectation**
- **Found during:** Task 2 (full suite verification)
- **Issue:** errors.test.ts expected old 'Chat not found' message but we changed it to 'Peer not found' per plan
- **Fix:** Updated test expectation in errors.test.ts
- **Files modified:** tests/unit/errors.test.ts
- **Verification:** All 497 tests pass
- **Committed in:** 4ef6462

**3. [Rule 3 - Blocking] Fixed BigInt type incompatibility with gramjs BigInteger**
- **Found during:** Task 2 (type-check)
- **Issue:** `BigInt(0)` is native bigint but gramjs GetUserPhotos.maxId expects its BigInteger type
- **Fix:** Added `as any` type assertion for maxId parameter
- **Files modified:** src/commands/user/profile.ts
- **Verification:** `tsc --noEmit` passes clean
- **Committed in:** 4ef6462

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. className-based validation is actually the preferred pattern. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Types and action handlers ready for Plan 02 to wire into CLI with formatters and blocked list command
- Plan 02 needs to: register user command group in tg.ts, add formatUserProfile/formatBlockedList to format.ts, implement blocked list command

---
*Phase: 08-user-profiles-block-unblock*
*Completed: 2026-03-13*
