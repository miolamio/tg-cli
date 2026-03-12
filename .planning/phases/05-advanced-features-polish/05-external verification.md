# Phase 5 External Verification

## Summary

Phase 5 is feature-rich and the codebase remains stable under test: topic listing, field selection, JSONL output, topic-scoped commands, and multi-chat search are all present, and the full suite passes. However, several important contract and behavior issues remain in the implementation, especially around pagination semantics, `--fields` behavior on single-object outputs, and how strongly the verification report describes what is actually proven.

## Verification Snapshot

- `npm test`: 379/379 tests passing
- `npx tsc --noEmit`: passing
- The source tree is substantive and the command surface is present
- The remaining concerns are about runtime semantics and over-strong verification claims

## Findings

### 1. `tg chat topics` pagination is incorrect when `--limit` and `--offset` are combined

**Status:** Open  
**Severity:** Critical

### Problem

The handler passes the raw `limit` to `GetForumTopics`, serializes only that first page, and then applies `slice(offset)` client-side. With `--limit 10 --offset 10`, the command fetches topics 1-10 and returns an empty array instead of topics 11-20.

### Code snippet

```ts
const result = await client.invoke(
  new Api.channels.GetForumTopics({
    channel: entity as Api.Channel,
    offsetDate: 0,
    offsetId: 0,
    offsetTopic: 0,
    limit,
  }),
);

const validTopics = (result as any).topics.filter(
  (t: any) => t.className !== 'ForumTopicDeleted',
);

const serialized = validTopics.map(serializeTopic);

// Apply client-side offset slicing
const sliced = serialized.slice(offset);

outputSuccess({
  topics: sliced,
  total: (result as any).count,
});
```

### Why this is a problem

- Offset is not applied to the fetched window correctly.
- The command fails for normal second-page pagination.
- The verification report currently overstates pagination correctness.

### Possible solution methods

- Fetch `offset + limit` topics before slicing.
- Or implement real cursor-based pagination using `offsetTopic`/`offsetId` semantics.
- Add a test that combines non-zero `--offset` with a page-sized `--limit`.

### 2. `--fields` does not actually work for single-object outputs

**Status:** Open  
**Severity:** Important

### Problem

`outputSuccess()` applies `applyFieldSelection()` in JSON mode, but `applyFieldSelection()` only filters array-valued entries. When a command returns a single object, such as `message send` or single-file `media send`, `--fields id,text` does nothing.

### Code snippets

```ts
export function applyFieldSelection(data: unknown, fields: string[]): unknown {
  if (data == null || typeof data !== 'object') return data;

  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      typeof value[0] === 'object' &&
      value[0] !== null
    ) {
      result[key] = value.map((item) => pickFields(item, fields));
    } else {
      result[key] = value;
    }
  }

  return result;
}
```

```ts
const filteredData = _fieldSelection
  ? applyFieldSelection(data, _fieldSelection) as T
  : data;
const envelope: SuccessEnvelope<T> = { ok: true, data: filteredData };
```

### Why this is a problem

- The requirement and verification language say `--fields` works for “any command”.
- In practice, it only works for list-like payloads.
- This is not covered by current tests, which focus on list-shaped data.

### Possible solution methods

- Extend `applyFieldSelection()` to detect and filter top-level object outputs too.
- Or narrow the contract so `--fields` is explicitly list-oriented only.
- Add unit tests for single-object outputs such as `MessageItem` and `DownloadResult`.

### 3. Multi-chat search has incorrect `--offset` semantics

**Status:** Open  
**Severity:** Important

### Problem

The implementation reuses the same `addOffset: offset` search params for each chat independently, then merges and sorts the results. That means `--offset 10` skips 10 results in each chat rather than skipping 10 results in the merged newest-first result set.

### Code snippet

```ts
const searchParams: Record<string, any> = {
  search: opts.query || '',
  limit,
  addOffset: offset,
};

// ...
for (const chatId of chatIds) {
  try {
    const entity = await resolveEntity(client, chatId);
    const messages = await client.getMessages(entity, { ...searchParams, limit });
    // collect results
  } catch (err) {
    logStatus(`Warning: failed to search ${chatId}: ${(err as Error).message}`, quiet);
  }
}

allResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
const limited = allResults.slice(0, limit);
outputSuccess({ messages: limited, total: limited.length });
```

### Why this is a problem

- Offset semantics change in multi-chat mode without being documented.
- The command still exposes a generic `--offset`, so users reasonably expect merged-stream offset behavior.
- Tests do not currently cover this mismatch.

### Possible solution methods

- Define and document that `offset` is per-chat in multi-chat mode.
- Or apply offset after merge/sort rather than before each chat query.
- Add tests specifically for `--chat a,b,c --offset N`.

### 4. Topic-scoped media send is marked fully verified, but the test suite does not really prove it

**Status:** Open  
**Severity:** Important

### Problem

The verification report claims `tg media send <chat> <file> --topic <topicId>` is verified, but the unit test file for `media send` does not actually cover `--topic`, `assertForum`, or topic-overrides-reply-to behavior.

### Why this is a problem

- The code may be correct, but the verification claim is stronger than the evidence.
- This is a verification-quality problem, not necessarily a production bug.
- It weakens trust in the phase report.

### Possible solution methods

- Add explicit `--topic` tests to `tests/unit/media-send.test.ts`.
- Add a test for `NOT_A_FORUM` in `media send`.
- Add a test showing topic overrides reply-to in media send, mirroring the message send tests.

### 5. The CLI help text for multi-chat search under-describes the actual feature

**Status:** Open  
**Severity:** Suggestion

### Problem

`message search` still documents `--chat <chat>` as if it were a single-chat option, while Phase 5 overloads it with comma-separated multi-chat input and introduces special interaction with `--topic`.

### Code snippet

```ts
message
  .command('search')
  .description('Search messages by keyword or media type')
  .option('--chat <chat>', 'Search in specific chat (omit for global search)')
  .option('--query <text>', 'Search query')
  .option('--filter <type>', 'Filter by type (...)')
  .option('--limit <n>', 'Max results', '50')
  .option('--offset <n>', 'Skip results', '0')
  .option('--topic <topicId>', 'Forum topic ID')
```

### Why this matters

- The feature is less discoverable than the roadmap and verification suggest.
- Users are not told that comma-separated chats are supported.
- Users are not warned that `--topic` is invalid with multi-chat search.

### Possible solution methods

- Update help text for `--chat` to mention comma-separated values.
- Add a short help note that `--topic` only works with a single `--chat`.

## Recommended Next Fix Iteration

1. Fix `chat topics` pagination semantics first.
2. Decide whether `--fields` should truly work on all outputs or only list-shaped data.
3. Clarify or fix `--offset` behavior for multi-chat search.
4. Add missing `media send --topic` verification coverage.
5. Tighten CLI help text around multi-chat search behavior.
