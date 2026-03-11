---
phase: 02-chat-discovery-message-reading
plan: 03
subsystem: api
tags: [gramjs, commander, message-history, message-search, pagination, date-filtering, telegram]

# Dependency graph
requires:
  - phase: 02-chat-discovery-message-reading
    plan: 01
    provides: "MessageItem, SearchResultItem types, serializeMessage, serializeSearchResult, bigIntToString, resolveEntity, withClient"
  - phase: 02-chat-discovery-message-reading
    plan: 02
    provides: "createChatCommand pattern, action handler pattern (optsWithGlobals, withLock, withClient, outputSuccess)"
provides:
  - "createMessageCommand() Commander group with history and search subcommands"
  - "messageHistoryAction: chat history with --limit/--offset pagination, --since/--until date filtering"
  - "messageSearchAction: per-chat search with --chat + -q, global search without --chat (includes chatId/chatTitle)"
  - "Complete Phase 2: CLI has all 4 command groups (Auth, Session, Chat, Message)"
affects: [phase-3-write-commands, advanced-search, agent-workflows]

# Tech tracking
tech-stack:
  added: []
  patterns: [post-filter-for-since-date, server-side-offsetDate-for-until, global-search-undefined-entity]

key-files:
  created:
    - src/commands/message/index.ts
    - src/commands/message/history.ts
    - src/commands/message/search.ts
    - tests/unit/message-history.test.ts
    - tests/unit/message-search.test.ts
  modified:
    - src/bin/tg.ts
    - tests/integration/cli-entry.test.ts

key-decisions:
  - "Post-filter strategy for --since: fetch messages, filter by date client-side for reliability over gramjs minDate API"
  - "Server-side offsetDate for --until: efficient server-side filtering via gramjs offsetDate param"
  - "Global search passes undefined entity to getMessages for cross-chat search"
  - "chatId/chatTitle extracted from msg.peerId and msg.chat for global search results"
  - "Commander requiredOption for --query plus action-level validation for better error message"

patterns-established:
  - "Date range filtering: --until via offsetDate (server), --since via post-filter (client)"
  - "Global vs per-chat search: entity presence controls search scope"
  - "SearchResultItem extends MessageItem with chat context for global results"

requirements-completed: [READ-01, READ-02, READ-03, READ-04]

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 2 Plan 3: Message History & Search Summary

**Message history with pagination and date filtering, per-chat and global keyword search with chatId/chatTitle in results, completing Phase 2**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-11T12:44:24Z
- **Completed:** 2026-03-11T12:47:37Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Built message history command with --limit/--offset pagination, --since post-filter, --until server-side offsetDate
- Built message search command with per-chat (--chat + -q) and global (-q only) modes, global results include chatId and chatTitle
- Created Commander group with createMessageCommand() factory, wired into CLI as 4th command group (Message)
- Full test suite passes: 185 tests (13 new message tests + 3 new integration tests)

## Task Commits

Each task was committed atomically (TDD: test then feat):

1. **Task 1: Message history and search commands (TDD)**
   - `338e3b2` (test) - Failing tests for message history and search (13 tests)
   - `1738607` (feat) - Implementation: history.ts, search.ts
2. **Task 2: Message Commander group, CLI wiring, integration**
   - `ccbc8d0` (feat) - index.ts, tg.ts wiring, 3 integration tests

## Files Created/Modified
- `src/commands/message/index.ts` - createMessageCommand() factory with history and search subcommands registered
- `src/commands/message/history.ts` - messageHistoryAction: reads history with limit/offset/since/until date filtering
- `src/commands/message/search.ts` - messageSearchAction: per-chat search with --chat, global search without, required --query validation
- `src/bin/tg.ts` - Added createMessageCommand import and registration with "Message" help group
- `tests/unit/message-history.test.ts` - 7 tests: basic listing, pagination, --since filter, --until offsetDate, combined, empty chat, auth check
- `tests/unit/message-search.test.ts` - 6 tests: per-chat search, global search, chatId/chatTitle, missing -q error, pagination, auth check
- `tests/integration/cli-entry.test.ts` - 3 new tests: chat --help (7 subcmds), message --help (2 subcmds), all 4 groups in root --help

## Decisions Made
- Post-filter strategy for --since: gramjs minDate API through getMessages is unreliable, so we fetch messages and filter client-side by checking date >= sinceMs. Works well with newest-first ordering.
- Server-side offsetDate for --until: gramjs passes offsetDate directly to Telegram API, efficient and reliable for "before this date" queries.
- Global search uses undefined entity: gramjs client.getMessages(undefined, { search }) triggers cross-chat search through the Telegram API.
- chatId extracted from peerId using channelId || chatId || userId fallback chain via bigIntToString.
- chatTitle extracted from msg.chat?.title with fallback to chatId string for chats without a title field.
- Commander requiredOption('-q, --query') for clear --help output, plus action-level validation for a more descriptive error message than Commander's default.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 2 fully complete: all chat discovery and message reading commands operational
- CLI exposes 4 command groups (Auth, Session, Chat, Message) with 12 total subcommands
- All shared libraries (types, serialize, peer, client) proven across both chat and message commands
- Ready for Phase 3 (Write & Interact) which will add message sending and reply capabilities

## Self-Check: PASSED

All 7 files verified present. All 3 commits verified in git log.

---
*Phase: 02-chat-discovery-message-reading*
*Completed: 2026-03-11*
