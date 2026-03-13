# Phase 7 External Verification

## Summary

Phase 7 is feature-complete enough to look useful in practice: edit, delete, pin, and unpin commands exist, the test suite is green, and the architecture follows established project patterns. However, the code still has several important safety and contract issues, and the verification report overstates what is actually covered by tests.

## Verification Snapshot

- `npm test`: 455/455 tests passing
- `npx tsc --noEmit`: passing
- All four Phase 7 commands are present in the codebase
- Remaining concerns are about command safety, input validation, and verification fidelity

## Findings

### 1. `message delete` accepts both `--revoke` and `--for-me` together and silently chooses the more destructive mode

**Status:** Open  
**Severity:** Important

### Problem

The command requires that at least one delete mode be specified, but it does not reject the ambiguous case where both are specified together.

### Code snippet

```ts
if (!opts.revoke && !opts.forMe) {
  outputError('Specify --revoke (delete for everyone) or --for-me (delete for self)', 'DELETE_MODE_REQUIRED');
  return;
}

const mode: 'revoke' | 'for-me' = opts.revoke ? 'revoke' : 'for-me';
```

### Why this is a problem

- `tg message delete ... --revoke --for-me` is ambiguous.
- The current implementation silently resolves that ambiguity to `revoke`.
- That is a safety mismatch for a destructive command whose contract emphasizes explicit control.

### Possible solution methods

- Reject the case where both flags are provided with an `INVALID_OPTIONS` error.
- Add a unit test for the mutually-exclusive mode selection.

### 2. Message ID validation is too permissive across multiple commands

**Status:** Open  
**Severity:** Important

### Problem

Several commands use `parseInt(...)` plus `isNaN(...)` only, which accepts inputs like `12abc`, `0`, or `-1` in places where a strictly valid positive message ID should be required.

### Code snippets

```ts
// edit.ts
const messageId = parseInt(msgId, 10);
if (isNaN(messageId)) {
  outputError('Invalid message ID: must be a number', 'INVALID_MESSAGE_ID');
  return;
}
```

```ts
// pin.ts
const messageId = parseInt(msgId, 10);
if (isNaN(messageId)) {
  outputError('Invalid message ID: must be a number', 'INVALID_MESSAGE_ID');
  return;
}
```

```ts
// unpin.ts
const messageId = parseInt(msgId, 10);
if (isNaN(messageId)) {
  outputError('Invalid message ID: must be a number', 'INVALID_MESSAGE_ID');
  return;
}
```

```ts
// delete.ts
const num = parseInt(part, 10);
if (isNaN(num) || num <= 0) {
  invalid.push(part);
} else {
  numericIds.push(num);
}
```

### Why this is a problem

- Inputs like `12abc` are parsed as `12` rather than rejected.
- `edit`, `pin`, and `unpin` also do not reject non-positive IDs.
- This can target the wrong message instead of failing safely.

### Possible solution methods

- Validate IDs with a strict integer regex before parsing.
- Require positive integers consistently across all four commands.
- Add tests for `0`, negative values, and mixed strings like `12abc`.

### 3. Verification overstates JSONL and CLI help coverage

**Status:** Open  
**Severity:** Important

### Problem

The Phase 7 verification report claims delete-result JSONL behavior and full CLI help visibility for the new commands/options, but the current tests do not fully prove those statements.

### Why this is a problem

- `output.ts` contains Phase 7-specific JSONL behavior for `DeleteResult`, but `tests/unit/output.test.ts` does not appear to exercise the `{ deleted, failed, mode }` shape directly.
- `tests/integration/cli-entry.test.ts` still does not verify `message --help` for `edit`, `delete`, `pin`, and `unpin`, nor the presence of `--revoke`, `--for-me`, and `--notify`.
- The verification artifact is stronger than the evidence.

### Possible solution methods

- Add unit tests for delete-result JSONL streaming.
- Add CLI integration tests for the new message subcommands and flags.
- Update the verification report so that it only claims what is directly exercised.

### 4. `message edit` immediate response can still lose sender identity

**Status:** Open  
**Severity:** Suggestion

### Problem

`messageEditAction()` serializes the edited message without passing a sender entity. Since `serializeMessage()` only derives `senderName` from the optional `senderEntity` argument, human-readable output for the immediate edit response can degrade to `Unknown`.

### Code snippet

```ts
const editedMsg = await client.editMessage(entity, {
  message: messageId,
  text,
});

const serialized = serializeMessage(editedMsg as any);
outputSuccess(serialized);
```

### Why this matters

- The edit command response is less polished than the rest of the message pipeline.
- This is not a correctness failure, but it reduces human-mode quality.

### Possible solution methods

- Pass `(editedMsg as any)._sender` if available.
- Or accept this as a best-effort limitation and avoid stronger wording in docs/tests.

## Recommended Next Fix Iteration

1. Make `--revoke` and `--for-me` mutually exclusive.
2. Harden message ID validation everywhere in Phase 7.
3. Add missing JSONL and CLI help coverage before claiming full verification.
4. Optionally improve sender resolution for `message edit` response polish.
