# Phase 7 External Verification 07-01

## Summary

The latest Phase 7 fixes materially improved the implementation. The earlier safety issue around `--revoke` vs `--for-me`, the loose message ID parsing in the mutation commands, and the missing DeleteResult JSONL coverage were all addressed. The phase is now in a stronger state technically, but a few important gaps remain around verification fidelity and one residual polish issue in the edit response path.

## Verification Snapshot

- `npm test`: 467/467 tests passing
- `npx tsc --noEmit`: passing
- The four Phase 7 commands are implemented and tested
- The remaining concerns are now mostly about coverage/claims, not core command existence

## Remaining Issues

### 1. Verification still overstates CLI help coverage

**Status:** Open  
**Severity:** Important

### Problem

The integration suite still does not appear to verify the Phase 7 additions in built CLI help output, while `07-VERIFICATION.md` claims that all 12 message subcommands are visible and that command-specific flags such as `--revoke`, `--for-me`, and `--notify` were verified.

### Why this is a problem

- The runtime code may be correct, but the evidence cited by the verification report is stronger than what the current integration file demonstrates.
- This is a verification-quality issue rather than a production bug.

### Possible solution methods

- Add CLI integration assertions for:
  - `tg message --help` containing `edit`, `delete`, `pin`, `unpin`
  - `tg message delete --help` containing `--revoke` and `--for-me`
  - `tg message pin --help` containing `--notify`
- Update `07-VERIFICATION.md` only after those checks exist.

### 2. `message edit` immediate response still depends on `_sender` and may degrade to `Unknown`

**Status:** Open  
**Severity:** Suggestion

### Problem

`messageEditAction()` now passes `(editedMsg as any)._sender` into `serializeMessage()`, which is better than before, but there is still no fallback if `_sender` is absent. That means immediate human-mode edit responses can still lose sender identity in some gramjs/API situations.

### Code snippet

```ts
const editedMsg = await client.editMessage(entity, {
  message: messageId,
  text,
});

const serialized = serializeMessage(editedMsg as any, (editedMsg as any)._sender);
outputSuccess(serialized);
```

### Why this matters

- This is mostly a polish issue for human-readable output.
- The command will still work, but the returned message can display with `Unknown` sender if `_sender` is not hydrated.

### Possible solution methods

- Accept this as best-effort behavior.
- Or add a sender fallback similar to the read-side resolution path if you want stronger consistency.

## Resolved Since Previous Review

### 1. Delete mode ambiguity fixed

`message delete` now rejects `--revoke` together with `--for-me` using `INVALID_OPTIONS`.

### 2. ID validation tightened

`edit`, `pin`, `unpin`, and `delete` now use stricter positive-integer validation, including rejecting mixed strings like `12abc`.

### 3. DeleteResult JSONL coverage added

`output.ts` retains the JSONL branch for delete results, and `tests/unit/output.test.ts` now explicitly checks delete-result JSONL streaming and field selection.

## Current Position

Phase 7 now looks much better and safer than in the previous review. The remaining work is mostly:

1. tighten the verification/reporting layer for CLI help coverage;
2. optionally improve the immediate sender resolution path for `message edit`.
