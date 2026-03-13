---
phase: 05-advanced-features-polish
plan: 02
subsystem: output
tags: [jsonl, field-selection, cli-options, streaming, dot-notation]

# Dependency graph
requires:
  - phase: 03-messaging-interaction
    provides: output.ts outputSuccess/outputError, formatData in human mode
provides:
  - pickFields utility with dot-notation support for field filtering
  - applyFieldSelection for metadata-preserving array item filtering
  - extractListItems for detecting known list shapes (messages, chats, members, topics, files)
  - JSONL streaming mode (bare objects per line, no envelope)
  - --fields and --jsonl global CLI options
affects: [all-commands, agent-pipelines]

# Tech tracking
tech-stack:
  added: []
  patterns: [field-selection-with-dot-notation, jsonl-streaming, output-mode-composition]

key-files:
  created:
    - src/lib/fields.ts
    - tests/unit/fields.test.ts
  modified:
    - src/lib/output.ts
    - src/lib/types.ts
    - src/bin/tg.ts
    - tests/unit/output.test.ts

key-decisions:
  - "setFieldSelection accepts null to reset, enabling clean test teardown"
  - "JSONL non-list data falls through to normal JSON envelope (graceful degradation)"
  - "JSONL errors go to stderr as plain text, no envelope wrapping"

patterns-established:
  - "Field selection: pickFields with dot-notation path walking, silent omission of invalid paths"
  - "Output mode composition: JSONL > human > JSON priority chain in outputSuccess"
  - "Metadata preservation: applyFieldSelection filters array items but preserves scalar entries"

requirements-completed: [OUT-04, OUT-05]

# Metrics
duration: 4min
completed: 2026-03-12
---

# Phase 05 Plan 02: Output Enhancements Summary

**Field selection (--fields) with dot-notation and JSONL streaming (--jsonl) as composable global CLI options for pipe-friendly agent consumption**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-12T10:53:22Z
- **Completed:** 2026-03-12T10:57:06Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- pickFields utility handles flat and dot-notation paths with silent omission of missing fields
- applyFieldSelection preserves metadata (total, count) alongside filtered array items
- extractListItems detects messages[], chats[], members[], topics[], files[] shapes
- JSONL mode writes bare objects per line without envelope, composing with field selection
- Mutual exclusion of --jsonl and --human enforced with INVALID_OPTIONS error
- 51 total tests (23 fields + 28 output) all pass, zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Field selection utility and JSONL helpers with tests** - `49e05ed` (test: RED), `082bfbd` (feat: GREEN)
2. **Task 2: Integrate JSONL mode and field selection into output.ts, types.ts, and tg.ts** - `1d1436a` (feat)

_Note: Task 1 used TDD with RED/GREEN commits._

## Files Created/Modified
- `src/lib/fields.ts` - pickFields, applyFieldSelection, extractListItems utilities
- `tests/unit/fields.test.ts` - 23 unit tests for field selection utilities
- `src/lib/output.ts` - JSONL mode, field selection integration, setJsonlMode/setFieldSelection exports
- `src/lib/types.ts` - Extended GlobalOptions with fields/jsonl properties
- `src/bin/tg.ts` - Registered --fields/--jsonl global options, preAction mutual exclusion check
- `tests/unit/output.test.ts` - Extended with JSONL and field selection test scenarios (28 total)

## Decisions Made
- setFieldSelection accepts null to reset state, enabling clean test teardown without type casting workarounds
- JSONL mode with non-list data gracefully falls through to normal JSON envelope output
- JSONL errors write to stderr as plain text (no JSON envelope), consistent with streaming semantics

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Output enhancement features complete and composable with all existing commands
- Enables agent pipeline patterns like `tg message search --query "bug" --jsonl --fields id,text | jq .text`
- Ready for plan 05-03

## Self-Check: PASSED

All 6 created/modified files verified on disk. All 3 task commits (49e05ed, 082bfbd, 1d1436a) verified in git log.

---
*Phase: 05-advanced-features-polish*
*Completed: 2026-03-12*
