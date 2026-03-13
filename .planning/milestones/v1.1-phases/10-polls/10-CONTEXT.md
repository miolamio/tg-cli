# Phase 10: Polls - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Send polls to any chat with full configuration: basic polls, quiz mode, multiple choice, anonymous/public, auto-close timer. Includes client-side validation, poll data serialization in MessageItem, and human-readable formatting. No poll voting, poll closing, or poll result retrieval beyond what's included in message serialization.

</domain>

<decisions>
## Implementation Decisions

### Poll response shape
- Returns full MessageItem via `serializeMessage()` — same as send/edit commands
- Extend serialization with a `poll` field in MessageItem containing structured poll data: question, options[], isQuiz, isPublic, isMultiple, closeDate, correctOption, solution
- The `poll` field appears on ALL poll messages everywhere (history, get, pinned) — not just the poll command response
- Vote counts included in the poll field structure (per-option voters count, totalVoters) — Claude's discretion on exact structure

### Human-readable poll display
- Expanded multi-line format showing question + numbered options + config tags
- Format: `📊 Poll: {question}\n  1. {option1}\n  2. {option2}\n  {tags}`
- Config tags on last line: Quiz · Public · Multiple · Closes in {N}s (only show applicable tags)
- Quiz polls mark correct answer with checkmark: `2. Paris ✓`
- Polls with votes show counts: `1. Red (5 votes)`
- Same expanded format used in history/get, not just send confirmation
- Closed polls show "Closed" tag and total voter count

### Validation behavior
- Fail-fast: report first validation error and exit (consistent with edit/delete/pin)
- Strict client-side validation:
  - `--question` required (non-empty)
  - 2-10 options required
  - Option text ≤100 chars per option
  - Question text ≤300 chars
  - `--correct` required when `--quiz` is set
  - `--correct` index must be in range (1-based indexing)
  - `--solution` requires `--quiz` mode — error otherwise
  - `--multiple` conflicts with `--quiz` — error
  - `--close-in` must be > 0 seconds (no client-side max — let Telegram API reject)
- `--correct` uses 1-based indexing (matches numbered display: option 1, 2, 3...)

### Edge case handling
- Duplicate option text: rejected with error "Duplicate option text: '{text}'"
- Whitespace-only or empty options: rejected with error (no silent trimming)
- Empty `--question`: rejected with error
- `--close-in` seconds only — no human-friendly duration parsing (e.g., no '5m')

### Claude's Discretion
- gramjs API method for sending polls (likely `client.sendMessage` with `poll` parameter or direct API call)
- Exact poll serialization field structure and naming
- Vote count field inclusion (per-option or summary) in serialization
- Error code naming conventions for validation errors
- How `--close-in` converts to Telegram's closeDate (relative to absolute timestamp)

</decisions>

<specifics>
## Specific Ideas

- Poll command is a subcommand under message: `tg message poll <chat>` — not a separate top-level command
- Follows the same explicit-over-implicit philosophy as delete's --revoke/--for-me requirement
- `--option` is a repeatable flag: `--option "Red" --option "Blue" --option "Green"` (Commander supports this natively)
- The strict validation means agents get clear error codes before wasting an API call

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `serializeMessage()` (`src/lib/serialize.ts`): Extend to extract poll data from gramjs message.media
- `resolveEntity()` (`src/lib/peer.ts`): Peer resolution for chat argument
- `withClient()` / `SessionStore` / `createConfig()`: Standard command boilerplate
- `outputSuccess()` / `outputError()` (`src/lib/output.ts`): JSON envelope output
- `formatError()` (`src/lib/errors.ts`): Error code extraction and translation
- `formatData()` (`src/lib/format.ts`): Human-readable format dispatcher — add poll formatter

### Established Patterns
- Command registration in `src/commands/message/index.ts` — add `poll` subcommand
- `optsWithGlobals()` for merging local and global options
- Write commands return serialized MessageItem via `serializeMessage()`
- Repeatable options in Commander: `.option('--option <text>', 'Poll option', collect, [])` with collect helper
- Validation errors use `outputError(message, code)` with descriptive error codes

### Integration Points
- `src/commands/message/index.ts`: Register `poll` subcommand with --question, --option (repeatable), --quiz, --correct, --solution, --multiple, --public, --close-in
- `src/commands/message/poll.ts`: New command file (poll action + validation)
- `src/lib/serialize.ts`: Extend serializeMessage() to extract poll data into `poll` field
- `src/lib/types.ts`: Add PollData interface for the nested poll field
- `src/lib/format.ts`: Add human-readable poll formatter (expanded multi-line format)
- `src/lib/fields.ts`: Add poll-related field paths for --fields selection

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-polls*
*Context gathered: 2026-03-13*
