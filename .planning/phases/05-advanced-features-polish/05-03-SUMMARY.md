---
phase: 05-advanced-features-polish
plan: 03
subsystem: messaging
tags: [forum-topics, multi-chat-search, gramjs, replyTo, commander]

# Dependency graph
requires:
  - phase: 05-01
    provides: Forum topic listing, assertForum guard pattern, topic type definitions
  - phase: 02-03
    provides: Message search infrastructure (single-chat and global)
  - phase: 03-01
    provides: Message send with reply-to support
provides:
  - Topic-scoped message history via --topic flag on history command
  - Topic-scoped message sending via --topic flag on send command
  - Topic-scoped media sending via --topic flag on media send command
  - Topic-scoped search via --topic flag on search command
  - Multi-chat search via comma-separated --chat values
  - Shared assertForum utility in peer.ts
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "assertForum guard extracted to peer.ts for reuse across commands"
    - "topicId overrides replyTo for forum topic scoping in gramjs"
    - "Multi-chat search with per-chat error isolation and merged results"

key-files:
  created: []
  modified:
    - src/lib/peer.ts
    - src/commands/message/history.ts
    - src/commands/message/send.ts
    - src/commands/message/search.ts
    - src/commands/media/send.ts
    - src/commands/message/index.ts
    - src/commands/media/index.ts
    - tests/unit/message-history.test.ts
    - tests/unit/message-send.test.ts
    - tests/unit/message-search.test.ts
    - tests/unit/media-send.test.ts

key-decisions:
  - "assertForum helper centralized in peer.ts rather than duplicated per command file"
  - "--topic overrides --reply-to when both provided (topic scoping IS the replyTo in gramjs)"
  - "--topic + multi-chat search rejected as INVALID_OPTIONS (ambiguous which chat's topic)"
  - "Multi-chat search fetches limit per chat, then sorts and truncates merged results to total limit"

patterns-established:
  - "Forum guard: assertForum(entity, topicId) before topic-aware API calls"
  - "Topic override: topicId takes precedence over replyTo for forum scoping"
  - "Multi-entity iteration with per-item error isolation (try/catch per chat in loop)"

requirements-completed: [WRITE-07, WRITE-08, READ-06]

# Metrics
duration: 5min
completed: 2026-03-12
---

# Phase 5 Plan 3: Topic Scoping & Multi-Chat Search Summary

**Forum topic --topic flag on history/send/search/media-send commands, plus multi-chat search via comma-separated --chat values**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-12T11:01:04Z
- **Completed:** 2026-03-12T11:06:39Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- --topic flag on message history, send, search, and media send for forum topic scoping via gramjs replyTo parameter
- Multi-chat search via comma-separated --chat values with merged results sorted newest-first
- Forum guard (assertForum) extracted to peer.ts for shared use across all topic-aware commands
- Per-chat error isolation in multi-chat search: failed chats log warnings, remaining proceed

## Task Commits

Each task was committed atomically:

1. **Task 1: --topic flag on history, send, and media send commands** - `cb202ee` (feat)
2. **Task 2: Multi-chat search and topic-scoped search** - `09265c6` (feat)

## Files Created/Modified
- `src/lib/peer.ts` - Added assertForum helper for forum entity validation
- `src/commands/message/history.ts` - --topic flag passes replyTo to getMessages
- `src/commands/message/send.ts` - --topic flag passes replyTo to sendMessage, overrides --reply-to
- `src/commands/message/search.ts` - Three-way logic: single-chat (with topic), multi-chat, global search
- `src/commands/media/send.ts` - --topic flag passes replyTo to sendFile, overrides --reply-to
- `src/commands/message/index.ts` - Registered --topic option on history, search, send subcommands
- `src/commands/media/index.ts` - Registered --topic option on media send subcommand
- `tests/unit/message-history.test.ts` - Tests for topic replyTo, forum guard, invalid topic ID
- `tests/unit/message-send.test.ts` - Tests for topic replyTo, topic overrides reply-to, forum guard
- `tests/unit/message-search.test.ts` - Tests for multi-chat merge, truncation, failure handling, topic search
- `tests/unit/media-send.test.ts` - Fixed assertForum mock for compatibility

## Decisions Made
- assertForum helper centralized in peer.ts rather than duplicated per command file (reuses pattern from 05-01 topics.ts but extracted for sharing)
- --topic overrides --reply-to when both provided since topic scoping IS the replyTo parameter in gramjs
- --topic + multi-chat search rejected as INVALID_OPTIONS (ambiguous which chat's topic to target)
- Multi-chat search fetches limit per chat, then sorts and truncates merged results to total limit

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed missing assertForum mock in media-send tests**
- **Found during:** Task 2 (full regression test)
- **Issue:** media-send.test.ts mocked peer.js without assertForum export, causing 7 test failures
- **Fix:** Added mockAssertForum to the peer.js mock in media-send.test.ts
- **Files modified:** tests/unit/media-send.test.ts
- **Verification:** All 379 tests pass
- **Committed in:** 09265c6 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary for test compatibility after adding assertForum import. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All v1 command-level features complete
- Forum topic support fully integrated (listing from 05-01, read/write/search from 05-03)
- Multi-chat search adds final search capability
- Phase 5 fully complete -- all 3 plans delivered

---
*Phase: 05-advanced-features-polish*
*Completed: 2026-03-12*
