---
phase: 02-chat-discovery-message-reading
plan: 02
subsystem: api
tags: [gramjs, commander, chat-commands, peer-resolution, dialog-listing, telegram]

# Dependency graph
requires:
  - phase: 02-chat-discovery-message-reading
    plan: 01
    provides: "ChatListItem, ChatInfo, MemberItem types, serializeDialog, serializeMember, resolveEntity, extractInviteHash, bigIntToString, withClient"
provides:
  - "createChatCommand() Commander group with 7 subcommands"
  - "chatListAction: dialog listing with type filtering and pagination"
  - "chatInfoAction: kitchen-sink chat detail for channels, supergroups, groups, users"
  - "chatJoinAction: join by username (JoinChannel) or invite link (ImportChatInvite)"
  - "chatLeaveAction: leave channels (LeaveChannel) or basic groups (DeleteChatUser)"
  - "chatResolveAction: resolve peer by username, ID, or phone"
  - "chatInviteInfoAction: check invite link info (already-member, preview, peek)"
  - "chatMembersAction: list members with pagination and search"
affects: [02-03-PLAN, message-commands, phase-3-write-commands]

# Tech tracking
tech-stack:
  added: []
  patterns: [action-handler-pattern, commander-subcommand-group, invite-link-detection, entity-type-branching]

key-files:
  created:
    - src/commands/chat/index.ts
    - src/commands/chat/list.ts
    - src/commands/chat/info.ts
    - src/commands/chat/join.ts
    - src/commands/chat/leave.ts
    - src/commands/chat/resolve.ts
    - src/commands/chat/invite-info.ts
    - src/commands/chat/members.ts
    - tests/unit/chat-list.test.ts
    - tests/unit/chat-info.test.ts
    - tests/unit/chat-members.test.ts
    - tests/unit/chat-join.test.ts
    - tests/unit/chat-leave.test.ts
    - tests/unit/peer-command.test.ts
    - tests/unit/chat-invite.test.ts
  modified:
    - src/bin/tg.ts

key-decisions:
  - "Chat list fetches offset+limit dialogs then slices, avoids multiple API calls"
  - "Chat info branches on entity instanceof (Channel/Chat/User) for appropriate API calls"
  - "Join detects invite links via regex before attempting username resolution"
  - "Leave uses DeleteChatUser with self-ID for basic groups, LeaveChannel for channels"
  - "CHAT_ADMIN_REQUIRED caught inline with descriptive error rather than generic failure"
  - "vi.hoisted() required for mock classes used in vi.mock() factory to avoid hoisting errors"

patterns-established:
  - "Action handler pattern: optsWithGlobals -> withLock -> withClient -> resolveEntity -> API call -> outputSuccess"
  - "Commander subcommand group: createXCommand() factory returns Command with subcommands"
  - "Entity type branching: instanceof Api.Channel/Chat/User for different API paths"
  - "TDD with hoisted mocks: vi.hoisted for mock classes, vi.mock for module-level mocking"

requirements-completed: [CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07]

# Metrics
duration: 8min
completed: 2026-03-11
---

# Phase 2 Plan 2: Chat Commands Summary

**7 chat subcommands (list, info, join, leave, resolve, invite-info, members) with Commander group wired into CLI entry point, 33 unit tests**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-11T12:33:39Z
- **Completed:** 2026-03-11T12:41:15Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments
- Built all 7 chat subcommands following the established action handler pattern (optsWithGlobals, withLock, withClient, outputSuccess/outputError)
- Created Commander group with createChatCommand() factory, wired into tg.ts with "Chat" help group
- 33 unit tests covering all commands with mocked gramjs API, including error handling edge cases
- Full type safety maintained: TypeScript compiles cleanly across all source and test files

## Task Commits

Each task was committed atomically (TDD: test + feat):

1. **Task 1: Chat discovery commands (list, info, members)**
   - `823975f` (test) - Failing tests for chat list, info, and members (18 tests)
   - `bbf5b8b` (feat) - Implementation: list.ts, info.ts, members.ts
2. **Task 2: Chat action commands (join, leave, resolve, invite-info)**
   - `7cdf79b` (test) - Failing tests for join, leave, resolve, invite-info (15 tests)
   - `8d33d2a` (feat) - Implementation: join.ts, leave.ts, resolve.ts, invite-info.ts
3. **Task 3: Chat Commander group and CLI wiring**
   - `7a77bb5` (feat) - index.ts with 7 subcommands, tg.ts wiring

## Files Created/Modified
- `src/commands/chat/index.ts` - createChatCommand() factory with 7 subcommands registered
- `src/commands/chat/list.ts` - chatListAction: dialog listing with --type, --limit, --offset
- `src/commands/chat/info.ts` - chatInfoAction: kitchen-sink detail (GetFullChannel/GetFullChat branches)
- `src/commands/chat/members.ts` - chatMembersAction: member listing with pagination and search
- `src/commands/chat/join.ts` - chatJoinAction: join by username (JoinChannel) or invite link (ImportChatInvite)
- `src/commands/chat/leave.ts` - chatLeaveAction: leave channels (LeaveChannel) or groups (DeleteChatUser)
- `src/commands/chat/resolve.ts` - chatResolveAction: peer resolution as CLI command
- `src/commands/chat/invite-info.ts` - chatInviteInfoAction: invite link preview (ChatInviteAlready/ChatInvite/ChatInvitePeek)
- `src/bin/tg.ts` - Added createChatCommand import and registration
- `tests/unit/chat-list.test.ts` - 7 tests for dialog listing, filtering, pagination
- `tests/unit/chat-info.test.ts` - 6 tests for channel, supergroup, group, user info
- `tests/unit/chat-members.test.ts` - 5 tests for member listing, pagination, admin errors
- `tests/unit/chat-join.test.ts` - 4 tests for username join, invite join, error handling
- `tests/unit/chat-leave.test.ts` - 3 tests for channel/group leave, error handling
- `tests/unit/peer-command.test.ts` - 4 tests for resolve by username, ID, supergroup
- `tests/unit/chat-invite.test.ts` - 4 tests for already-member, preview, peek, invalid link

## Decisions Made
- Chat list fetches offset+limit dialogs then slices from offset -- single API call is more efficient than two
- Chat info uses instanceof branching (Channel/Chat/User) to select the correct GetFull* API method
- Join command detects invite links via regex before attempting username resolution to avoid unnecessary API calls
- Leave uses different API methods based on entity type: LeaveChannel for Channel instances, DeleteChatUser (with self-ID) for Chat instances
- CHAT_ADMIN_REQUIRED error caught inline in members command with a descriptive message rather than passing through the generic error handler
- Mock classes must use vi.hoisted() in vitest to avoid "Cannot access before initialization" errors in vi.mock() factory functions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed vi.mock hoisting error for mock classes**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Mock classes defined as top-level constants were not accessible inside vi.mock() factory because vi.mock is hoisted before variable declarations
- **Fix:** Moved all mock classes (MockChannel, MockChat, MockUser) into vi.hoisted() blocks
- **Files modified:** tests/unit/chat-info.test.ts, tests/unit/chat-members.test.ts
- **Verification:** All tests pass after fix
- **Committed in:** bbf5b8b (part of Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix for test infrastructure compatibility. No scope creep.

## Issues Encountered
- vitest's -x (bail on first failure) flag is not supported in v3.2.4; --bail 1 is the equivalent but was not needed as tests were run without bail
- First GREEN phase run for chat-info and chat-members tests failed due to mock class hoisting; resolved by using vi.hoisted() pattern

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 7 chat commands ready for interactive use and agent consumption
- Chat discovery provides the foundation for Phase 2 Plan 3 (message reading and search)
- resolveEntity from Plan 01 successfully reused across 5 of 7 commands, validating the shared foundation approach
- All 169 tests pass across the full test suite (33 new + 136 existing)

## Self-Check: PASSED

All 16 files verified present. All 5 commits verified in git log.

---
*Phase: 02-chat-discovery-message-reading*
*Completed: 2026-03-11*
