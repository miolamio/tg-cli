# Phase 2 External Verification 02-01

## Summary

Phase 2 looks strong overall: the command surface is present, the code is non-trivial, the build passes, and the full test suite passes. Before treating the phase as fully settled, it is worth explicitly confirming that several current behaviors are intentional and match the product contract.

## Verification Snapshot

- `npm test`: 185/185 tests passing
- `npx tsc --noEmit`: passing
- Chat and message command groups are implemented and wired into the CLI
- The remaining review points are mostly about contract fidelity and expected runtime semantics

## What To Check

### 1. `tg message search` without `-q` / `--query`

Check that it is acceptable for the real CLI to fail at the Commander parsing layer instead of returning the custom JSON-envelope `MISSING_QUERY` error from `messageSearchAction()`.

### Why to check this

- The command defines `--query` as a `requiredOption`.
- That means Commander can stop execution before the action handler runs.
- If this is intentional, the current behavior is fine.
- If you expect all command failures to be machine-readable through `outputError(...)`, this should be reconsidered.

### 2. `senderName` in message history and search output

Check that it is acceptable for `senderName` to usually be `null` in actual Phase 2 command output.

### Why to check this

- `serializeMessage()` supports `senderName`, but the current commands do not pass a `senderEntity`.
- The field exists in the output shape, but practical population appears limited.
- If `senderName` is supposed to be guaranteed, the current implementation likely does not meet that expectation.
- If it is best-effort, the current behavior may be acceptable.

### 3. `tg chat list --type ... --limit ... --offset ...`

Check that pagination is intended to apply to the full dialog list first, and only then to filter by `--type`.

### Why to check this

- The current implementation fetches `offset + limit`, slices, then applies the type filter.
- This can produce a short or empty page even when more matching chats exist later.
- The returned `total` is the total number of dialogs, not the total number of filtered chats.
- If filtered pagination is supposed to feel natural, this behavior should be revisited.

### 4. `tg message history --since/--until --offset`

Check that date filtering and pagination are intended to work on different layers of the result set.

### Why to check this

- `--until` is applied server-side via `offsetDate`.
- `--since` is applied afterward as a client-side filter.
- `--offset` and `total` therefore describe the unfiltered stream, not the final date-bounded result set.
- If this is expected, the current implementation is acceptable.
- If the user is meant to page through the filtered date window itself, this likely needs refinement.

### 5. Invalid `--since` / `--until` values

Check that malformed date inputs are allowed to fail implicitly rather than returning a structured validation error.

### Why to check this

- The code currently uses `new Date(...).getTime()` directly.
- Invalid dates can become `NaN`, which may lead to empty or misleading results.
- If agent-facing robustness matters here, explicit input validation may still be desirable.

### 6. Global search `chatTitle` for direct messages

Check that it is acceptable for direct-message results in global search to fall back to an ID-like `chatTitle`.

### Why to check this

- The current logic prefers `msg.chat?.title` or `_chat?.title`.
- For DMs, that metadata may not exist, so the fallback is `chatId`.
- If “chat context” only needs to be technically present, this is fine.
- If it must be human-readable, this probably deserves improvement.

### 7. `tg chat join` response shape

Check that the join success payload is intentionally weaker than the original plan.

### Why to check this

- The plan described a payload with `chat: { id, title, type }`.
- The current implementation returns only `id` and `title`.
- If `type` is not actually needed, the current implementation is acceptable.
- If the plan still represents the intended API contract, this should be aligned.

## Recommended Review Stance

If all points above are confirmed as intentional behavior, Phase 2 can be treated as effectively complete.

If any point above is answered with “no, that is not the intended contract,” then the next iteration should focus on contract alignment rather than core feature implementation.
