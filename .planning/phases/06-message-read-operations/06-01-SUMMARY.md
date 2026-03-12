---
phase: 06-message-read-operations
plan: 01
subsystem: api
tags: [gramjs, getMessages, pinned, entity-map, message-by-id, telegram-cli]

# Dependency graph
requires:
  - phase: 02-chat-discovery-message-reading
    provides: serializeMessage, outputSuccess/outputError pipeline, resolveEntity
  - phase: 05-advanced-features-polish
    provides: replies.ts with buildEntityMap pattern, multi-chat search patterns
provides:
  - buildEntityMap shared utility in src/lib/entity-map.ts
  - messageGetAction handler for fetching messages by ID with notFound tracking
  - messagePinnedAction handler for fetching pinned messages with pagination
  - formatGetResult human-readable formatter with notFound footer
affects: [06-message-read-operations]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared entity-map extraction, notFound array pattern for missing IDs, pinned filter with search empty string]

key-files:
  created:
    - src/lib/entity-map.ts
    - src/commands/message/get.ts
    - src/commands/message/pinned.ts
    - tests/unit/message-get.test.ts
    - tests/unit/message-pinned.test.ts
  modified:
    - src/commands/message/replies.ts
    - src/commands/message/index.ts
    - src/lib/format.ts

key-decisions:
  - "Extracted buildEntityMap to shared module rather than duplicating across commands"
  - "Used _sender from gramjs _finishInit for sender resolution in get command (simpler than manual entity map)"
  - "Added formatGetResult dispatch in formatData BEFORE generic messages check to preserve notFound"

patterns-established:
  - "Shared entity-map utility: import buildEntityMap from lib/entity-map.ts for any command needing sender resolution"
  - "notFound tracking: { messages: [...], notFound: [...] } output shape for batch ID lookups"

requirements-completed: [READ-08, READ-09]

# Metrics
duration: 5min
completed: 2026-03-12
---

# Phase 6 Plan 1: Message Read Operations Summary

**Get-by-ID command with batch support and notFound tracking, pinned messages command with pagination, shared entity-map utility**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-12T19:36:14Z
- **Completed:** 2026-03-12T19:41:40Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Extracted buildEntityMap from replies.ts to shared src/lib/entity-map.ts for reuse across commands
- Implemented `tg message get <chat> <ids>` with batch support (max 100), input order preservation, and notFound array
- Implemented `tg message pinned <chat>` with InputMessagesFilterPinned and search: '' workaround for gramjs
- Added formatGetResult human-readable formatter with dim "Not found: ..." footer
- Updated formatData dispatch to handle { messages, notFound } shape before generic messages check
- All 401 tests pass (12 new), build clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract shared entity-map utility and implement get-by-ID command** - `8176580` (feat)
2. **Task 2: Implement pinned messages command, human-readable formatters, and wire subcommands** - `324306e` (feat)

## Files Created/Modified
- `src/lib/entity-map.ts` - Shared buildEntityMap utility extracted from replies.ts
- `src/commands/message/get.ts` - messageGetAction handler for get-by-ID with batch/notFound support
- `src/commands/message/pinned.ts` - messagePinnedAction handler for pinned messages with pagination
- `src/commands/message/replies.ts` - Updated to import buildEntityMap from shared module
- `src/commands/message/index.ts` - Registered get and pinned subcommands
- `src/lib/format.ts` - Added formatGetResult and updated formatData dispatch
- `tests/unit/message-get.test.ts` - 7 unit tests for get-by-ID command
- `tests/unit/message-pinned.test.ts` - 5 unit tests for pinned command

## Decisions Made
- Extracted buildEntityMap to shared module rather than duplicating, keeping replies.ts as an import consumer
- Used gramjs _sender property (populated by _finishInit) for sender resolution in get command, simpler than manual entity map lookup
- Placed formatGetResult dispatch in formatData BEFORE the generic messages array check to avoid notFound being silently dropped
- Used search: '' with InputMessagesFilterPinned per research Pitfall 4 to force gramjs Search path

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both read commands fully operational with JSON, human-readable, JSONL, and field-selection output
- Shared entity-map utility available for future commands needing sender resolution
- Ready for next plan in phase 6 or subsequent phases

---
*Phase: 06-message-read-operations*
*Completed: 2026-03-12*
