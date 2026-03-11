# Phase 2: Chat Discovery & Message Reading - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Discover chats (list dialogs with type/name/unread), get detailed chat info, join/leave groups by username or invite link, resolve peers, read message history with pagination and date filtering, and search messages by keyword within a chat or globally. This delivers the core agent use case: finding and extracting information from Telegram. No sending, media download, or forum topics.

</domain>

<decisions>
## Implementation Decisions

### Chat list output
- Minimal fields per chat: id, title, type (user/group/channel/supergroup), username, unreadCount
- Agents call `tg chat info` for detailed data — list stays lean
- Default sort: last activity (most recently active first, matches Telegram's native dialog order)
- `--type` flag for filtering: `tg chat list --type group`, `--type channel`, etc.
- Paginated with `--limit` / `--offset`, default limit 50

### Chat info detail level
- Kitchen sink: description, member count, creation date, photo URL, linked channel/group, slowmode settings, permissions, admin list, banned users, invite link, migration info
- Include everything gramjs exposes — some fields may require admin rights (note in output when unavailable)

### Message serialization
- Agent-optimized fields: id, text, date, senderId, senderName, replyToMsgId, forwardFrom, mediaType
- Dates in ISO 8601 UTC format (`2026-03-11T09:15:00Z`)
- Text formatting: Convert Telegram entities to Markdown (**bold**, _italic_, [link](url), `code`, etc.)
- Non-text messages: `mediaType` field + caption as `text`. Service messages get `type: "service"` with `actionText`
- Stickers: `mediaType: "sticker"` with `emoji` field

### Pagination model
- Offset + limit for both chat list and message history
- Default limit: 50
- Response includes `total` count for navigation
- Date range filtering: `--since` and `--until` with ISO date strings (date-only or full ISO datetime)

### Search result format
- Per-chat search: Same message format as history, just filtered by query. Same pagination.
- Global search (no `--chat`): Flat list of messages, each including `chatId` and `chatTitle` for context
- Sort order: Newest first (chronological descending)
- `--query` / `-q` is required for search — browsing without query uses `tg message history`

### Claude's Discretion
- Exact gramjs API calls for each operation (getDialogs, getMessages, etc.)
- Peer resolution implementation (how to map username/ID/phone to InputPeer)
- Join/leave group implementation details
- Member list pagination strategy
- Error handling for private chats, restricted groups, missing permissions
- Command aliases (e.g., `tg ls` for `tg chat list`)

</decisions>

<specifics>
## Specific Ideas

- Search and history use identical message shapes — agents use one parser for both
- Global search adds `chatId`/`chatTitle` to each message — flat list, not grouped by chat
- The CLI is agent-first: JSON default, structured, pipe-friendly. Minimal fields by default, detailed on explicit request.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `withClient(opts, fn)` (`src/lib/client.ts`): Connect-per-command pattern — all Phase 2 commands will use this
- `outputSuccess(data)` / `outputError(error, code)` (`src/lib/output.ts`): JSON envelope output — all commands use this
- `logStatus(message, quiet)` (`src/lib/output.ts`): stderr progress messages
- `GlobalOptions` type (`src/lib/types.ts`): --json, --human, --verbose, --quiet, --profile
- `SessionStore` (`src/lib/session-store.ts`): Profile-aware session persistence with file locking
- `loadConfig()` / `resolveCredentials()` (`src/lib/config.ts`): API credential resolution
- `withRateLimit()` (`src/lib/rate-limit.ts`): FloodWait handling wrapper

### Established Patterns
- Command grouping: `src/commands/{noun}/` directories (auth/, session/ exist)
- Connect-per-command: stateless, each invocation connects and destroys
- JSON envelope: `{ ok: true, data: {...} }` on stdout, progress on stderr
- Commander.js subcommands with `optsWithGlobals()` for global flags
- ESM-only project with tsup bundling

### Integration Points
- New command groups: `src/commands/chat/` and `src/commands/message/`
- CLI entry point: `src/bin/tg.ts` needs chat and message subcommands registered
- gramjs `client.getDialogs()`, `client.getMessages()`, `client.invoke()` for MTProto calls
- Types: extend `src/lib/types.ts` with chat and message output interfaces

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-chat-discovery-message-reading*
*Context gathered: 2026-03-11*
