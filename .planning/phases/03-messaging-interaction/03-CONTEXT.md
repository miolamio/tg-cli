# Phase 3: Messaging & Interaction - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Send text messages to any chat, reply to specific messages by ID, forward messages between chats (single or batch), react to messages with emoji, and add human-readable output mode (`--human`/`--no-json`) across all CLI commands. No media upload/download, no forum topics, no multi-chat search.

</domain>

<decisions>
## Implementation Decisions

### Send command design
- Positional arguments: `tg message send <chat> <text>`
- Stdin piping supported: `echo "msg" | tg message send @user -` (dash placeholder reads stdin)
- Response returns full serialized MessageItem (reuses `serializeMessage()`)
- Markdown formatting in text: parse **bold**, _italic_, `code`, [links](url) into Telegram entities before sending
- Multiline via shell quoting or stdin pipe

### Reply design
- Reply is a flag on send: `tg message send <chat> <text> --reply-to <msgId>`
- No separate reply command — reply is just send with an extra flag
- Response is identical to send (full MessageItem with `replyToMsgId` populated)

### Forward command
- Separate command: `tg message forward <from-chat> <msg-ids> <to-chat>`
- Comma-separated message IDs for batch: `tg message forward @source 123,456,789 @dest`
- Response returns `{ forwarded: N, messages: MessageItem[] }` — full serialized messages
- Leverages Telegram's native batch forwarding API

### Reaction behavior
- Unicode emoji directly: `tg message react <chat> <msgId> <emoji>`
- Remove reactions: `tg message react <chat> <msgId> <emoji> --remove`
- No client-side emoji validation — let Telegram API reject invalid emoji
- Response returns `{ messageId, chatId, emoji, action: 'added'|'removed' }`

### Human-readable output (OUT-03)
- JSON remains the default output mode always — agents never need extra flags
- `--human` or `--no-json` flag switches to human-readable format
- No TTY auto-detection — explicit flag only, predictable for agents
- Conversational format for messages: `[2026-03-11 12:30] Alice: Hello world`
- Table/column format for lists (chat list, members, etc.)
- Colors via picocolors (already a dependency) — bold sender names, dim timestamps, colored media tags
- Colors auto-disabled when piped (picocolors handles this)
- Applies retroactively to ALL existing commands (Phase 1 & 2): auth status, chat list, chat info, message history, message search, plus all new Phase 3 commands

### Claude's Discretion
- Markdown-to-entities parsing implementation (gramjs may have built-in support)
- Human-readable format details for each command type (exact column widths, truncation)
- Error message formatting in human mode
- How to handle send failures (network, permissions, etc.)

</decisions>

<specifics>
## Specific Ideas

- Send command mirrors the read path: `serializeMessage()` is reused for both reading and writing confirmation
- Agents use full command paths (`tg message send`), but command aliases from Phase 1 context still apply
- Forward uses positional args (not flags) since it has different semantics from send — no text input, different argument pattern
- Human output is an opt-in overlay, not a separate code path — data goes through JSON serialization first, then formatted for display

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `serializeMessage()` (`src/lib/serialize.ts`): Already serializes gramjs messages to MessageItem — reuse for send/forward response
- `resolveEntity()` (`src/lib/peer.ts`): Resolves all peer formats (username, @username, ID, phone, invite link) — used by send/forward/react
- `withClient()` (`src/lib/client.ts`): Connect-per-command pattern — all Phase 3 commands will use this
- `outputSuccess()`/`outputError()` (`src/lib/output.ts`): JSON envelope output — extend with human-readable formatter
- `entitiesToMarkdown()` (`src/lib/entity-to-markdown.ts`): Converts Telegram entities to Markdown — need inverse (Markdown to entities) for send
- `bigIntToString()` (`src/lib/serialize.ts`): Safe BigInt serialization — needed for new message IDs
- picocolors (dependency): Terminal color support — use for human-readable formatting

### Established Patterns
- Command grouping: `src/commands/message/` directory exists with `history.ts` and `search.ts`
- Commander.js subcommands: `.argument()`, `.option()`, `.requiredOption()`, `.action()`
- JSON envelope: `{ ok: true, data: {...} }` on stdout, progress on stderr
- GlobalOptions: `--json`, `--human`, `--verbose`, `--quiet`, `--profile` via `optsWithGlobals()`
- ESM-only project with tsup bundling

### Integration Points
- `src/commands/message/index.ts`: Add `send`, `forward`, `react` subcommands alongside existing `history` and `search`
- `src/lib/output.ts`: Add human-readable formatter function (or new `src/lib/format.ts`)
- `src/lib/types.ts`: Add SendOptions, ForwardOptions, ReactOptions interfaces
- All existing command actions: Wrap `outputSuccess()` calls with human-format check
- `src/bin/tg.ts`: No changes needed — message group already registered

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-messaging-interaction*
*Context gathered: 2026-03-11*
