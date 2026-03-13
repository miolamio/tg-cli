---
phase: 08-user-profiles-block-unblock
plan: 02
subsystem: api
tags: [gramjs, user-profile, block, unblock, blocked-list, formatters, cli-wiring]

# Dependency graph
requires:
  - phase: 08-user-profiles-block-unblock
    provides: "UserProfile, BlockResult, BlockedListItem types; profile, block, unblock action handlers"
  - phase: 07-message-write-operations
    provides: "translateTelegramError, formatMembers pattern, CLI command group pattern"
provides:
  - "userBlockedAction handler with pagination (offset/limit)"
  - "formatUserProfile with color-coded lastSeen, restricted phone, bot fields"
  - "formatBlockedList delegating to formatMembers"
  - "formatData auto-dispatch for UserProfileResult, BlockedListResult, BlockResult"
  - "LIST_KEYS extended with 'profiles' and 'users' for --fields/--jsonl"
  - "createUserCommand() wiring all 4 subcommands"
  - "User command group registered in CLI with help heading"
affects: [user-cli, future-user-features]

# Tech tracking
tech-stack:
  added: []
  patterns: [command-group-wiring, formatData-shape-dispatch, LIST_KEYS-extension]

key-files:
  created:
    - src/commands/user/blocked.ts
    - src/commands/user/index.ts
  modified:
    - src/lib/format.ts
    - src/lib/fields.ts
    - src/bin/tg.ts
    - tests/unit/user-blocked.test.ts
    - tests/unit/format.test.ts
    - tests/unit/output.test.ts
    - tests/integration/cli-entry.test.ts

key-decisions:
  - "BlockedListItem cast to MemberItem for formatMembers reuse (compatible shapes minus optional status field)"
  - "formatData dispatch order: UserProfileResult and BlockedListResult checks placed before DownloadResult to ensure correct shape matching"

patterns-established:
  - "formatUserProfile key-value pair pattern: color-coded lastSeen (green=online, dim=approximate), conditional flags"
  - "BlockResult dispatch: firstName || username || userId fallback chain for display name"

requirements-completed: [USER-01, USER-02, USER-03, USER-04]

# Metrics
duration: 4min
completed: 2026-03-13
---

# Phase 8 Plan 02: Blocked List, Formatters, CLI Wiring Summary

**Blocked list command with pagination, formatUserProfile/formatBlockedList formatters, formatData auto-dispatch for 3 new shapes, and complete user command group CLI wiring**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-13T09:38:05Z
- **Completed:** 2026-03-13T09:42:05Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Implemented blocked list command handling both contacts.Blocked and contacts.BlockedSlice API response types with correct total computation
- Added formatUserProfile rendering aligned key-value pairs with color-coded lastSeen, restricted phone indicator, and conditional bot/blocked/premium/verified flags
- Extended formatData with 3 new shape dispatches (UserProfileResult, BlockedListResult, BlockResult)
- Updated LIST_KEYS with 'profiles' and 'users' enabling --fields and --jsonl for all user commands
- Created and registered user command group with profile, block, unblock, blocked subcommands
- 32 new tests across 4 test files; full suite 525 tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement blocked list command with test** - `e0beb28` (feat)
2. **Task 2: Add formatters, formatData dispatch, fields.ts, command group, CLI wiring** - `ce08a69` (feat)

## Files Created/Modified
- `src/commands/user/blocked.ts` - Blocked list handler with contacts.GetBlocked, dual response type handling, userMap lookup
- `src/commands/user/index.ts` - User command group factory with profile, block, unblock, blocked subcommands
- `src/lib/format.ts` - Added formatUserProfile, formatBlockedList, 3 new formatData shape dispatches
- `src/lib/fields.ts` - Extended LIST_KEYS with 'profiles' and 'users'
- `src/bin/tg.ts` - Registered user command group with User help heading
- `tests/unit/user-blocked.test.ts` - 5 tests for blocked list (empty, non-empty, both response types, errors)
- `tests/unit/format.test.ts` - 22 new tests for formatUserProfile, formatBlockedList, formatData dispatch
- `tests/unit/output.test.ts` - 2 new JSONL tests for profiles and users LIST_KEYS
- `tests/integration/cli-entry.test.ts` - 2 new tests for user command group in CLI help

## Decisions Made
- Cast BlockedListItem to MemberItem for formatMembers reuse -- shapes are compatible (BlockedListItem lacks optional status field, which formatMembers handles gracefully)
- Placed new formatData dispatches before DownloadResult check to ensure correct shape matching priority

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 8 complete: all 4 user commands (profile, block, unblock, blocked) fully integrated with CLI
- All output modes working: JSON envelope, human-readable, JSONL, field selection
- Ready for Phase 9 (Contacts) or subsequent phases

## Self-Check: PASSED

All 9 created/modified files verified present. Both task commits (e0beb28, ce08a69) verified in git history. 525/525 tests passing. Type-check clean.

---
*Phase: 08-user-profiles-block-unblock*
*Completed: 2026-03-13*
