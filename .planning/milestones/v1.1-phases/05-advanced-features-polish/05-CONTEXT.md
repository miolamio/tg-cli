# Phase 5: Advanced Features & Polish - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Forum topic interaction in supergroups (list, read, send to topics), multi-chat search in a single command, output field selection to reduce noise, and JSONL streaming for pipe-friendly consumption. This is the final v1 phase delivering the remaining 6 requirements (WRITE-06, WRITE-07, WRITE-08, READ-06, OUT-04, OUT-05).

</domain>

<decisions>
## Implementation Decisions

### Forum topic commands
- Topic listing: `tg chat topics <chat>` under the existing `chat` command group — topics are a property of chats, not a separate concept
- Topic-scoped messages: `--topic <topicId>` flag added to existing `tg message history`, `tg message send`, and `tg message search --chat`
- Topic-scoped media: `--topic <topicId>` flag also on `tg media send` for sending media to forum topics
- Topic listing fields (essential): id, title, iconEmoji, creationDate, creatorId, messageCount, isClosed, isPinned
- Pagination on topic listing: `--limit` / `--offset`, default limit 50
- Forum guard: if `--topic` is used on a non-forum chat, error with code `NOT_A_FORUM` ("Chat is not a forum-enabled supergroup")
- Download doesn't need `--topic` — messages already have IDs regardless of topic

### Multi-chat search
- Overload existing `--chat` flag: `--chat @devs,@ops,@design` accepts comma-separated chat identifiers for multi-chat search
- Single chat, multiple chats, or global (no `--chat`) all use the same flag
- Result format: flat list of SearchResultItem with chatId + chatTitle on each message (same as global search today), sorted newest first across all chats
- `--limit` is total across all chats (e.g., --limit 50 means 50 results total, not per chat)
- All flags compose: `--chat @a,@b --filter photos --query "sunset" --limit 20` all work together
- `--query` remains conditionally optional (required when no `--filter`, optional with `--filter` — existing Phase 4 behavior preserved)

### Field selection (--fields)
- Global option on all commands returning data: messages, chats, members, media results, auth status, chat info, etc.
- Dot notation supported for nested fields: `--fields id,text,media.filename,media.fileSize`
- Filtering applied inside `data` only — the `{ ok, data }` envelope is always preserved
- Metadata fields (total, count) inside data always preserved alongside filtered items
- JSON mode only — in `--human` mode, `--fields` is silently ignored (human output already curates display)
- Invalid field names are silently omitted (field just absent from output, no error)

### JSONL streaming (--jsonl)
- Available on all list-returning commands: `chat list`, `chat topics`, `chat members`, `message history`, `message search`
- NOT on single-item commands (chat info, auth status, media download/send results)
- No envelope in JSONL mode — each line is a bare data object, no `{ ok, data }` wrapper
- Errors go to stderr with non-zero exit code (standard JSONL convention)
- Composes with `--fields`: `--jsonl --fields id,text` outputs one filtered object per line
- Mutually exclusive with `--human` — using both gives error with code `INVALID_OPTIONS`
- `--jsonl` with `--json` is fine (JSONL is a JSON variant, not a conflict)

### Claude's Discretion
- gramjs forum topic API calls (GetForumTopics, etc.) — research needed since support level is unverified per STATE.md
- Field selection implementation (pick utility vs lodash-style get)
- JSONL output mechanism (write per-item vs buffer)
- How to detect list-returning commands for JSONL eligibility
- Multi-chat search execution strategy (parallel vs sequential API calls per chat)
- Human-readable format for topic listing
- Error handling for individual chat failures in multi-chat search (skip failed chats vs fail entire operation)

</decisions>

<specifics>
## Specific Ideas

- Multi-chat search uses the same `--chat` flag (not a new `--chats` flag) — comma-separated is the multi-chat indicator
- JSONL + fields is the ultimate agent power combo: `tg message search --query "bug" --jsonl --fields id,text,chatTitle | jq .text`
- Forum topics live under `chat` because they're a chat property — no new top-level command group needed
- Field selection is a global option like `--json`/`--human` so it works everywhere consistently

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `outputSuccess()` / `setOutputMode()` (`src/lib/output.ts`): JSON envelope output — extend with JSONL mode and field filtering
- `formatData()` (`src/lib/format.ts`): Auto-detect formatter — add topic listing formatter
- `messageSearchAction()` (`src/commands/message/search.ts`): Extend to handle comma-separated `--chat` values
- `resolveEntity()` (`src/lib/peer.ts`): Peer resolution — used to resolve each chat in multi-chat search
- `serializeMessage()` (`src/lib/serialize.ts`): Message serialization — reuse for topic-scoped messages
- `withClient()` (`src/lib/client.ts`): Connect-per-command — all Phase 5 commands use this
- `preAction` hook (`src/bin/tg.ts`): Global option processing — extend for JSONL mode detection and --fields parsing
- `GlobalOptions` (`src/lib/types.ts`): Add `fields` and `jsonl` properties

### Established Patterns
- Command grouping: `src/commands/{noun}/` — add topic subcommand to `src/commands/chat/`
- `--topic` flag pattern: add to existing `message history`, `message send`, `message search`, `media send` actions
- preAction hook sets output mode globally — extend to also parse `--jsonl` and `--fields`
- Search filter integration (Phase 4): `--filter` as optional modifier on search — multi-chat follows same compose pattern

### Integration Points
- `src/commands/chat/index.ts`: Add `topics` subcommand
- `src/commands/message/index.ts`: Add `--topic` option to `history`, `send`, `search`
- `src/commands/media/index.ts`: Add `--topic` option to `send`
- `src/lib/output.ts`: Add JSONL output path and field filtering logic
- `src/lib/types.ts`: Add TopicItem, extend GlobalOptions with `fields?` and `jsonl?`
- `src/bin/tg.ts`: Register `--fields` and `--jsonl` as global options, validate mutual exclusion in preAction

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-advanced-features-polish*
*Context gathered: 2026-03-12*
