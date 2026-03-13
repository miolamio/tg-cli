# Phase 7: Message Write Operations - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Four mutation commands on messages: edit own sent messages, delete messages with explicit revoke control, pin a message (silent by default), and unpin a message. All commands translate Telegram permission errors into actionable CLI messages. No new output formats, no media caption editing, no poll sending.

</domain>

<decisions>
## Implementation Decisions

### Delete safety behavior
- `tg message delete <chat> <ids>` requires explicit `--revoke` or `--for-me` flag — command errors with `DELETE_MODE_REQUIRED` if neither specified
- No default deletion mode — agents and humans must make a conscious choice
- Comma-separated IDs (same as forward/get), max 100 IDs enforced client-side
- Split result: `{ deleted: [ids], failed: [{id, reason}], mode: "revoke"|"for-me" }`
- `ok: true` if any deletions succeed, `ok: false` only when all fail or validation errors
- No client-side time checks for `--revoke` — let Telegram API enforce revoke windows
- Human-readable: summary line "Deleted 2 messages (revoke). Failed: 789 (MESSAGE_DELETE_FORBIDDEN)"

### Edit command design
- `tg message edit <chat> <id> <text>` — positional arguments matching send pattern
- Stdin pipe supported: `tg message edit <chat> <id> -` (dash placeholder, same as send)
- Markdown formatting via gramjs MarkdownParser (same as send)
- Text messages only — no media caption editing in this phase
- No client-side 48h window check — let Telegram API reject with MESSAGE_EDIT_TIME_EXPIRED
- Returns full edited MessageItem (same shape as send response, with `editDate` populated)
- Human-readable: `[date] You (edited): new text` — same format as send, no diff view

### Pin command design
- `tg message pin <chat> <id>` — single message ID only (no batch)
- Silent by default (no notification to members) — `--notify` flag to opt in
- Returns simple confirmation: `{ messageId, chatId, action: "pinned", silent: true|false }`
- Human-readable: "Pinned message 456 in @group (silent)" or "Pinned message 456 in @group (notified)"

### Unpin command design
- `tg message unpin <chat> <id>` — single message ID only (no batch)
- Returns simple confirmation: `{ messageId, chatId, action: "unpinned" }`

### Permission error translations
- All four commands translate Telegram errors into actionable messages with original error code preserved
- MESSAGE_EDIT_TIME_EXPIRED → "Cannot edit: 48-hour edit window has expired"
- MESSAGE_AUTHOR_REQUIRED → "Cannot edit: you can only edit your own messages"
- CHAT_ADMIN_REQUIRED → "Admin privileges required"
- MESSAGE_DELETE_FORBIDDEN → "Cannot delete this message"
- Error response includes both the human message and the Telegram error code for agent parsing

### Claude's Discretion
- gramjs API method selection for each operation (editMessage, deleteMessages, pinMessage, unpinMessage)
- Exact error code mapping completeness (discover additional Telegram errors during implementation)
- Human-readable format details for pin/unpin output
- How to handle network/timeout errors during batch delete (retry logic, partial state)

</decisions>

<specifics>
## Specific Ideas

- Delete follows the same "explicit is better than implicit" philosophy as the CLI's JSON-default output — agents never accidentally trigger destructive behavior
- Edit reuses the exact stdin/markdown patterns from send.ts — shared readStdin() function can be extracted or imported
- Pin/unpin are intentionally simple (single ID, confirmation response) since they're admin actions, not content operations
- The split result pattern for delete (deleted/failed arrays) mirrors the notFound pattern from message get — consistent API surface for agents

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `readStdin()` (`src/commands/message/send.ts`): Stdin pipe helper — extract to shared utility or duplicate for edit
- `serializeMessage()` (`src/lib/serialize.ts`): Full message serialization — reuse for edit response
- `formatError()` (`src/lib/errors.ts`): Error code extraction — extend with Telegram-specific error translations
- `resolveEntity()` (`src/lib/peer.ts`): Peer resolution for chat argument
- `outputSuccess()`/`outputError()` (`src/lib/output.ts`): JSON envelope output
- Comma-separated ID parsing pattern (`src/commands/message/get.ts`): Parse, validate, reject on invalid — reuse for delete
- `withClient()` / `SessionStore` / `createConfig()`: Standard command boilerplate

### Established Patterns
- Command registration in `src/commands/message/index.ts` — add `edit`, `delete`, `pin`, `unpin` subcommands
- `optsWithGlobals()` for merging local and global options
- `formatError()` for error code extraction from gramjs errors
- Send command pattern: positional args, stdin pipe, markdown formatting, return serialized message
- React command pattern: simple confirmation response `{ messageId, chatId, action }`

### Integration Points
- `src/commands/message/index.ts`: Register 4 new subcommands (edit, delete, pin, unpin)
- `src/lib/format.ts`: Add human-readable formatters for edit (message line), delete (summary), pin/unpin (confirmation)
- `src/lib/errors.ts`: Add Telegram permission error translation map
- `src/lib/types.ts`: Add DeleteResult, PinResult types

</code_context>

<deferred>
## Deferred Ideas

- Media caption editing — could extend edit command later
- Batch pin/unpin — if needed, add comma-separated ID support
- Unpin all messages in chat — tracked as ADV-09 in v2 requirements
- Delete confirmation prompt for interactive use — not needed for agent-first CLI

</deferred>

---

*Phase: 07-message-write-operations*
*Context gathered: 2026-03-13*
