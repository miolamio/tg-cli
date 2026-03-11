---
phase: 02-chat-discovery-message-reading
plan: 01
subsystem: api
tags: [gramjs, serialization, markdown, peer-resolution, typescript]

# Dependency graph
requires:
  - phase: 01-foundation-auth
    provides: "withClient, TgError, output helpers, types.ts base interfaces"
provides:
  - "ChatListItem, ChatInfo, MemberItem, MessageItem, SearchResultItem type interfaces"
  - "serializeDialog, serializeMessage, serializeSearchResult, serializeMember functions"
  - "entitiesToMarkdown entity-to-Markdown conversion"
  - "resolveEntity peer resolution (username, ID, phone, invite links)"
  - "extractInviteHash invite link parsing"
  - "withClient configurable timeout (120s default)"
affects: [02-02-PLAN, 02-03-PLAN, chat-commands, message-commands]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared-serialization-layer, entity-type-instanceof-checking, bigint-to-string-conversion, offset-descending-entity-processing]

key-files:
  created:
    - src/lib/entity-to-markdown.ts
    - src/lib/serialize.ts
    - src/lib/peer.ts
    - tests/unit/entity-markdown.test.ts
    - tests/unit/serialize.test.ts
    - tests/unit/peer-resolve.test.ts
  modified:
    - src/lib/types.ts
    - src/lib/client.ts
    - tests/unit/client.test.ts

key-decisions:
  - "BigInt IDs always serialized via .toString() helper, never Number()"
  - "Entity-to-markdown processes entities offset-descending to avoid index shifts"
  - "withClient default timeout raised from 30s to 120s for Phase 2 large operations"
  - "Peer resolution wraps errors with PEER_NOT_FOUND and INVALID_INVITE codes"
  - "Service message actionText derived from action constructor name"

patterns-established:
  - "Shared serialization: all commands import from serialize.ts for consistent output shapes"
  - "bigIntToString helper for safe BigInteger-to-string conversion across all IDs"
  - "resolveEntity as unified peer input parser for all chat-accepting commands"
  - "TDD flow: RED (failing tests) -> GREEN (implementation) committed separately"

requirements-completed: [CHAT-05]

# Metrics
duration: 7min
completed: 2026-03-11
---

# Phase 2 Plan 1: Shared Foundation Layer Summary

**Type interfaces, dialog/message serialization with entity-to-markdown, peer resolution for all input formats, and configurable withClient timeout**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-11T12:23:00Z
- **Completed:** 2026-03-11T12:30:11Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Created shared type interfaces (ChatListItem, ChatInfo, MemberItem, MessageItem, SearchResultItem) used by all Phase 2 commands
- Built serialization layer with correct dialog type discrimination (user/group/channel/supergroup), ISO 8601 dates, BigInt string IDs, and entity-to-markdown conversion
- Implemented peer resolution accepting username, @username, numeric ID, phone, and invite links with proper error wrapping
- Raised withClient default timeout from 30s to 120s with configurable override for Phase 2 large operations

## Task Commits

Each task was committed atomically (TDD: test + feat):

1. **Task 1: Type definitions, serialization layer, and entity-to-markdown**
   - `21fb4fe` (test) - Failing tests for serialize and entity-markdown (46 tests)
   - `6d0964c` (feat) - Implementation: types.ts, entity-to-markdown.ts, serialize.ts
2. **Task 2: Peer resolution helper and withClient timeout fix**
   - `2c5d2ab` (test) - Failing tests for peer resolution (17 tests)
   - `3a39117` (feat) - Implementation: peer.ts, client.ts timeout update

## Files Created/Modified
- `src/lib/types.ts` - Added 10 interfaces for Phase 2: ChatListItem, ChatInfo, MemberItem, MessageItem, SearchResultItem, and 5 options types
- `src/lib/entity-to-markdown.ts` - Converts Telegram MessageEntity[] to Markdown (bold, italic, code, pre, textUrl, strike, blockquote, mentionName)
- `src/lib/serialize.ts` - serializeDialog, serializeMessage, serializeSearchResult, serializeMember, bigIntToString
- `src/lib/peer.ts` - resolveEntity, extractInviteHash for all peer input formats
- `src/lib/client.ts` - withClient now accepts optional { timeout } parameter, default 120s
- `tests/unit/entity-markdown.test.ts` - 14 tests for entity-to-markdown conversion
- `tests/unit/serialize.test.ts` - 32 tests for dialog/message/member serialization
- `tests/unit/peer-resolve.test.ts` - 17 tests for peer resolution and invite hash extraction
- `tests/unit/client.test.ts` - Updated existing tests + 2 new tests for configurable timeout

## Decisions Made
- BigInt IDs always go through bigIntToString() helper for null safety and consistent string output
- Entity-to-markdown processes entities in offset-descending order to avoid index shifts during replacement
- withClient default timeout raised to 120s (was 30s) since Phase 2 operations like large dialog lists can exceed 30s
- Service messages derive actionText from the action class constructor name with "MessageAction" prefix stripped
- Peer resolution uses instanceof checks for TgError to avoid double-wrapping already-structured errors

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Test mockDialog/mockMessage helpers initially used `??` operator which doesn't distinguish explicit `undefined`/`null` overrides from missing keys; fixed by using spread operator (`{ ...defaults, ...overrides }`)
- Test timestamp comment had incorrect expected value (09:15 instead of 09:55 for Unix 1710150900); corrected after first test run

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All shared library modules ready for Phase 2 commands (Plans 02-02 and 02-03)
- serializeDialog and serializeMessage provide consistent output shapes for chat list, chat info, message history, and search commands
- resolveEntity provides unified peer input parsing for all commands accepting chat identifiers
- withClient timeout is configurable per-command for operations that may take longer

## Self-Check: PASSED

All 9 files verified present. All 4 commits verified in git log.

---
*Phase: 02-chat-discovery-message-reading*
*Completed: 2026-03-11*
