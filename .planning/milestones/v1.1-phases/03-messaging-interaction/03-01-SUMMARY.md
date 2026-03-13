---
phase: 03-messaging-interaction
plan: 01
subsystem: messaging
tags: [gramjs, sendMessage, forwardMessages, SendReaction, ReactionEmoji, stdin, commander]

# Dependency graph
requires:
  - phase: 02-chat-discovery-message-reading
    provides: resolveEntity, serializeMessage, withClient, outputSuccess/outputError patterns
provides:
  - messageSendAction handler with reply and stdin support
  - messageForwardAction handler with batch forwarding and ID validation
  - messageReactAction handler with Api.ReactionEmoji wrapper and --remove flag
  - SendOptions, ForwardOptions, ReactOptions type interfaces
  - message command group wired with send, forward, react subcommands
affects: [03-messaging-interaction, 04-media-handling]

# Tech tracking
tech-stack:
  added: []
  patterns: [stdin piping via dash placeholder, Api.ReactionEmoji wrapping, batch forward with fromPeer]

key-files:
  created:
    - src/commands/message/send.ts
    - src/commands/message/forward.ts
    - src/commands/message/react.ts
    - tests/unit/message-send.test.ts
    - tests/unit/message-forward.test.ts
    - tests/unit/message-react.test.ts
  modified:
    - src/lib/types.ts
    - src/commands/message/index.ts

key-decisions:
  - "gramjs built-in MarkdownParser handles bold/italic/code/links -- no custom markdown-to-entities parser needed"
  - "Reactions use Api.ReactionEmoji wrapper objects, not plain strings (avoids getBytes error)"
  - "Forward always passes fromPeer to avoid PEER_ID_INVALID with integer message IDs"
  - "Stdin reading uses async iteration on process.stdin with isTTY guard to prevent hangs"

patterns-established:
  - "Stdin piping: dash placeholder (-) as text argument reads from process.stdin with isTTY guard"
  - "Batch forward: comma-separated IDs parsed and validated (NaN rejected) before API call"
  - "Low-level API: client.invoke() with Api.messages.SendReaction for reactions (no high-level wrapper)"

requirements-completed: [WRITE-01, WRITE-02, WRITE-03, WRITE-05]

# Metrics
duration: 5min
completed: 2026-03-11
---

# Phase 3 Plan 1: Write Commands Summary

**Send, forward, and react commands with TDD -- gramjs sendMessage with built-in markdown, batch forwardMessages with fromPeer, and SendReaction with Api.ReactionEmoji wrapper**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T20:18:08Z
- **Completed:** 2026-03-11T20:23:44Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Send command with reply support (--reply-to), stdin piping via dash placeholder, and empty text validation
- Forward command with batch forwarding via comma-separated IDs, NaN rejection, and fromPeer to avoid PEER_ID_INVALID
- React command using proper Api.ReactionEmoji wrapper with --remove flag for reaction removal
- All three commands wired into message group alongside existing history and search
- Phase 3 types (SendOptions, ForwardOptions, ReactOptions) added to types.ts
- 17 new unit tests, full suite green (204 tests across 23 files), build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Types + send command with reply support** - `a1b30c3` (feat)
2. **Task 2: Forward + react commands, wire all into index.ts** - `de744a7` (feat)

_Note: TDD tasks -- tests written first (RED), then implementation (GREEN)_

## Files Created/Modified
- `src/lib/types.ts` - Added SendOptions, ForwardOptions, ReactOptions interfaces
- `src/commands/message/send.ts` - Send action handler with reply, stdin, markdown support
- `src/commands/message/forward.ts` - Forward action handler with batch API and ID validation
- `src/commands/message/react.ts` - React action handler with Api.ReactionEmoji wrapper
- `src/commands/message/index.ts` - Wired send, forward, react into message command group
- `tests/unit/message-send.test.ts` - 7 tests for send command
- `tests/unit/message-forward.test.ts` - 5 tests for forward command
- `tests/unit/message-react.test.ts` - 5 tests for react command

## Decisions Made
- Used gramjs built-in MarkdownParser (default parse mode) instead of building custom markdown-to-entities parser
- Reactions wrapped with Api.ReactionEmoji objects (not plain strings) to avoid runtime getBytes errors
- Forward always passes fromPeer parameter to handle integer message IDs correctly
- Stdin piping checks process.stdin.isTTY before reading to prevent interactive hang
- Reaction removal sends empty array (removes all user reactions) rather than trying to remove specific emoji

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed vitest mock hoisting for Api type constructors**
- **Found during:** Task 2 (react tests)
- **Issue:** mockSendReactionConstructor and mockReactionEmojiConstructor were defined outside vi.hoisted() but used in vi.mock factory, causing "Cannot access before initialization" error
- **Fix:** Moved both constructor mocks into the vi.hoisted() block
- **Files modified:** tests/unit/message-react.test.ts
- **Verification:** All 5 react tests pass
- **Committed in:** de744a7 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Standard mock hoisting fix for vitest. No scope creep.

## Issues Encountered
- vitest `-x` flag does not exist in v3.2.4; used `--bail 1` instead (cosmetic, not blocking)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All write commands implemented and tested, ready for Plan 2 (human-readable output)
- Send, forward, react follow established patterns from Phase 2 (same boilerplate structure)
- message command group now has full read/write capabilities: history, search, send, forward, react

---
*Phase: 03-messaging-interaction*
*Completed: 2026-03-11*

## Self-Check: PASSED

All 7 created files exist on disk. Both task commits (a1b30c3, de744a7) verified in git log.
