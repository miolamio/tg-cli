---
phase: 03-messaging-interaction
plan: 02
subsystem: output
tags: [picocolors, formatters, human-readable, negatable-option, preAction-hook, mode-aware-output]

# Dependency graph
requires:
  - phase: 03-messaging-interaction
    provides: send, forward, react commands; MessageItem, ChatListItem, ChatInfo, MemberItem, SearchResultItem types
  - phase: 02-chat-discovery-message-reading
    provides: outputSuccess/outputError patterns, all chat/message command handlers
provides:
  - format.ts with formatMessages, formatChatList, formatChatInfo, formatMembers, formatSearchResults, formatGeneric, formatData auto-dispatcher
  - mode-aware outputSuccess (human via formatData) and outputError (stderr with color in human mode)
  - setOutputMode/getOutputMode API for programmatic mode control
  - --no-json negatable option and --human flag with preAction hook in tg.ts
affects: [04-media-handling, 05-advanced-features]

# Tech tracking
tech-stack:
  added: []
  patterns: [preAction hook for cross-cutting output mode, auto-dispatching formatData shape detection, mode-aware output functions]

key-files:
  created:
    - src/lib/format.ts
    - tests/unit/format.test.ts
  modified:
    - src/lib/output.ts
    - src/bin/tg.ts
    - tests/unit/output.test.ts

key-decisions:
  - "preAction hook sets output mode globally -- no individual command handler changes needed"
  - "formatData auto-detects data shapes (messages, chats, members, search results, chat info) for smart formatting"
  - "Human-mode errors go to stderr with colored prefix; JSON-mode errors go to stdout as before"
  - "Commands with no specific formatter (auth, session, join, leave, react) fall through to formatGeneric (pretty JSON)"

patterns-established:
  - "Cross-cutting concern via preAction: add global behavior without touching individual commands"
  - "Shape-based auto-dispatch: formatData checks data structure to select formatter"
  - "Mode-aware output: outputSuccess/outputError check _humanMode flag to decide rendering"

requirements-completed: [OUT-03]

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 3 Plan 2: Human-Readable Output Summary

**Human-readable --human/--no-json output mode with picocolors formatters for messages, chats, members, search results, plus mode-aware outputSuccess/outputError dispatching**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T20:26:52Z
- **Completed:** 2026-03-11T20:31:01Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created format.ts with 7 exported formatters (formatMessages, formatChatList, formatChatInfo, formatMembers, formatSearchResults, formatGeneric, formatData)
- Updated output.ts with setOutputMode/getOutputMode and mode-aware outputSuccess (dispatches to formatData in human mode) and outputError (writes colored text to stderr in human mode)
- Added --no-json negatable option and preAction hook in tg.ts for automatic mode detection
- Verified all 17 existing command handlers work without changes -- preAction + formatData architecture handles the cross-cutting concern centrally
- 22 new format tests + 8 new output mode tests (TDD: RED then GREEN), full suite 234 tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Format module, mode-aware output, and --no-json flag** - `6906ff7` (feat)
2. **Task 2: Retrofit all existing commands for human output compatibility** - No commit (verification-only task, all commands work without changes)

_Note: TDD task -- tests written first (RED), then implementation (GREEN)_

## Files Created/Modified
- `src/lib/format.ts` - Human-readable formatters for all data types with picocolors styling
- `src/lib/output.ts` - Mode-aware outputSuccess/outputError with setOutputMode/getOutputMode
- `src/bin/tg.ts` - Added --no-json negatable option and preAction hook for output mode
- `tests/unit/format.test.ts` - 22 tests for all formatters and auto-dispatch
- `tests/unit/output.test.ts` - 8 new tests for mode-aware output behavior

## Decisions Made
- Used preAction hook to set output mode globally, eliminating need to modify any individual command handler
- formatData auto-detects data shapes by checking for known properties (messages array with chatTitle for search, chats array for chat list, etc.)
- Human-mode errors write to stderr with `pc.red('Error: ')` prefix plus dim code suffix -- consistent with existing stderr-for-status convention
- Commands without specific formatters (auth, session, join/leave, react, resolve, invite-info) fall through to formatGeneric which pretty-prints JSON -- acceptable minimum for human readability
- session/export special case naturally works because its raw-string path bypasses outputSuccess entirely

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 3 complete (both plans). All write commands and human-readable output implemented
- Ready for Phase 4 (media handling) or Phase 5 (advanced features)
- Human output formatting can be extended with new formatters as new command types are added
- picocolors auto-disables colors when output is piped (no additional configuration needed)

---
*Phase: 03-messaging-interaction*
*Completed: 2026-03-11*

## Self-Check: PASSED

All 5 created/modified files exist on disk. Task 1 commit (6906ff7) verified in git log. SUMMARY.md created.
