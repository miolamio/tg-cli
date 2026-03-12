# Phase 2 External Verification

## Summary

Phase 2 is in good overall shape: the codebase builds, the full test suite passes, and the main chat and message-reading command surface is present. However, the current verification report overstates completeness. Several important behavior gaps remain in real command execution, especially around search error handling, message field completeness, and the interaction between filtering and pagination.

## Verification Snapshot

- `npm test`: 185/185 tests passing
- `npx tsc --noEmit`: passing
- The source tree for Phase 2 is substantial and not stubbed
- The remaining concerns are about correctness and contract fidelity, not missing files

## Findings

### 1. `tg message search` cannot return the planned `MISSING_QUERY` JSON error in the real CLI

**Status:** Open  
**Severity:** Important

### Problem

The command declares `--query` as a Commander `requiredOption`, but the custom JSON-envelope validation lives inside the action handler. In real CLI usage, Commander rejects the command before `messageSearchAction()` runs.

### Code snippets

```ts
message
  .command('search')
  .description('Search messages by keyword')
  .option('--chat <chat>', 'Search in specific chat (omit for global search)')
  .requiredOption('-q, --query <text>', 'Search query (required)')
  .option('--limit <n>', 'Max results', '50')
  .option('--offset <n>', 'Skip results', '0')
  .action(messageSearchAction);
```

```ts
if (!opts.query) {
  outputError(
    '--query (-q) is required for search. Use `tg message history` to browse without a query.',
    'MISSING_QUERY',
  );
  return;
}
```

### Why this is a problem

- Real CLI behavior does not follow the JSON envelope path claimed by the Phase 2 docs.
- `tg message search --json` without `-q` will be rejected by Commander, not by `outputError(...)`.
- This weakens the claim that all command failures remain machine-readable in the same way.

### Possible solution methods

- Remove `requiredOption()` and rely on the action-level validation.
- Or add a Commander-level error override that converts parse errors into the same JSON envelope format.
- Add an integration test for `tg message search --json` without `-q`.

### 2. `senderName` is effectively never populated in Phase 2 message outputs

**Status:** Open  
**Severity:** Important

### Problem

`serializeMessage()` supports `senderName`, but the Phase 2 message commands never pass `senderEntity`, so `senderName` is normally `null`.

### Code snippets

```ts
export function serializeMessage(
  msg: Api.Message,
  senderEntity?: Api.User | Api.Chat | Api.Channel,
): MessageItem {
  const item: MessageItem = {
    id: msg.id,
    text,
    date: new Date(msg.date * 1000).toISOString(),
    senderId: (msg as any).senderId ? bigIntToString((msg as any).senderId) : null,
    senderName: senderName(senderEntity),
```

```ts
let serialized: MessageItem[] = messages.map((msg: any) =>
  serializeMessage(msg),
);
```

```ts
const serialized = messages.map((msg: any) =>
  serializeMessage(msg),
);
```

### Why this is a problem

- The plans and verification report treat the full `MessageItem` shape as implemented.
- In practice, one of the key fields in that shape is not populated by the actual commands.
- Tests only prove `senderName` when `serializeMessage()` is called manually with a synthetic sender entity.

### Possible solution methods

- Resolve and pass sender entities when serializing history and search results.
- Or revise the contract if `senderName` is best-effort rather than guaranteed.
- Add command-level tests that assert `senderName` is present when it should be.

### 3. `tg chat list --type ...` has broken filter-plus-pagination semantics

**Status:** Open  
**Severity:** Important

### Problem

The command paginates first and filters second, then returns the unfiltered total. That means pages can come back short or empty even when more matching chats exist later.

### Code snippet

```ts
const dialogs = await client.getDialogs({
  limit: offset + limit,
  ignoreMigrated: true,
});

const sliced = dialogs.slice(offset, offset + limit);
let chats = sliced.map(serializeDialog);

if (opts.type) {
  chats = chats.filter((c) => c.type === opts.type);
}

outputSuccess({
  chats,
  total: (dialogs as any).total ?? 0,
});
```

### Why this is a problem

- `--offset` applies to the unfiltered list, not the filtered result set.
- `--type` pagination is therefore unreliable for navigation.
- `total` does not describe the filtered result set that the user is actually paging through.

### Possible solution methods

- Filter before slicing, even if that requires fetching more dialogs or iterating.
- Return a filtered total when `--type` is used.
- Add tests that combine `--type` with `--limit` and `--offset`.

### 4. `tg message history` has the same pagination/filter mismatch for date-bounded history

**Status:** Open  
**Severity:** Important

### Problem

The command paginates the raw stream first, then post-filters by `--since`, while still returning the unfiltered server total.

### Code snippet

```ts
const params: Record<string, any> = {
  limit,
  addOffset: offset,
};

if (opts.until) {
  params.offsetDate = Math.floor(new Date(opts.until).getTime() / 1000);
}

const messages = await client.getMessages(entity, params);

let serialized: MessageItem[] = messages.map((msg: any) =>
  serializeMessage(msg),
);

if (opts.since) {
  const sinceMs = new Date(opts.since).getTime();
  serialized = serialized.filter(
    (m) => new Date(m.date).getTime() >= sinceMs,
  );
}

outputSuccess({
  messages: serialized,
  total: (messages as any).total ?? 0,
});
```

### Why this is a problem

- `--offset` applies to the unfiltered history, not the filtered date window.
- `total` does not represent the filtered result set “for navigation”.
- Paging through a bounded time window can be inaccurate or misleading.

### Possible solution methods

- Make date filtering and pagination operate on the same logical result set.
- If post-filtering is required, fetch enough data to fill a filtered page.
- Return a filtered total or explicitly document that total is server-side and unfiltered.
- Add tests combining `--since`/`--until` with offset and total assertions.

### 5. Invalid `--since` / `--until` values are not validated

**Status:** Open  
**Severity:** Suggestion

### Problem

The command passes `new Date(...).getTime()` results directly into filtering and `offsetDate`. Invalid input becomes `NaN`.

### Code snippet

```ts
if (opts.until) {
  params.offsetDate = Math.floor(new Date(opts.until).getTime() / 1000);
}

if (opts.since) {
  const sinceMs = new Date(opts.since).getTime();
  serialized = serialized.filter(
    (m) => new Date(m.date).getTime() >= sinceMs,
  );
}
```

### Why this is a problem

- Bad date input can silently produce empty or misleading results.
- The user gets no structured validation error for malformed date strings.
- This is especially risky for agent-driven CLI usage.

### Possible solution methods

- Validate date parsing explicitly and reject invalid values with a structured error code.
- Add unit tests for malformed `--since` and `--until` inputs.

### 6. Global search does not reliably produce a human-readable `chatTitle` for direct messages

**Status:** Open  
**Severity:** Suggestion

### Problem

For global search, `chatTitle` falls back to the numeric `chatId` when `msg.chat?.title` is unavailable. That is likely for user dialogs / DMs.

### Code snippet

```ts
const chatTitle =
  msg.chat?.title || (msg as any)._chat?.title || chatId;
```

### Why this is a problem

- For direct messages, the “title” may degrade to an ID string instead of a human-readable peer name.
- The requirement says global search results should include chat context; an ID string is weaker than a real title.

### Possible solution methods

- Derive a user-readable title for user dialogs from the peer or sender entity.
- Add a unit test for global search results from a direct-message conversation.

### 7. `tg chat join` success output is missing the planned `chat.type` field

**Status:** Open  
**Severity:** Suggestion

### Problem

The plan says join should return `{ joined: true, chat: { id, title, type } }`, but the implementation only returns `id` and `title`.

### Code snippets

```ts
outputSuccess({
  joined: true,
  chat: chat ? {
    id: bigIntToString(chat.id),
    title: chat.title ?? '',
  } : { id: '', title: '' },
});
```

```ts
outputSuccess({
  joined: true,
  chat: {
    id: bigIntToString((entity as any).id),
    title: (entity as any).title ?? '',
  },
});
```

### Why this is a problem

- The actual payload is weaker than the planned output contract.
- Tests do not currently check for `type`, so the verification report overstates field completeness.

### Possible solution methods

- Include `type` in both join success paths.
- Extend tests to assert the complete response shape.

## Verification Report Corrections Still Needed

`02-VERIFICATION.md` currently appears too strong in a few places:

- The `MISSING_QUERY` behavior is not truly verified at the CLI parse layer.
- The “full `MessageItem` shape” claim is too strong if `senderName` is normally `null`.
- Pagination claims for filtered chat listing and date-bounded history do not fully match actual runtime behavior.
- “No gaps” is too absolute given the above issues.

## Recommended Final Position

Phase 2 should be described as:

- **Strong and mostly complete:** core command surface, serialization layer, peer resolution, CLI wiring, tests/build
- **Still needing correction:** real CLI error path for `message search`, filtered pagination semantics, actual population of some message/chat output fields
