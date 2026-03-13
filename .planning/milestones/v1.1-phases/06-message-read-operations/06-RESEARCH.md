# Phase 6: Message Read Operations - Research

**Researched:** 2026-03-12
**Domain:** gramjs message retrieval (getMessages with IDs, search with pinned filter)
**Confidence:** HIGH

## Summary

Phase 6 adds two read-only commands: `tg message get <chat> <ids>` to fetch specific messages by ID, and `tg message pinned <chat>` to list pinned messages. Both commands are straightforward wrappers around gramjs APIs that already exist and are already used in the codebase. The existing `serializeMessage()`, `buildEntityMap()`, `outputSuccess()` pipeline handles all serialization and output formatting.

The critical technical finding is how gramjs handles missing message IDs: the `_IDsIter` class in gramjs pushes `undefined` into its buffer for messages that are `MessageEmpty` or belong to a different peer. This means `client.getMessages(entity, { ids: [...] })` returns a `TotalList` where some entries may be `undefined`. The implementation must filter these to build the `notFound` array.

**Primary recommendation:** Use `client.getMessages(entity, { ids: numericIds })` for get-by-ID and `client.getMessages(entity, { filter: new Api.InputMessagesFilterPinned(), limit, addOffset })` for pinned messages. Extract `buildEntityMap()` from `replies.ts` to a shared utility since both new commands need sender name resolution.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Missing message handling: Separate `notFound` array alongside `messages`: `{ messages: [...], notFound: [id1, id2] }`; `notFound` always present even when empty; command succeeds (`ok: true`) even when ALL IDs not found
- Human-readable output: show found messages normally, then footer line "Not found: 101, 103"
- Get command output shape: Always return `{ messages: [...], notFound: [...] }` regardless of count -- one shape, no special cases
- Messages returned in requested order (input ID order preserved, not sorted by date)
- Sender names resolved from entity map in API response (same as replies.ts pattern)
- ID argument format: Comma-separated single positional argument: `tg message get <chat> 100,101,102`
- Consistent with `replies` and `forward` commands
- Enforce Telegram API's 100-ID limit with clear error if exceeded
- Reject entire command if any ID is non-numeric -- error with `INVALID_MSG_ID` listing bad values (same as replies.ts)
- Pinned messages: Return `{ messages: [...], total: N }` using standard MessageItem serialization
- No pin metadata (who pinned, when) -- Telegram API doesn't reliably expose this
- Pagination with `--limit` (default 50) / `--offset` (default 0), consistent with other list commands
- Empty chat (no pins): succeed with `{ messages: [], total: 0 }`

### Claude's Discretion
- gramjs API call strategy for getMessages (getMessages with ids array vs search with pinned filter)
- How to detect not-found messages in gramjs response (may return undefined/empty for missing IDs)
- Human-readable format layout for get command output
- Error handling for permission-denied on private chats

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| READ-08 | User can get specific messages by ID (`tg message get <chat> <ids>`) with batch support | gramjs `getMessages` with `ids` param returns `TotalList` with `undefined` for missing IDs; existing comma-separated parsing from replies.ts; `_MAX_CHUNK_SIZE=100` matches Telegram limit |
| READ-09 | User can get pinned messages from a chat (`tg message pinned <chat>`) | gramjs `getMessages` with `filter: InputMessagesFilterPinned()` via `messages.Search` API; filter already defined in `media-utils.ts` FILTER_MAP; standard pagination with limit/addOffset |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| gramjs (telegram) | installed | Telegram MTProto client -- `getMessages` with `ids` and `filter` params | Already used throughout codebase; provides both ID-based and filter-based message retrieval |
| commander | installed | CLI argument parsing and subcommand registration | Already used for all existing commands |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| picocolors | installed | Terminal coloring for human-readable output | Used in format.ts for all human output |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `client.getMessages(entity, { ids })` | Raw `Api.messages.GetMessages` invoke | getMessages wrapper handles channel vs non-channel routing automatically and resolves entities; raw invoke would duplicate that logic |
| `client.getMessages(entity, { filter: pinned })` | `client.invoke(new Api.messages.Search({ filter: pinned }))` | getMessages wrapper handles pagination, entity resolution; raw invoke gives more control but duplicates boilerplate |

## Architecture Patterns

### Recommended Project Structure
```
src/
  commands/
    message/
      index.ts          # Register `get` and `pinned` subcommands (MODIFY)
      get.ts             # New: messageGetAction handler
      pinned.ts          # New: messagePinnedAction handler
  lib/
    serialize.ts         # Existing: serializeMessage (REUSE)
    entity-map.ts        # New: extract buildEntityMap from replies.ts to shared module
    format.ts            # MODIFY: add formatGetResult for notFound footer
    output.ts            # Existing: outputSuccess/outputError (REUSE)
    fields.ts            # Existing: MODIFY extractListItems to handle notFound alongside messages
    types.ts             # Existing: no new types needed (MessageItem covers both commands)
```

### Pattern 1: Get Messages by ID
**What:** Use gramjs `getMessages` with `ids` parameter; iterate result to separate found/not-found
**When to use:** `tg message get <chat> <ids>`
**Example:**
```typescript
// Source: gramjs node_modules/telegram/client/messages.js lines 286-359, 379-396
// When ids param is provided, gramjs creates _IDsIter which:
// - For channels: invokes Api.channels.GetMessages({ channel, id: ids })
// - For non-channels: invokes Api.messages.GetMessages({ id: ids })
// - Missing IDs return undefined in the result array (MessageEmpty -> undefined)

const result = await client.getMessages(entity, { ids: numericIds });
// result is TotalList<Api.Message> but entries may be undefined for missing IDs

const entityMap = buildEntityMap(result);  // from result's _entities or users/chats
const found: MessageItem[] = [];
const notFound: number[] = [];

// Preserve requested order by iterating input IDs
for (let i = 0; i < numericIds.length; i++) {
  const msg = result[i];
  if (msg) {
    const senderId = msg.fromId?.userId ?? msg.fromId?.channelId ?? msg.fromId?.chatId;
    const senderEntity = senderId ? entityMap.get(senderId.toString()) : undefined;
    found.push(serializeMessage(msg, senderEntity));
  } else {
    notFound.push(numericIds[i]);
  }
}

outputSuccess({ messages: found, notFound });
```

### Pattern 2: Get Pinned Messages
**What:** Use gramjs `getMessages` with `InputMessagesFilterPinned` filter
**When to use:** `tg message pinned <chat>`
**Example:**
```typescript
// Source: gramjs messages.js lines 109-148, media-utils.ts line 25
// When filter is provided (not InputMessagesFilterEmpty) and search is defined,
// gramjs creates Api.messages.Search request with the filter.
// InputMessagesFilterPinned is already defined in FILTER_MAP.

const messages = await client.getMessages(entity, {
  filter: new Api.InputMessagesFilterPinned(),
  limit,
  addOffset: offset,
});

const serialized = messages.map((msg: any) => serializeMessage(msg));
outputSuccess({
  messages: serialized,
  total: (messages as any).total ?? 0,
});
```

### Pattern 3: Shared Entity Map (extract from replies.ts)
**What:** Extract `buildEntityMap()` to shared utility for reuse across get, pinned, and replies
**When to use:** Any command that needs sender name resolution from API response entities
**Example:**
```typescript
// Source: src/commands/message/replies.ts lines 15-24
// Currently duplicated in replies.ts. Extract to src/lib/entity-map.ts

export function buildEntityMap(result: any): Map<string, any> {
  const map = new Map<string, any>();
  for (const u of result.users ?? []) {
    map.set(u.id.toString(), u);
  }
  for (const c of result.chats ?? []) {
    map.set(c.id.toString(), c);
  }
  return map;
}
```

### Pattern 4: Command Boilerplate (established pattern)
**What:** Standard command handler structure used by all existing commands
**When to use:** Every new command handler
**Example:**
```typescript
// Source: src/commands/message/replies.ts (complete pattern)
export async function messageGetAction(
  this: Command,
  chatInput: string,
  idsInput: string,
): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { /* command-specific opts */ };
  const { profile } = opts;
  // ... parse/validate args ...
  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));
  try {
    await store.withLock(profile, async (sessionString) => {
      if (!sessionString) {
        outputError('Not logged in. Run: tg auth login', 'NOT_AUTHENTICATED');
        return;
      }
      const { apiId, apiHash } = getCredentialsOrThrow(config);
      await withClient({ apiId, apiHash, sessionString }, async (client) => {
        const entity = await resolveEntity(client, chatInput);
        // ... core logic ...
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
```

### Anti-Patterns to Avoid
- **Creating new types for output shapes:** MessageItem already covers both commands. Don't create GetResult or PinnedResult types -- the output shapes are `{ messages: MessageItem[], notFound: number[] }` and `{ messages: MessageItem[], total: number }` which are ad-hoc data objects passed to `outputSuccess()`.
- **Fetching pinned messages via raw API invoke:** Use `client.getMessages()` wrapper which handles entity type routing (channel vs chat vs user), pagination chunking, and entity resolution automatically.
- **Sorting results for get-by-ID:** The user decision explicitly states "messages returned in requested order (input ID order preserved, not sorted by date)". Since gramjs returns results in the same order as the input IDs array, this is naturally preserved by iterating input IDs.
- **Special-casing single ID:** The user decision explicitly states "one shape, no special cases" -- always return `{ messages: [...], notFound: [...] }`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Channel vs non-channel message retrieval | Custom entity type detection + different API calls | `client.getMessages(entity, { ids })` | gramjs `_IDsIter` already handles the channel/non-channel routing (lines 311-336 of messages.js) |
| Pagination for pinned messages | Manual offset tracking | `client.getMessages(entity, { filter, limit, addOffset })` | gramjs `_MessagesIter` handles chunking, offset management |
| Comma-separated ID parsing | New parsing logic | Copy pattern from `replies.ts:60-71` | Proven pattern, consistent error codes |
| Output formatting dispatch | Manual if/else for JSON/human/JSONL | `outputSuccess(data)` | Output pipeline auto-dispatches based on mode |
| Field selection on output | Manual field filtering | Existing `applyFieldSelection()` + `extractListItems()` in fields.ts | Already handles nested arrays automatically |

**Key insight:** This phase is almost entirely glue code connecting existing infrastructure. The gramjs API, serialization, output pipeline, and command boilerplate are all established. The only novel work is (1) detecting not-found messages from gramjs undefined entries, (2) human-readable formatter for the notFound footer, and (3) extracting buildEntityMap to shared utility.

## Common Pitfalls

### Pitfall 1: gramjs Returns undefined for Missing Messages
**What goes wrong:** Accessing properties on undefined message entries causes runtime TypeError
**Why it happens:** gramjs `_IDsIter._loadNextChunk()` pushes `undefined` to the buffer when a message is `MessageEmpty` or belongs to a different peer (lines 347-351 of messages.js)
**How to avoid:** Always check each result entry before accessing properties. Iterate by index against the input IDs array to correlate found/not-found.
**Warning signs:** Test with both valid and invalid IDs to verify undefined handling

### Pitfall 2: Entity Map Unavailable for ID-based Retrieval
**What goes wrong:** Sender names show as null because entity map is not populated
**Why it happens:** When using `getMessages` with `ids`, gramjs attaches `_entities` to each message via `_finishInit()`. The entities come from the API response's `users` and `chats` arrays. However, accessing the raw result (which is a `TotalList`) doesn't expose `.users`/`.chats` directly -- they are on the underlying API response object.
**How to avoid:** For ID-based retrieval, use each message's `_entities` map (set by gramjs `_finishInit`). Or, since gramjs calls `getMessages` and processes entities, use `msg._sender` or `msg.sender` which gramjs populates.
**Warning signs:** Sender names are null in output. Test with messages from different senders.

### Pitfall 3: The 100 ID Limit
**What goes wrong:** gramjs internally chunks at `_MAX_CHUNK_SIZE = 100`. Passing more than 100 IDs technically works (gramjs handles it), but Telegram's MTProto layer may reject the batch.
**How to avoid:** User decision says to enforce the 100-ID limit at the CLI layer. Validate `numericIds.length <= 100` before calling the API. Error: "Maximum 100 IDs per request (got N)".
**Warning signs:** Silently truncated results

### Pitfall 4: InputMessagesFilterPinned Requires search param
**What goes wrong:** gramjs `_MessagesIter._init()` uses `messages.Search` when filter is not `InputMessagesFilterEmpty` OR `search !== undefined`. If neither condition is met, it falls through to `GetHistory` which ignores filters.
**How to avoid:** Pass `search: ''` (empty string) alongside the pinned filter to ensure gramjs creates a `messages.Search` request. This is what the existing search command does (`baseSearchParams.search = opts.query || ''`).
**Warning signs:** All messages returned instead of only pinned ones

### Pitfall 5: formatData Auto-Detection Conflict
**What goes wrong:** The `formatData()` function in format.ts auto-detects data shapes. The get command output `{ messages: [...], notFound: [...] }` will match the existing `messages` array check and call `formatMessages()`, but will silently drop the `notFound` array.
**How to avoid:** Add a specific shape check for `{ messages, notFound }` in `formatData()` that calls a custom formatter showing messages + "Not found: ..." footer. Place this check BEFORE the generic messages check.
**Warning signs:** notFound information missing in `--human` output

### Pitfall 6: JSONL Mode and notFound
**What goes wrong:** JSONL mode (`extractListItems`) extracts `messages` array and streams items one per line, but `notFound` metadata is lost.
**How to avoid:** This is acceptable behavior per the existing JSONL design (metadata is always dropped). The `notFound` array is metadata. Document this as expected. Alternative: write notFound to stderr in JSONL mode.
**Warning signs:** Users expecting notFound in JSONL output

### Pitfall 7: Order Preservation in Results
**What goes wrong:** gramjs returns messages in the same positional order as input IDs (index 0 of input maps to index 0 of result). If you filter out undefined entries and then try to correlate, the indices shift.
**How to avoid:** Iterate by index, checking each position. Build found/notFound arrays in a single pass over the input IDs array.
**Warning signs:** notFound reports wrong IDs, or messages appear in wrong order

## Code Examples

Verified patterns from the existing codebase:

### Comma-Separated ID Parsing (from replies.ts:60-71)
```typescript
// Source: src/commands/message/replies.ts lines 60-71
const parts = msgIdsInput.split(',').map(s => s.trim());
const msgIds: number[] = [];
const invalid: string[] = [];

for (const part of parts) {
  const num = parseInt(part, 10);
  if (isNaN(num) || num <= 0) {
    invalid.push(part);
  } else {
    msgIds.push(num);
  }
}

if (invalid.length > 0) {
  outputError(`Invalid message IDs: ${invalid.join(', ')}`, 'INVALID_MSG_ID');
  return;
}
```

### gramjs getMessages with IDs (from messages.js)
```typescript
// Source: node_modules/telegram/client/messages.js lines 379-396
// When ids param is provided, iterMessages returns _IDsIter
// _IDsIter._loadNextChunk handles channel vs non-channel:
//   Channel: Api.channels.GetMessages({ channel: entity, id: ids })
//   Other:   Api.messages.GetMessages({ id: ids })
// Missing messages -> undefined entries in result

const result = await client.getMessages(entity, { ids: [100, 101, 102] });
// result[0] = Api.Message or undefined
// result[1] = Api.Message or undefined
// result[2] = Api.Message or undefined
```

### gramjs Search with Pinned Filter (from search.ts + media-utils.ts)
```typescript
// Source: src/commands/message/search.ts lines 76-81, src/lib/media-utils.ts line 25
// This is exactly how the existing search --filter pinned works:
const messages = await client.getMessages(entity, {
  search: '',  // Required to trigger Search path in gramjs
  filter: new Api.InputMessagesFilterPinned(),
  limit: 50,
  addOffset: 0,
});
// messages.total gives count of pinned messages
```

### Sender Resolution from Message Entities
```typescript
// Source: node_modules/telegram/client/messages.js lines 341-357
// gramjs _finishInit populates message._entities and message._sender
// For messages retrieved by ID, use msg._sender or msg.sender:
const msg = result[i];
if (msg) {
  // Option A: use gramjs-populated sender
  const senderEntity = (msg as any)._sender;
  serializeMessage(msg, senderEntity);

  // Option B: use _entities map (same as replies.ts pattern)
  const entities = (msg as any)._entities;
  const senderId = msg.fromId?.userId ?? msg.fromId?.channelId ?? msg.fromId?.chatId;
  const senderEntity = senderId ? entities?.get(utils.getPeerId(senderId)) : undefined;
}
```

### Command Registration (from index.ts)
```typescript
// Source: src/commands/message/index.ts
// Add to createMessageCommand():
message
  .command('get')
  .argument('<chat>', 'Chat ID, username, or @username')
  .argument('<ids>', 'Message IDs (comma-separated, max 100)')
  .description('Get specific messages by ID')
  .action(messageGetAction);

message
  .command('pinned')
  .argument('<chat>', 'Chat ID, username, or @username')
  .description('Get pinned messages from a chat')
  .option('--limit <n>', 'Max messages', '50')
  .option('--offset <n>', 'Skip messages', '0')
  .action(messagePinnedAction);
```

### Human-Readable Format for Get Result (new formatter needed)
```typescript
// New: add to format.ts
// Extends formatMessages with notFound footer
export function formatGetResult(data: { messages: MessageItem[]; notFound: number[] }): string {
  const parts: string[] = [];
  if (data.messages.length > 0) {
    parts.push(formatMessages(data.messages));
  } else {
    parts.push('No messages found.');
  }
  if (data.notFound.length > 0) {
    parts.push(pc.dim(`Not found: ${data.notFound.join(', ')}`));
  }
  return parts.join('\n');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw `Api.messages.GetMessages` invoke | `client.getMessages(entity, { ids })` wrapper | gramjs 2.x | Wrapper handles channel routing, entity resolution, chunking |
| Custom pinned message fetching | `InputMessagesFilterPinned` with search API | MTProto Layer 166+ | Standard filter in Telegram API, supported by gramjs |

**Deprecated/outdated:**
- None relevant. The APIs used are stable MTProto methods.

## Open Questions

1. **Entity map access pattern for ID-based retrieval**
   - What we know: gramjs `_IDsIter` calls `_finishInit(client, entities, entity)` on each message, setting `msg._entities` and `msg._sender`. The entities map uses `getPeerId()` as keys.
   - What's unclear: Whether `msg._sender` is reliably populated for all entity types (users, channels, chats). The replies.ts code builds its own entity map from `result.users`/`result.chats`, but `getMessages` with `ids` returns a `TotalList` which may not expose those arrays directly.
   - Recommendation: Try `msg._sender` first. If unreliable, use `(msg as any)._entities` with sender ID lookup. If neither works, fall back to building entity map from raw API invoke. Test empirically during implementation.

2. **JSONL behavior for notFound metadata**
   - What we know: JSONL mode streams `messages` array items; metadata fields like `total`, `notFound` are silently dropped by design.
   - What's unclear: Whether agents rely on `notFound` data in JSONL mode.
   - Recommendation: Accept current behavior (notFound dropped in JSONL). If needed, log notFound to stderr in JSONL mode. This aligns with how `total` is already dropped.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (installed, configured) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/message-get.test.ts tests/unit/message-pinned.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| READ-08 | Get messages by ID -- valid IDs return messages | unit | `npx vitest run tests/unit/message-get.test.ts -t "returns messages for valid IDs"` | -- Wave 0 |
| READ-08 | Get messages by ID -- missing IDs populate notFound | unit | `npx vitest run tests/unit/message-get.test.ts -t "populates notFound"` | -- Wave 0 |
| READ-08 | Get messages by ID -- invalid ID format rejected | unit | `npx vitest run tests/unit/message-get.test.ts -t "rejects invalid IDs"` | -- Wave 0 |
| READ-08 | Get messages by ID -- exceeds 100 ID limit | unit | `npx vitest run tests/unit/message-get.test.ts -t "rejects over 100 IDs"` | -- Wave 0 |
| READ-08 | Get messages by ID -- preserves input order | unit | `npx vitest run tests/unit/message-get.test.ts -t "preserves order"` | -- Wave 0 |
| READ-08 | Get messages by ID -- all IDs not found | unit | `npx vitest run tests/unit/message-get.test.ts -t "all not found"` | -- Wave 0 |
| READ-09 | Pinned messages -- returns pinned messages with total | unit | `npx vitest run tests/unit/message-pinned.test.ts -t "returns pinned messages"` | -- Wave 0 |
| READ-09 | Pinned messages -- empty result for no pins | unit | `npx vitest run tests/unit/message-pinned.test.ts -t "empty chat"` | -- Wave 0 |
| READ-09 | Pinned messages -- pagination works | unit | `npx vitest run tests/unit/message-pinned.test.ts -t "pagination"` | -- Wave 0 |
| READ-08 | Human-readable format includes notFound footer | unit | `npx vitest run tests/unit/format.test.ts -t "notFound"` | -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/message-get.test.ts tests/unit/message-pinned.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/message-get.test.ts` -- covers READ-08 (get by ID with found/notFound/validation)
- [ ] `tests/unit/message-pinned.test.ts` -- covers READ-09 (pinned messages with pagination)
- [ ] Add test cases to existing `tests/unit/format.test.ts` for notFound footer formatting

## Sources

### Primary (HIGH confidence)
- gramjs `node_modules/telegram/client/messages.js` lines 286-444 -- `_IDsIter` class, `getMessages` function, `_MAX_CHUNK_SIZE=100`, MessageEmpty handling, undefined for missing IDs
- gramjs `node_modules/telegram/client/messages.d.ts` -- `IterMessagesParams.ids` type declaration with explicit documentation: "if the message doesn't exist, undefined will appear in its place"
- `src/commands/message/replies.ts` -- `buildEntityMap()` pattern, comma-separated ID parsing, established command structure
- `src/commands/message/search.ts` -- Search with filter pattern, entity resolution, output formatting
- `src/lib/media-utils.ts` line 25 -- `InputMessagesFilterPinned` already defined in FILTER_MAP
- `src/lib/format.ts` -- `formatData()` auto-detection logic, `formatMessages()` function
- `src/lib/fields.ts` -- `extractListItems()` checks LIST_KEYS for `messages` key (will work for both commands)
- `src/lib/output.ts` -- `outputSuccess()` pipeline with JSON/human/JSONL modes

### Secondary (MEDIUM confidence)
- gramjs `_IDsIter._loadNextChunk()` entity map population via `_finishInit()` -- verified in source but exact sender resolution path needs empirical testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, APIs verified in gramjs source code
- Architecture: HIGH - follows established patterns from replies.ts, search.ts, forward.ts
- Pitfalls: HIGH - verified by reading gramjs source code (MessageEmpty -> undefined, filter routing logic, _MAX_CHUNK_SIZE)

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- gramjs and Telegram MTProto API are mature)
