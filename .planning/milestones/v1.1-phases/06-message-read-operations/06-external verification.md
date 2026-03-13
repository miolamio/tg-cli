# Phase 6 External Verification

## Summary

Phase 6 adds useful read-side message operations and the implementation is generally solid, but the current verification report is stronger than the code and tests justify. The main issues are around JSONL behavior for the `{ messages, notFound }` shape, incomplete sender fallback implementation in `message get`, and overstated claims about pinned-message completeness and formatter/help verification.

## Verification Snapshot

- `npm test`: 379/379 tests passing
- `npx tsc --noEmit`: passing
- New command surface is present: `message get`, `message pinned`
- Remaining concerns are about output contracts and verification fidelity, not missing files

## Findings

### 1. `tg message get --jsonl` drops the `notFound` contract

**Status:** Open  
**Severity:** Critical

### Problem

The `message get` command returns `{ messages, notFound }`, but JSONL mode only streams the extracted list items array and silently discards `notFound`. If all requested IDs are missing, JSONL produces no output at all.

### Relevant code

```ts
// messageGetAction
outputSuccess({ messages: found, notFound });
```

```ts
// outputSuccess in JSONL mode
if (_jsonlMode) {
  const items = extractListItems(data);
  if (items !== null) {
    for (const item of items) {
      const filtered = _fieldSelection ? pickFields(item, _fieldSelection) : item;
      process.stdout.write(JSON.stringify(filtered) + '\n');
    }
    return;
  }
}
```

```ts
// extractListItems only returns the list array
for (const key of LIST_KEYS) {
  if (Array.isArray(obj[key])) {
    return obj[key] as unknown[];
  }
}
```

### Why this is a problem

- The plan explicitly requires `{ messages, notFound }` output behavior.
- JSONL currently loses half of that contract.
- For “all missing” cases, the command can become silent in JSONL mode.

### Possible solution methods

- Decide on a JSONL contract for `message get`, for example:
  - stream found messages and emit a final metadata/error line,
  - or explicitly reject `--jsonl` for this command shape,
  - or special-case `{ messages, notFound }` in `outputSuccess`.
- Add tests for `message get --jsonl` with partial and full misses.

### 2. `message get` never implements the planned sender fallback

**Status:** Open  
**Severity:** Important

### Problem

The plan says to use `buildEntityMap` as a fallback when `_sender` is not present, but the implementation imports `buildEntityMap` and never uses it. It always relies on `(msg as any)._sender`.

### Relevant code

```ts
import { buildEntityMap } from '../../lib/entity-map.js';
```

```ts
for (let i = 0; i < numericIds.length; i++) {
  const msg = result[i];
  if (msg) {
    // Use _sender populated by gramjs _finishInit
    const senderEntity = (msg as any)._sender;
    found.push(serializeMessage(msg, senderEntity));
  } else {
    notFound.push(numericIds[i]);
  }
}
```

### Why this is a problem

- The fallback behavior from the plan is not actually implemented.
- If gramjs does not hydrate `_sender`, `senderName` can degrade to `null` / `Unknown` even when enough data exists to recover it.
- Tests do not cover the `_sender`-missing path.

### Possible solution methods

- Actually build an entity map from the result when available and fall back to it if `_sender` is absent.
- Add a unit test where `_sender` is missing but `fromId` plus entity map data are present.

### 3. `message pinned` does not fully match the wording “all currently pinned messages”

**Status:** Open  
**Severity:** Important

### Problem

The verification report says the command returns “all currently pinned messages in the chat”, but the implementation is paginated with a default `limit` of 50. So the bare command returns a page, not necessarily the full set.

### Relevant code

```ts
const limit = parseInt(opts.limit, 10) || 50;
const offset = parseInt(opts.offset, 10) || 0;

const messages = await client.getMessages(entity, {
  search: '',
  filter: new Api.InputMessagesFilterPinned(),
  limit,
  addOffset: offset,
});
```

### Why this is a problem

- The runtime behavior is sensible, but the verification wording is too absolute.
- In human mode, the current formatter path for plain `{ messages, total }` also does not emphasize that `total` may exceed the displayed page.

### Possible solution methods

- Update the docs/report to say the command returns pinned messages with pagination.
- Or change the command to fetch all pinned messages by default, if that is truly the intended contract.

### 4. Verification report overstates formatter/help coverage

**Status:** Open  
**Severity:** Important

### Problem

`06-VERIFICATION.md` claims the Phase 6-specific formatter and CLI help checks are verified, but the cited tests do not fully prove those statements.

### Examples

- `tests/unit/format.test.ts` does not explicitly exercise `formatGetResult` or assert the `Not found: ...` footer.
- `tests/integration/cli-entry.test.ts` does not appear to verify `message --help` coverage for `get` and `pinned`.

### Why this is a problem

- The code may be fine, but the verification artifact is stronger than the evidence.
- This reduces trust in the phase report.

### Possible solution methods

- Add explicit format tests for `formatGetResult`.
- Add CLI help integration tests for the new Phase 6 subcommands.
- Tone down the verification language until the coverage matches the claims.

## Recommended Next Fix Iteration

1. Decide and implement the correct JSONL contract for `message get`.
2. Implement the actual sender fallback using `buildEntityMap`.
3. Align `message pinned` wording with its paginated behavior.
4. Add missing formatter/help verification so the phase report is trustworthy.
