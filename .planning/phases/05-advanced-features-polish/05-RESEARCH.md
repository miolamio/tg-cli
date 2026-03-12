# Phase 5: Advanced Features & Polish - Research

**Researched:** 2026-03-12
**Domain:** Forum topics, multi-chat search, output field selection, JSONL streaming
**Confidence:** HIGH

## Summary

Phase 5 delivers the final 6 requirements: forum topic interaction (WRITE-06/07/08), multi-chat search (READ-06), field selection (OUT-04), and JSONL streaming (OUT-05). Research confirms gramjs v2.26 has full MTProto forum topic support via `channels.GetForumTopics`, `Api.ForumTopic`, and thread-scoped message retrieval via `getMessages({ replyTo: topicId })`. Sending to topics uses `sendMessage({ replyTo: topicId })` where the topic ID is the root message ID of the topic.

The output enhancements (field selection and JSONL) are pure application-layer features requiring no new library dependencies. Field selection uses a simple `pick` utility with dot-notation support. JSONL streams individual data items without the `{ ok, data }` envelope. Multi-chat search loops `resolveEntity` + `getMessages` per chat, merging results sorted by date.

**Primary recommendation:** Implement in 2-3 plans: (1) forum topic commands + `--topic` flag, (2) multi-chat search, (3) output enhancements (`--fields` + `--jsonl`). All features use existing gramjs APIs and established project patterns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Topic listing: `tg chat topics <chat>` under the existing `chat` command group
- Topic-scoped messages: `--topic <topicId>` flag added to existing `tg message history`, `tg message send`, `tg message search --chat`
- Topic-scoped media: `--topic <topicId>` flag also on `tg media send`
- Topic listing fields (essential): id, title, iconEmoji, creationDate, creatorId, messageCount, isClosed, isPinned
- Pagination on topic listing: `--limit` / `--offset`, default limit 50
- Forum guard: if `--topic` is used on a non-forum chat, error with code `NOT_A_FORUM`
- Download doesn't need `--topic` -- messages already have IDs regardless of topic
- Multi-chat search: overload existing `--chat` flag with comma-separated values (`--chat @devs,@ops,@design`)
- Single chat, multiple chats, or global (no `--chat`) all use the same flag
- Result format: flat list of SearchResultItem sorted newest first across all chats
- `--limit` is total across all chats
- All flags compose: `--chat @a,@b --filter photos --query "sunset" --limit 20`
- `--query` remains conditionally optional (existing Phase 4 behavior preserved)
- Field selection (`--fields`): global option on all commands returning data
- Dot notation supported: `--fields id,text,media.filename`
- Filtering applied inside `data` only -- `{ ok, data }` envelope always preserved
- Metadata fields (total, count) always preserved alongside filtered items
- JSON mode only -- in `--human` mode, `--fields` is silently ignored
- Invalid field names are silently omitted
- JSONL (`--jsonl`): available on all list-returning commands
- NOT on single-item commands
- No envelope in JSONL mode -- each line is a bare data object
- Errors go to stderr with non-zero exit code
- Composes with `--fields`
- Mutually exclusive with `--human` -- gives error `INVALID_OPTIONS`
- `--jsonl` with `--json` is fine

### Claude's Discretion
- gramjs forum topic API calls -- RESOLVED: full support confirmed (see research below)
- Field selection implementation (pick utility vs lodash-style get)
- JSONL output mechanism (write per-item vs buffer)
- How to detect list-returning commands for JSONL eligibility
- Multi-chat search execution strategy (parallel vs sequential)
- Human-readable format for topic listing
- Error handling for individual chat failures in multi-chat search

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WRITE-06 | User can list forum topics in a supergroup | gramjs `channels.GetForumTopics` returns `messages.ForumTopics` with `topics[]`, `count`, pagination via `offsetDate`/`offsetId`/`offsetTopic` |
| WRITE-07 | User can read messages from a specific forum topic | gramjs `getMessages({ replyTo: topicId })` uses `messages.GetReplies` to fetch thread messages |
| WRITE-08 | User can send messages to a specific forum topic | gramjs `sendMessage({ replyTo: topicId })` creates `InputReplyToMessage` targeting the topic root message |
| READ-06 | User can search across multiple specific chats in one command | Parse comma-separated `--chat`, call `resolveEntity` + `getMessages` per chat, merge sorted by date |
| OUT-04 | User can select specific output fields with `--fields` | Pure JS `pickFields()` utility with dot-notation; applied in `outputSuccess()` before JSON.stringify |
| OUT-05 | Commands returning lists support `--jsonl` for streaming one JSON object per line | New output mode in `output.ts`; write each item individually, no envelope |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| telegram (gramjs) | ^2.26.22 | Forum topic APIs, thread message retrieval | Already in project; has full MTProto forum support |
| commander | ^14.0.3 | CLI framework, global options, subcommands | Already in project; `option()` for --topic, --fields, --jsonl |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (no new deps) | - | All Phase 5 features use existing dependencies | - |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom pick() | lodash.get | One tiny utility vs adding a dependency; custom is correct here |
| Sequential multi-chat search | Promise.allSettled parallel | Sequential avoids rate limiting; parallel faster but riskier |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
  commands/
    chat/
      topics.ts          # NEW: tg chat topics <chat>
      index.ts           # MODIFY: add topics subcommand
    message/
      index.ts           # MODIFY: add --topic to history, send, search
      search.ts          # MODIFY: multi-chat search logic
      history.ts         # MODIFY: --topic flag support
      send.ts            # MODIFY: --topic flag support
    media/
      send.ts            # MODIFY: --topic flag support
  lib/
    output.ts            # MODIFY: JSONL mode, field filtering
    types.ts             # MODIFY: TopicItem, extend GlobalOptions
    format.ts            # MODIFY: topic list formatter
    fields.ts            # NEW: pickFields() utility
  bin/
    tg.ts                # MODIFY: register --fields, --jsonl global options
```

### Pattern 1: Forum Topic Listing via Raw API Invoke
**What:** Use `client.invoke(new Api.channels.GetForumTopics({...}))` for topic listing
**When to use:** Listing topics in a supergroup (WRITE-06)
**Example:**
```typescript
// Source: gramjs Api.channels.GetForumTopics from node_modules/telegram/tl/api.d.ts
const result = await client.invoke(
  new Api.channels.GetForumTopics({
    channel: entity,
    offsetDate: 0,
    offsetId: 0,
    offsetTopic: 0,
    limit: 50,
  })
);
// result.topics: Api.TypeForumTopic[] (ForumTopic | ForumTopicDeleted)
// result.count: total number of topics
// result.messages: Api.TypeMessage[] (latest message per topic)
// result.users: Api.TypeUser[] (topic creators)
```

### Pattern 2: Topic-Scoped Message Reading via replyTo
**What:** Use gramjs `getMessages({ replyTo: topicId })` to read messages within a topic thread
**When to use:** Reading history from a specific topic (WRITE-07)
**Example:**
```typescript
// Source: gramjs client/messages.js - uses Api.messages.GetReplies internally
const messages = await client.getMessages(entity, {
  replyTo: topicId,  // topic root message ID
  limit: 50,
  addOffset: 0,
});
```

### Pattern 3: Sending Messages to a Forum Topic
**What:** Set `replyTo` to the topic's root message ID when sending
**When to use:** Sending text or media to a specific topic (WRITE-08)
**Example:**
```typescript
// Source: gramjs client/messages.js lines 486-491
// When replyTo is set, gramjs creates InputReplyToMessage({ replyToMsgId: topicId })
const sentMsg = await client.sendMessage(entity, {
  message: text,
  replyTo: topicId,  // topic ID = root message ID
});

// For media:
const result = await client.sendFile(entity, {
  file: resolve(filePath),
  caption: caption ?? '',
  replyTo: topicId,
});
```

### Pattern 4: Forum Detection Guard
**What:** Check if a chat entity is a forum-enabled supergroup before allowing --topic
**When to use:** Any command with --topic flag
**Example:**
```typescript
// Source: gramjs api.d.ts line 1064 - Channel has forum?: boolean
const entity = await resolveEntity(client, chatInput);
if (topicId !== undefined) {
  // Entity must be a Channel with forum enabled
  const fullChannel = await client.invoke(
    new Api.channels.GetFullChannel({ channel: entity })
  );
  const channel = fullChannel.chats[0] as any;
  if (!channel?.forum) {
    outputError('Chat is not a forum-enabled supergroup', 'NOT_A_FORUM');
    return;
  }
}
```

### Pattern 5: Multi-Chat Search
**What:** Split comma-separated --chat, resolve each, search each, merge results
**When to use:** READ-06 multi-chat search
**Example:**
```typescript
// Sequential to avoid rate limiting (established project pattern)
const chatIds = opts.chat.split(',').map(c => c.trim());
const allResults: SearchResultItem[] = [];

for (const chatId of chatIds) {
  try {
    const entity = await resolveEntity(client, chatId);
    const messages = await client.getMessages(entity, {
      search: opts.query || '',
      limit: limit,  // fetch up to limit per chat, truncate total later
      addOffset: 0,
      ...(opts.filter && { filter: FILTER_MAP[opts.filter]() }),
    });
    // serialize each with chat context
    for (const msg of messages) {
      allResults.push(serializeSearchResult(msg, ...));
    }
  } catch (err) {
    // Log failed chat to stderr, continue with others
    logStatus(`Warning: failed to search ${chatId}: ${(err as Error).message}`, quiet);
  }
}

// Sort newest first, truncate to total limit
allResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
const limited = allResults.slice(0, limit);
```

### Pattern 6: Field Selection (pickFields)
**What:** A pure utility that picks specific fields from an object, supporting dot notation
**When to use:** OUT-04 --fields implementation
**Example:**
```typescript
// src/lib/fields.ts
export function pickFields<T>(obj: T, fields: string[]): Partial<T> {
  const result: Record<string, any> = {};
  for (const field of fields) {
    const parts = field.split('.');
    let value: any = obj;
    for (const part of parts) {
      if (value == null || typeof value !== 'object') { value = undefined; break; }
      value = (value as Record<string, any>)[part];
    }
    if (value !== undefined) {
      // Reconstruct nested path in result
      let target = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!(parts[i] in target)) target[parts[i]] = {};
        target = target[parts[i]];
      }
      target[parts[parts.length - 1]] = value;
    }
  }
  return result as Partial<T>;
}
```

### Pattern 7: JSONL Output Mode
**What:** New output mode that writes one JSON object per line, no envelope
**When to use:** OUT-05 --jsonl on list commands
**Example:**
```typescript
// In output.ts - new function for JSONL mode
export function outputJsonl<T>(items: T[], fields?: string[]): void {
  for (const item of items) {
    const filtered = fields ? pickFields(item, fields) : item;
    process.stdout.write(JSON.stringify(filtered) + '\n');
  }
}

// In outputSuccess - detect JSONL mode
export function outputSuccess<T>(data: T): void {
  if (_jsonlMode) {
    // Extract array from data shape
    const items = extractListItems(data);
    if (items) {
      outputJsonl(items, _fieldSelection);
      return;
    }
  }
  if (_humanMode) { /* existing */ }
  else {
    const filtered = _fieldSelection ? applyFieldSelection(data, _fieldSelection) : data;
    const envelope: SuccessEnvelope<typeof filtered> = { ok: true, data: filtered };
    process.stdout.write(JSON.stringify(envelope) + '\n');
  }
}
```

### Anti-Patterns to Avoid
- **Fetching GetFullChannel for every topic-scoped command:** Cache the forum check per entity or do it once per command execution. Don't call GetFullChannel repeatedly in loops.
- **Parallel multi-chat search without rate limit consideration:** Sequential is safer given the project already uses withRateLimit. Parallel with Promise.allSettled could trigger FloodWait.
- **Building custom JSONL parser:** JSONL is just `JSON.stringify(item) + '\n'` per line. Don't over-engineer it.
- **Using replyTo AND topMsgId simultaneously for topic sends:** In gramjs, `replyTo: topicId` alone is sufficient for sending to a topic. Adding both creates confusion about reply threading within a topic.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Forum topic listing | Custom scraping of messages | `Api.channels.GetForumTopics` | Official API with pagination, counts, and metadata |
| Thread message retrieval | Manual filtering by topic ID | `getMessages({ replyTo: topicId })` | gramjs uses `messages.GetReplies` which is the correct MTProto method |
| Field selection | Full lodash-style deep getter | Simple `pickFields()` with split('.') | Only dot notation needed per CONTEXT; no bracket syntax, no arrays |

**Key insight:** All forum operations have dedicated gramjs API support. The `replyTo` parameter in `getMessages` internally uses `messages.GetReplies` which is purpose-built for thread/topic message retrieval.

## Common Pitfalls

### Pitfall 1: Forum Detection Requires GetFullChannel
**What goes wrong:** Checking `entity.forum` directly fails because the entity from `getEntity` may not populate the `forum` flag.
**Why it happens:** The basic entity resolution only returns partial Channel data. The `forum` flag may be present on `Channel` objects from some API calls but not consistently.
**How to avoid:** Use `channels.GetFullChannel` to reliably get the `forum` flag, or attempt the `GetForumTopics` call and catch `PEER_ID_INVALID` / error if the chat is not a forum.
**Warning signs:** Works with some chats but fails silently with others.

### Pitfall 2: Topic ID Is the Root Message ID
**What goes wrong:** Confusing the topic ID (from `ForumTopic.id`) with some other identifier.
**Why it happens:** In Telegram's MTProto, the topic ID IS the message ID of the service message that created the topic. When the user passes `--topic 42`, this value is used directly as `replyTo: 42` for sends and `replyTo: 42` for reads.
**How to avoid:** Use the value from `ForumTopic.id` directly in `replyTo` / `replyTo` parameters. No conversion needed.
**Warning signs:** Messages appear in the wrong topic or not at all.

### Pitfall 3: Multi-Chat Search Rate Limiting
**What goes wrong:** Searching many chats in rapid succession triggers Telegram FloodWait.
**Why it happens:** Each chat search is a separate API call. 10+ chats searched simultaneously can trigger rate limits.
**How to avoid:** Search sequentially (already the project pattern). The existing `withRateLimit` wrapper handles FloodWait retries.
**Warning signs:** FloodWaitError with increasing wait times.

### Pitfall 4: JSONL Mode Must Not Use Envelope
**What goes wrong:** Wrapping JSONL items in `{ ok, data }` breaks pipe-friendly consumption.
**Why it happens:** Reusing existing `outputSuccess` without special JSONL path.
**How to avoid:** When `_jsonlMode` is active, write bare items directly. Errors go to stderr only (not stdout). The `{ ok, data }` envelope must not appear.
**Warning signs:** `jq` pipelines fail because items are nested in envelopes.

### Pitfall 5: Field Selection on Metadata vs Array Items
**What goes wrong:** `--fields id,text` accidentally filters away `total` and `count` metadata.
**Why it happens:** Applying field filter to the entire `data` object instead of just the items within arrays.
**How to avoid:** Per CONTEXT.md: "Metadata fields (total, count) inside data always preserved alongside filtered items." Only filter the items within arrays (messages[], chats[], members[], topics[]), preserve all scalar metadata keys.
**Warning signs:** Pagination metadata disappears from output.

### Pitfall 6: GetForumTopics Pagination Is Not Offset-Based
**What goes wrong:** Passing `addOffset` for pagination like other commands.
**Why it happens:** Assuming all Telegram pagination uses the same mechanism.
**How to avoid:** `GetForumTopics` uses `offsetDate`, `offsetId`, and `offsetTopic` for cursor-based pagination. For a simple implementation, fetch with `offsetDate: 0, offsetId: 0, offsetTopic: 0` for the first page. For subsequent pages, use the date/id/topic of the last item.
**Warning signs:** Duplicate topics or missing topics in paginated results.

## Code Examples

### Serializing ForumTopic to TopicItem
```typescript
// Source: gramjs Api.ForumTopic fields from api.d.ts lines 13599-13620
interface TopicItem {
  id: number;
  title: string;
  iconEmoji: string | null;  // from iconEmojiId (resolve or null)
  creationDate: string;       // from date (unix timestamp)
  creatorId: string;          // from fromId (Peer -> string)
  messageCount: number;       // from topMessage (approx latest msg ID)
  isClosed: boolean;
  isPinned: boolean;
}

function serializeTopic(topic: any): TopicItem {
  return {
    id: topic.id,
    title: topic.title,
    iconEmoji: topic.iconEmojiId ? topic.iconEmojiId.toString() : null,
    creationDate: new Date(topic.date * 1000).toISOString(),
    creatorId: bigIntToString(topic.fromId?.userId || topic.fromId?.channelId || topic.fromId?.chatId),
    messageCount: topic.topMessage ?? 0,
    isClosed: !!topic.closed,
    isPinned: !!topic.pinned,
  };
}
```

### Detecting Forum Chat
```typescript
// Approach: try GetForumTopics and catch error for non-forum chats
async function assertForum(client: TelegramClient, entity: any): Promise<void> {
  // Check entity type - must be a Channel (supergroup)
  if (!entity.className || !['Channel'].includes(entity.className)) {
    throw new TgError('Chat is not a forum-enabled supergroup', 'NOT_A_FORUM');
  }
  // Check forum flag if available on entity
  if (entity.forum === false) {
    throw new TgError('Chat is not a forum-enabled supergroup', 'NOT_A_FORUM');
  }
  // If forum flag is undefined/null, we can't be sure - let the API call fail naturally
}
```

### Extracting List Items for JSONL
```typescript
// Detect which property contains the array of items
function extractListItems(data: unknown): unknown[] | null {
  if (data == null || typeof data !== 'object') return null;
  const obj = data as Record<string, any>;

  // Known array properties from project types
  if (Array.isArray(obj.messages)) return obj.messages;
  if (Array.isArray(obj.chats)) return obj.chats;
  if (Array.isArray(obj.members)) return obj.members;
  if (Array.isArray(obj.topics)) return obj.topics;
  if (Array.isArray(obj.files)) return obj.files;

  return null;
}
```

### Applying Field Selection to Data Envelope
```typescript
// Apply fields to array items within data, preserve metadata
function applyFieldSelection(data: unknown, fields: string[]): unknown {
  if (data == null || typeof data !== 'object') return data;
  const obj = data as Record<string, any>;
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      // This is the items array - apply field filtering
      result[key] = value.map(item => pickFields(item, fields));
    } else {
      // Metadata field - preserve as-is (total, count, etc.)
      result[key] = value;
    }
  }

  return result;
}
```

### Registering Global Options in tg.ts
```typescript
// Add to program global options
program
  .option('--fields <fields>', 'Select output fields (comma-separated, dot notation)')
  .option('--jsonl', 'Output one JSON object per line (list commands only)');

// Extend preAction hook
program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  const isHuman = opts.human === true || opts.json === false;

  // JSONL + human mutual exclusion
  if (opts.jsonl && isHuman) {
    outputError('--jsonl and --human are mutually exclusive', 'INVALID_OPTIONS');
    process.exit(1);
  }

  setOutputMode(isHuman);
  if (opts.jsonl) setJsonlMode(true);
  if (opts.fields) setFieldSelection(opts.fields.split(',').map((f: string) => f.trim()));
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No forum support in gramjs | Full forum topic API (GetForumTopics, GetReplies for threads) | gramjs 2.x | All WRITE-06/07/08 possible via existing library |
| Output always as single JSON blob | JSONL for streaming + field selection | Phase 5 | Agent-friendly output for piping to jq, etc. |

**Deprecated/outdated:**
- None relevant to this phase

## Open Questions

1. **ForumTopic.iconEmojiId resolution**
   - What we know: `iconEmojiId` is a `long` (BigInt) representing a custom emoji document ID
   - What's unclear: Whether to resolve this to an actual emoji character or just expose the ID
   - Recommendation: Expose as string ID for now. Resolving to emoji character would require additional API call (`messages.getCustomEmojiDocuments`). The raw ID is sufficient for agent use cases. The `iconColor` (integer) is always available as a fallback visual indicator.

2. **ForumTopic.topMessage meaning**
   - What we know: `topMessage` is an `int` -- the ID of the latest message in the topic
   - What's unclear: Whether this can serve as "messageCount" per the user's desired field
   - Recommendation: `topMessage` is the latest message ID, not a count. There is no direct "message count" field on ForumTopic. Use `topMessage` as `lastMessageId` and note that `unreadCount` is available for unread message counts. Adjust the TopicItem fields accordingly: replace `messageCount` with `lastMessageId` or note the limitation.

3. **Multi-chat search: per-chat limit allocation**
   - What we know: `--limit` is total across all chats
   - What's unclear: How many to fetch per chat to ensure the total limit is respected efficiently
   - Recommendation: Fetch `limit` per chat (over-fetch), merge all, sort by date, truncate to `limit`. This is simple and ensures newest messages across all chats are included. For very large limits or many chats, this is slightly wasteful but acceptable for a CLI tool.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WRITE-06 | List forum topics via `tg chat topics <chat>` | unit | `npx vitest run tests/unit/chat-topics.test.ts -x` | Wave 0 |
| WRITE-07 | Read messages from specific topic via `--topic` | unit | `npx vitest run tests/unit/message-history.test.ts -x` | Extend existing |
| WRITE-08 | Send message to topic via `--topic` | unit | `npx vitest run tests/unit/message-send.test.ts -x` | Extend existing |
| READ-06 | Multi-chat search via `--chat a,b,c` | unit | `npx vitest run tests/unit/message-search.test.ts -x` | Extend existing |
| OUT-04 | Field selection via `--fields` | unit | `npx vitest run tests/unit/fields.test.ts -x` | Wave 0 |
| OUT-05 | JSONL streaming output | unit | `npx vitest run tests/unit/output.test.ts -x` | Extend existing |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/chat-topics.test.ts` -- covers WRITE-06 (topic listing, serialization, forum guard)
- [ ] `tests/unit/fields.test.ts` -- covers OUT-04 (pickFields utility, dot notation, edge cases)
- [ ] Extend `tests/unit/message-history.test.ts` -- covers WRITE-07 (--topic flag passes replyTo)
- [ ] Extend `tests/unit/message-send.test.ts` -- covers WRITE-08 (--topic flag passes replyTo)
- [ ] Extend `tests/unit/message-search.test.ts` -- covers READ-06 (comma-separated --chat)
- [ ] Extend `tests/unit/output.test.ts` -- covers OUT-05 (JSONL mode, field filtering)

## Sources

### Primary (HIGH confidence)
- gramjs `node_modules/telegram/tl/api.d.ts` -- verified all forum topic types: `ForumTopic`, `ForumTopicDeleted`, `channels.GetForumTopics`, `channels.GetForumTopicsByID`, `channels.EditForumTopic`, `channels.CreateForumTopic`
- gramjs `node_modules/telegram/client/messages.d.ts` -- verified `IterMessagesParams.replyTo` for topic scoping, `SendMessageParams.topMsgId` for topic sends
- gramjs `node_modules/telegram/client/messages.js` lines 96-99 -- confirmed `replyTo` uses `Api.messages.GetReplies` for thread retrieval
- gramjs `node_modules/telegram/client/messages.js` lines 486-491 -- confirmed sendMessage builds `InputReplyToMessage` from `replyTo` + `topMsgId`
- gramjs `node_modules/telegram/client/uploads.d.ts` -- confirmed `SendFileInterface` has `topMsgId` and `replyTo` for media sends to topics

### Secondary (MEDIUM confidence)
- Project source code patterns from all existing command handlers (established patterns for entity resolution, output, error handling, serialization)

### Tertiary (LOW confidence)
- `ForumTopic.iconEmojiId` resolution to actual emoji -- needs validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all APIs verified in local gramjs installation
- Architecture: HIGH - follows established project patterns, all integration points identified
- Pitfalls: HIGH - verified gramjs internals for topic/thread mechanics
- Forum API support: HIGH - previously flagged as "unverified" in STATE.md, now fully confirmed with type definitions and implementation code

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable; gramjs API unlikely to change)
