# Phase 6: Message Read Operations - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Two new read commands: get specific messages by ID (`tg message get <chat> <ids>`) and get pinned messages from a chat (`tg message pinned <chat>`). Both reuse existing message serialization and output pipeline. No write operations, no new output formats.

</domain>

<decisions>
## Implementation Decisions

### Missing message handling (get by ID)
- Separate `notFound` array alongside `messages`: `{ messages: [...], notFound: [id1, id2] }`
- `notFound` is always present, even when empty (agents don't need to check for undefined)
- Command succeeds (`ok: true`) even when ALL IDs are not found — return `messages: []` with `notFound: [all]`
- Human-readable output: show found messages normally, then a footer line "Not found: 101, 103"

### Get command output shape
- Always return `{ messages: [...], notFound: [...] }` regardless of 1 or many IDs — one shape, no special cases
- Messages returned in requested order (input ID order preserved, not sorted by date)
- Sender names resolved from entity map in API response (same as replies.ts pattern)

### ID argument format
- Comma-separated single positional argument: `tg message get <chat> 100,101,102`
- Consistent with `replies` and `forward` commands
- Enforce Telegram API's 100-ID limit with clear error if exceeded
- Reject entire command if any ID is non-numeric — error with `INVALID_MSG_ID` listing bad values (same as replies.ts)

### Pinned messages command
- Return `{ messages: [...], total: N }` using standard MessageItem serialization
- No pin metadata (who pinned, when) — Telegram API doesn't reliably expose this
- Pagination with `--limit` (default 50) / `--offset` (default 0), consistent with other list commands
- Empty chat (no pins): succeed with `{ messages: [], total: 0 }`
- Sender names resolved from API response entity map

### Claude's Discretion
- gramjs API call strategy for getMessages (getMessages with ids array vs search with pinned filter)
- How to detect not-found messages in gramjs response (may return undefined/empty for missing IDs — verify per STATE.md concern)
- Human-readable format layout for get command output
- Error handling for permission-denied on private chats

</decisions>

<specifics>
## Specific Ideas

- Both commands use the exact same `serializeMessage()` + `buildEntityMap()` pattern from replies.ts — no new serializers needed
- The `notFound` array makes this command uniquely useful for agents verifying message existence (e.g., checking if forwarded messages were deleted)
- Comma-separated ID format means agents can easily construct batch requests: `ids.join(',')`

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `serializeMessage()` (`src/lib/serialize.ts`): Full message serialization — reuse directly
- `buildEntityMap()` (`src/commands/message/replies.ts`): Resolves sender names from API users/chats arrays — extract to shared utility or duplicate
- Comma-separated ID parsing pattern (`src/commands/message/replies.ts:60-71`): Parse, validate, reject on invalid
- `outputSuccess()` (`src/lib/output.ts`): Handles JSON/human/JSONL/fields automatically
- `resolveEntity()` (`src/lib/peer.ts`): Peer resolution for chat argument
- `withClient()` / `SessionStore` / `createConfig()`: Standard command boilerplate

### Established Patterns
- Command registration in `src/commands/message/index.ts` — add `get` and `pinned` subcommands
- `optsWithGlobals()` for merging local and global options
- `formatError()` for error code extraction from gramjs errors
- `assertForum()` for forum-specific guards (not needed here but shows validation pattern)

### Integration Points
- `src/commands/message/index.ts`: Register `get` and `pinned` subcommands
- `src/lib/format.ts`: Add human-readable formatters for get (with notFound footer) and pinned output
- `src/lib/types.ts`: No new types needed — MessageItem already covers both commands

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-message-read-operations*
*Context gathered: 2026-03-12*
