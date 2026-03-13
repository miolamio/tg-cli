---
phase: 02-chat-discovery-message-reading
plan: 04
subsystem: chat, messaging
tags: [gramjs, getDialogs, message-search, commander, uat-gap-closure]

# Dependency graph
requires:
  - phase: 02-chat-discovery-message-reading
    provides: chat list, message search commands (plans 02, 03)
provides:
  - Chat list returns actual dialogs (not empty) for all filter/pagination combos
  - Message search --query works without -q shorthand conflict
  - Global search resolves DM chat names from User firstName/lastName
affects: [phase-02-uat, phase-03-write-interact]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "User entity DM name resolution via firstName/lastName fallback"

key-files:
  created: []
  modified:
    - src/commands/chat/list.ts
    - src/commands/message/index.ts
    - src/commands/message/search.ts
    - tests/unit/chat-list.test.ts
    - tests/unit/message-search.test.ts

key-decisions:
  - "Removed ignoreMigrated:true that caused empty chat list results"
  - "Removed -q shorthand from search to avoid global --quiet conflict; --query long form sufficient"
  - "DM chat name resolution uses firstName + optional lastName, matching existing senderName pattern"

patterns-established:
  - "User entity name resolution: check firstName before title for User-type entities"

requirements-completed: [CHAT-01, READ-03, READ-04]

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 2 Plan 04: UAT Gap Closure Summary

**Fixed 5 UAT gaps: removed ignoreMigrated flag, removed -q shorthand conflict, added DM chat name resolution in global search**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-11T19:19:57Z
- **Completed:** 2026-03-11T19:21:50Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Removed `ignoreMigrated: true` from getDialogs call that caused empty chat list results (UAT gaps 1, 2, 3)
- Removed `-q` shorthand from message search `--query` option to avoid conflict with global `--quiet` flag (UAT gap 4)
- Added DM chat name resolution using `firstName`/`lastName` for User entities in global search results (UAT gap 5)
- Added 2 new tests for DM chatTitle resolution (full name and first-name-only cases)
- All 187 tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix chat list ignoreMigrated bug** - `a202646` (fix)
2. **Task 2: Fix message search -q conflict and DM chatTitle** - `c1c855f` (fix)

## Files Created/Modified
- `src/commands/chat/list.ts` - Removed ignoreMigrated:true from getDialogs options
- `src/commands/message/index.ts` - Removed -q shorthand from --query requiredOption
- `src/commands/message/search.ts` - Added DM chat name resolution via firstName/lastName, updated error message
- `tests/unit/chat-list.test.ts` - Updated pagination test assertion (no ignoreMigrated)
- `tests/unit/message-search.test.ts` - Added 2 new tests for DM chat name resolution

## Decisions Made
- Removed ignoreMigrated:true -- this gramjs flag was filtering out all dialogs in certain environments, causing UAT failures for chat list, type filter, and pagination
- Removed -q shorthand instead of renaming it -- the --query long form is sufficient and avoids any future shorthand conflicts
- DM name resolution follows existing senderName pattern from serialize.ts (firstName + optional lastName)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 UAT gaps from Phase 2 verification are resolved
- Phase 2 is fully complete and ready for Phase 3: Write & Interact
- All 187 tests pass across 20 test files

## Self-Check: PASSED

All 5 modified files verified on disk. Both task commits (a202646, c1c855f) verified in git log.

---
*Phase: 02-chat-discovery-message-reading*
*Completed: 2026-03-11*
