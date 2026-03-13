# Phase 6 External Verification 06-01

## Summary

The Phase 6 implementation remains stable under test and type-checking, but the latest review shows that several earlier concerns were not fully addressed. The main issues are in the JSONL contract for `message get`, incomplete sender fallback logic, and verification language that still overstates what is actually proven.

## Verification Snapshot

- `npm test`: 407/407 tests passing
- `npx tsc --noEmit`: passing
- The new commands are present and the code is non-trivial
- Remaining concerns are about output semantics and verification fidelity

## Findings

### 1. `message get --jsonl` still loses the `notFound` contract

**Status:** Open  
**Severity:** Critical

### Problem

The command returns `{ messages, notFound }`, but JSONL mode streams found messages and moves `notFound` to stderr text instead of preserving a machine-readable contract. If all IDs are missing, there are no JSONL lines at all.

### Code snippet

```ts
if (_jsonlMode) {
  // Special case: { messages, notFound } shape from `message get`
  if (obj != null && typeof obj === 'object' && Array.isArray(obj.messages) && Array.isArray(obj.notFound)) {
    for (const item of obj.messages as unknown[]) {
      const filtered = _fieldSelection ? pickFields(item, _fieldSelection) : item;
      process.stdout.write(JSON.stringify(filtered) + '\n');
    }
    if ((obj.notFound as number[]).length > 0) {
      process.stderr.write(`Not found: ${(obj.notFound as number[]).join(', ')}\n`);
    }
    return;
  }
}
```

### Why this is a problem

- The original command contract is no longer preserved in JSONL mode.
- `notFound` becomes human text instead of structured output.
- A full miss produces no JSON output at all, which is hard for automation to distinguish from other conditions.

### Possible solution methods

- Define a structured JSONL contract for `message get`, for example one metadata line plus message lines.
- Or explicitly reject `--jsonl` for `message get`.
- Add tests for partial and full `notFound` behavior in JSONL mode.

### 2. Sender fallback using `buildEntityMap` is still not implemented

**Status:** Open  
**Severity:** Important

### Problem

`messageGetAction()` still imports no fallback helper and only uses `(msg as any)._sender`. The plan explicitly required falling back to entity-map-based sender resolution when `_sender` is unavailable.

### Code snippet

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

- The planned fallback behavior is still absent.
- If `_sender` is missing, `senderName` degrades unnecessarily.
- Existing tests do not cover the `_sender`-missing path.

### Possible solution methods

- Restore the `buildEntityMap` fallback in `messageGetAction`.
- Add a test where `_sender` is absent but sender information exists in `users/chats`.

### 3. Verification still overstates `message pinned` semantics

**Status:** Open  
**Severity:** Important

### Problem

The verification report says the command returns “all currently pinned messages,” but the implementation is clearly paginated and defaults to `limit = 50`.

### Code snippet

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

- The runtime behavior is page-based, not “all pinned messages”.
- The implementation may be correct, but the verification wording is too strong.

### Possible solution methods

- Update verification language to say pinned messages are returned with pagination.
- Or change runtime behavior if “all pinned messages” is the real intended contract.

### 4. Formatter/help verification is still stronger than the actual evidence

**Status:** Open  
**Severity:** Important

### Problem

The new tests improved overall coverage, but there are still no CLI help assertions for `message get` and `message pinned`, and the verification report still describes those checks as if they were already proven.

### Why this is a problem

- The code may be fine, but the report is stronger than the evidence.
- This is a verification-quality issue that affects confidence in the phase artifact.

### Possible solution methods

- Add integration tests for `tg message --help` containing `get` and `pinned`.
- Keep verification wording strictly aligned to the tests that actually exist.
