---
phase: 05-advanced-features-polish
plan: 01
subsystem: chat
tags: [forum-topics, gramjs, GetForumTopics, TDD, serialization, formatting]

# Dependency graph
requires:
  - phase: 02-chat-discovery-message-reading
    provides: chat command group, resolveEntity, serializeMember pattern
provides:
  - TopicItem type and TopicListOptions interface
  - serializeTopic serializer for gramjs ForumTopic objects
  - formatTopics human-readable formatter with pinned/closed indicators
  - formatData dispatch for topics[] data shape
  - chatTopicsAction handler with forum guard and ForumTopicDeleted filtering
  - topics subcommand on chat command group
affects: [05-03-topic-scoped-operations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Forum guard pattern: className check + forum property validation before API call"
    - "ForumTopicDeleted filtering: className-based filtering of API response items"
    - "Client-side offset slicing for simple pagination on cursor-based APIs"

key-files:
  created:
    - src/commands/chat/topics.ts
    - tests/unit/chat-topics.test.ts
  modified:
    - src/lib/types.ts
    - src/lib/serialize.ts
    - src/lib/format.ts
    - src/commands/chat/index.ts

key-decisions:
  - "messageCount field mapped from gramjs topMessage (latest message ID, not true count) per user decision"
  - "Forum guard checks className=Channel AND forum!==false; undefined/null forum proceeds to API call"
  - "Client-side offset slicing instead of cursor-based offsetTopic for simplicity"
  - "ForumTopicDeleted filtered by className string comparison (not instanceof) for mock compatibility"

patterns-established:
  - "Forum guard: reject non-Channel entities and forum=false with NOT_A_FORUM error code"
  - "Topic serialization: extractPeerId helper for fromId peer shapes (userId/channelId/chatId)"

requirements-completed: [WRITE-06]

# Metrics
duration: 4min
completed: 2026-03-12
---

# Phase 5 Plan 1: Forum Topic Listing Summary

**Forum topic listing via `tg chat topics <chat>` with TopicItem serialization, human-readable formatting, forum guard, and ForumTopicDeleted filtering**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-12T10:53:18Z
- **Completed:** 2026-03-12T10:57:19Z
- **Tasks:** 2 (both TDD: RED -> GREEN)
- **Files modified:** 6

## Accomplishments
- TopicItem type with messageCount field (mapped from gramjs topMessage per user decision)
- serializeTopic converts gramjs ForumTopic with BigInt peer extraction and iconEmojiId handling
- formatTopics renders aligned list with pinned/closed indicators; formatData dispatches topics[] shape
- chatTopicsAction handler with forum guard (NOT_A_FORUM), ForumTopicDeleted filtering, client-side offset pagination
- topics subcommand registered as 8th chat subcommand with --limit and --offset options
- 15 new tests (10 serialization/format + 5 handler), all 365 tests pass, TypeScript clean

## Task Commits

Each task was committed atomically (TDD: test then feat):

1. **Task 1: TopicItem type, serializeTopic, formatTopics** - `03d3d39` (test: failing tests) -> `bced9e1` (feat: implementation)
2. **Task 2: Chat topics command, CLI wiring, handler tests** - `af0dc7c` (test: failing handler tests) -> `b7e16ef` (feat: implementation)

## Files Created/Modified
- `src/lib/types.ts` - Added TopicItem interface and TopicListOptions interface
- `src/lib/serialize.ts` - Added serializeTopic function with extractPeerId helper
- `src/lib/format.ts` - Added formatTopics formatter and topics[] dispatch in formatData
- `src/commands/chat/topics.ts` - chatTopicsAction handler with forum guard and API call
- `src/commands/chat/index.ts` - Registered topics subcommand (8th subcommand)
- `tests/unit/chat-topics.test.ts` - 15 tests covering serialization, formatting, and handler behavior

## Decisions Made
- messageCount field mapped from gramjs topMessage (latest message ID, not true count) per user decision, with JSDoc annotation
- Forum guard checks className==='Channel' AND forum!==false; undefined/null forum proceeds to let API call fail naturally
- Client-side offset slicing for simplicity (gramjs offsetTopic is cursor-based, not skip-based)
- ForumTopicDeleted filtered by className string comparison rather than instanceof for test mock compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- TopicItem type and serializeTopic ready for Plan 03 topic-scoped operations
- Forum guard pattern established for reuse in topic message reading/writing
- All tests pass, no regressions introduced

## Self-Check: PASSED

All 7 files verified present. All 4 commits verified in git log.

---
*Phase: 05-advanced-features-polish*
*Completed: 2026-03-12*
