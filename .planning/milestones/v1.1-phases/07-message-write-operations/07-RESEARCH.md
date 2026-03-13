# Phase 7: Message Write Operations - Research

**Researched:** 2026-03-13
**Domain:** Telegram MTProto message mutation via gramjs (edit, delete, pin, unpin)
**Confidence:** HIGH

## Summary

Phase 7 implements four message mutation commands: edit, delete, pin, and unpin. All four operations map directly to well-documented gramjs high-level client methods (`editMessage`, `deleteMessages`, `pinMessage`, `unpinMessage`) with clear TypeScript interfaces. The existing codebase provides mature patterns for command structure, output formatting, error handling, and testing that can be replicated for each new command.

The most important safety finding is that gramjs `deleteMessages` defaults `revoke` to `false` (delete for self only), but for channels/megagroups it always deletes for everyone regardless of the flag. This aligns well with the user's requirement for explicit `--revoke`/`--for-me` flags. A second critical finding is that gramjs `pinMessage` already defaults `notify` to `false` (silent), which matches the user's "silent by default" requirement. The `unpinMessage` method returns `undefined` (no service message), so the command must synthesize its own confirmation response.

**Primary recommendation:** Use gramjs high-level client methods for all four operations. Extend `formatError` to detect `RPCError.errorMessage` for Telegram-specific error translation. Follow the established command patterns from send.ts (edit), get.ts (delete batch IDs), and react.ts (pin/unpin confirmation).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `tg message delete <chat> <ids>` requires explicit `--revoke` or `--for-me` flag -- command errors with `DELETE_MODE_REQUIRED` if neither specified
- No default deletion mode -- agents and humans must make a conscious choice
- Comma-separated IDs (same as forward/get), max 100 IDs enforced client-side
- Split result: `{ deleted: [ids], failed: [{id, reason}], mode: "revoke"|"for-me" }`
- `ok: true` if any deletions succeed, `ok: false` only when all fail or validation errors
- No client-side time checks for `--revoke` -- let Telegram API enforce revoke windows
- Human-readable: summary line "Deleted 2 messages (revoke). Failed: 789 (MESSAGE_DELETE_FORBIDDEN)"
- `tg message edit <chat> <id> <text>` -- positional arguments matching send pattern
- Stdin pipe supported: `tg message edit <chat> <id> -` (dash placeholder, same as send)
- Markdown formatting via gramjs MarkdownParser (same as send)
- Text messages only -- no media caption editing in this phase
- No client-side 48h window check -- let Telegram API reject with MESSAGE_EDIT_TIME_EXPIRED
- Returns full edited MessageItem (same shape as send response, with editDate populated)
- Human-readable: `[date] You (edited): new text` -- same format as send, no diff view
- `tg message pin <chat> <id>` -- single message ID only (no batch)
- Silent by default (no notification to members) -- `--notify` flag to opt in
- Returns simple confirmation: `{ messageId, chatId, action: "pinned", silent: true|false }`
- Human-readable: "Pinned message 456 in @group (silent)" or "Pinned message 456 in @group (notified)"
- `tg message unpin <chat> <id>` -- single message ID only (no batch)
- Returns simple confirmation: `{ messageId, chatId, action: "unpinned" }`
- All four commands translate Telegram errors into actionable messages with original error code preserved
- Error response includes both the human message and the Telegram error code for agent parsing

### Claude's Discretion
- gramjs API method selection for each operation (editMessage, deleteMessages, pinMessage, unpinMessage)
- Exact error code mapping completeness (discover additional Telegram errors during implementation)
- Human-readable format details for pin/unpin output
- How to handle network/timeout errors during batch delete (retry logic, partial state)

### Deferred Ideas (OUT OF SCOPE)
- Media caption editing -- could extend edit command later
- Batch pin/unpin -- if needed, add comma-separated ID support
- Unpin all messages in chat -- tracked as ADV-09 in v2 requirements
- Delete confirmation prompt for interactive use -- not needed for agent-first CLI
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WRITE-09 | Edit own sent messages with 48h window error handling | gramjs `client.editMessage(entity, { message: id, text })` returns `Api.Message`; Telegram throws `MESSAGE_EDIT_TIME_EXPIRED` and `MESSAGE_AUTHOR_REQUIRED` as RPCError |
| WRITE-10 | Delete messages with explicit revoke control | gramjs `client.deleteMessages(entity, ids, { revoke })` with `revoke` defaulting to `false`; channels always delete for everyone via `channels.DeleteMessages` API |
| WRITE-11 | Pin message with silent default and --notify opt-in | gramjs `client.pinMessage(entity, msgId, { notify })` with `notify` defaulting to `false` (maps to `silent: !notify` in API call) |
| WRITE-12 | Unpin a specific message | gramjs `client.unpinMessage(entity, msgId)` returns `undefined`; confirmation must be synthesized |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| telegram (gramjs) | ^2.26.22 | MTProto client with editMessage, deleteMessages, pinMessage, unpinMessage | Already in use; high-level methods handle entity resolution, chunking, and API serialization |
| commander | ^14.0.3 | CLI command registration and option parsing | Already in use; established pattern for subcommand registration |
| picocolors | ^1.1.1 | Terminal color output for human-readable formatting | Already in use in format.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^3.2.4 | Unit testing framework | Already in use; test all four commands and error translation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| High-level `client.editMessage` | Raw `Api.messages.EditMessage` | High-level handles parse mode, entity resolution, response unwrapping; raw API gives no benefit here |
| High-level `client.deleteMessages` | Raw `Api.messages.DeleteMessages` + `Api.channels.DeleteMessages` | High-level handles channel vs non-channel routing and ID chunking (max 100 per call) automatically |
| High-level `client.pinMessage` | Raw `Api.messages.UpdatePinnedMessage` | High-level maps `notify` boolean to `silent` flag correctly; handles response unwrapping |

**No new dependencies needed.** All four commands use existing libraries.

## Architecture Patterns

### Recommended Project Structure
```
src/
  commands/
    message/
      index.ts           # ADD: register edit, delete, pin, unpin subcommands
      edit.ts            # NEW: messageEditAction handler
      delete.ts          # NEW: messageDeleteAction handler
      pin.ts             # NEW: messagePinAction handler
      unpin.ts           # NEW: messageUnpinAction handler
  lib/
    errors.ts            # MODIFY: add translateTelegramError() for RPCError mapping
    format.ts            # MODIFY: add formatDeleteResult, formatPinResult, formatEditResult
    types.ts             # MODIFY: add DeleteResult, PinResult types
    output.ts            # MODIFY: add formatData dispatch for new result shapes
tests/
  unit/
    message-edit.test.ts    # NEW
    message-delete.test.ts  # NEW
    message-pin.test.ts     # NEW
    message-unpin.test.ts   # NEW
    errors.test.ts          # NEW or MODIFY: test error translation
    format.test.ts          # MODIFY: add tests for new formatters
```

### Pattern 1: Command Action Handler (from send.ts / react.ts)
**What:** Each command follows the established `this: Command` action pattern with `optsWithGlobals`, `store.withLock`, `withClient`, `resolveEntity`, then API call.
**When to use:** All four new commands.
**Example:**
```typescript
// Verified pattern from src/commands/message/send.ts
export async function messageEditAction(this: Command, chat: string, msgId: string, text: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile } = opts;
  // ...validate msgId, handle stdin...
  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));
  try {
    await store.withLock(profile, async (sessionString) => {
      if (!sessionString) { outputError('Not logged in...', 'NOT_AUTHENTICATED'); return; }
      const { apiId, apiHash } = getCredentialsOrThrow(config);
      await withClient({ apiId, apiHash, sessionString }, async (client) => {
        const entity = await resolveEntity(client, chat);
        const editedMsg = await client.editMessage(entity, { message: id, text });
        outputSuccess(serializeMessage(editedMsg as any));
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
```

### Pattern 2: Batch ID Parsing (from get.ts / forward.ts)
**What:** Parse comma-separated message IDs with validation, max 100 limit.
**When to use:** Delete command (batch IDs).
**Example:**
```typescript
// Verified pattern from src/commands/message/get.ts
const parts = idsInput.split(',').map(s => s.trim());
const numericIds: number[] = [];
const invalid: string[] = [];
for (const part of parts) {
  const num = parseInt(part, 10);
  if (isNaN(num) || num <= 0) { invalid.push(part); }
  else { numericIds.push(num); }
}
if (invalid.length > 0) { outputError(`Invalid message IDs: ${invalid.join(', ')}`, 'INVALID_MSG_ID'); return; }
if (numericIds.length > 100) { outputError(`Maximum 100 IDs...`, 'TOO_MANY_IDS'); return; }
```

### Pattern 3: Simple Confirmation Response (from react.ts)
**What:** Return `{ messageId, chatId, action, ... }` for operations without a full message response.
**When to use:** Pin and unpin commands.
**Example:**
```typescript
// Verified pattern from src/commands/message/react.ts
outputSuccess({
  messageId,
  chatId: bigIntToString((entity as any).id),
  action: 'pinned',
  silent: !notify,
});
```

### Pattern 4: Telegram Error Translation
**What:** Map RPCError.errorMessage to actionable CLI messages while preserving the original error code.
**When to use:** All four commands' catch blocks.
**Example:**
```typescript
// NEW pattern - extend formatError to handle gramjs RPCError
const TELEGRAM_ERROR_MAP: Record<string, string> = {
  'MESSAGE_EDIT_TIME_EXPIRED': 'Cannot edit: 48-hour edit window has expired',
  'MESSAGE_AUTHOR_REQUIRED': 'Cannot edit: you can only edit your own messages',
  'MESSAGE_DELETE_FORBIDDEN': 'Cannot delete this message',
  'CHAT_ADMIN_REQUIRED': 'Admin privileges required',
  'MESSAGE_ID_INVALID': 'Message not found',
  'PEER_ID_INVALID': 'Chat not found',
  'MESSAGE_NOT_MODIFIED': 'Message content unchanged',
};

export function translateTelegramError(err: unknown): { message: string; code: string } {
  // gramjs RPCError has .errorMessage with the Telegram error code
  if (err && typeof err === 'object' && 'errorMessage' in err) {
    const errorMessage = (err as any).errorMessage as string;
    const humanMessage = TELEGRAM_ERROR_MAP[errorMessage] || errorMessage;
    return { message: humanMessage, code: errorMessage };
  }
  return formatError(err);
}
```

### Anti-Patterns to Avoid
- **Never default delete to revoke:** The CONTEXT.md explicitly requires `DELETE_MODE_REQUIRED` error when neither `--revoke` nor `--for-me` is specified. Never pass a default `revoke` value to gramjs.
- **Never client-side validate time windows:** Don't check 48h for edit or revoke windows. Let Telegram API reject with proper error codes.
- **Never batch pin/unpin:** Pin and unpin are single-message operations in this phase.
- **Never return generic gramjs errors:** Always translate through the error map to provide actionable messages.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Message editing with markdown | Custom markdown parser + entity builder | `client.editMessage(entity, { message: id, text })` | gramjs handles markdown parsing via parseMode default, same as sendMessage |
| Channel vs group delete routing | Separate API calls for channels vs groups | `client.deleteMessages(entity, ids, { revoke })` | gramjs automatically uses `channels.DeleteMessages` for channels and `messages.DeleteMessages` for others (verified in source, line 702-717) |
| ID chunking for batch delete | Custom chunking logic | `client.deleteMessages` | gramjs internally chunks IDs (via `utils.chunks`) when processing batch deletions |
| Pin notification control | Manual `silent` flag on raw API | `client.pinMessage(entity, msg, { notify })` | gramjs maps `notify` to `silent: !notify` internally (verified in source, line 738) |
| editDate extraction | Custom date parsing from API response | `serializeMessage(editedMsg)` | The existing serializer handles all message fields including date, which covers the edit case since gramjs returns the full updated Api.Message |

**Key insight:** gramjs high-level client methods handle all the complexity (entity type detection, ID chunking, flag mapping, response unwrapping). Using raw API would duplicate logic that gramjs already handles correctly.

## Common Pitfalls

### Pitfall 1: gramjs deleteMessages ignores revoke for channels
**What goes wrong:** Setting `revoke: false` for a channel/megagroup still deletes the message for everyone because gramjs uses `channels.DeleteMessages` (which has no revoke parameter) instead of `messages.DeleteMessages`.
**Why it happens:** Channels/megagroups always delete for everyone per Telegram's API design. The `revoke` parameter only matters for private chats and basic groups.
**How to avoid:** Document this behavior clearly. The `--for-me` flag will be a no-op for channels/supergroups. Consider logging a warning to stderr when `--for-me` is used on a channel entity.
**Warning signs:** User reports "deleted for everyone despite --for-me flag" in channels.

### Pitfall 2: unpinMessage returns undefined
**What goes wrong:** Expecting a message or confirmation object from `client.unpinMessage()` -- it returns `undefined`.
**Why it happens:** Unpinning does not produce a service message in Telegram's API. The gramjs source confirms: "Unpinning does not produce a service message."
**How to avoid:** Synthesize the confirmation response `{ messageId, chatId, action: 'unpinned' }` from the input arguments rather than from the API response.
**Warning signs:** TypeError when trying to access properties on the `undefined` return value.

### Pitfall 3: RPCError.errorMessage vs Error.message
**What goes wrong:** Using `err.message` from gramjs RPCError gives a formatted string like `"400: MESSAGE_EDIT_TIME_EXPIRED (caused by EditMessage)"` instead of the clean error code.
**Why it happens:** gramjs RPCError extends CustomError and formats `.message` as `"{code}: {errorMessage} (caused by {method})"`. The raw Telegram error code is in `.errorMessage`.
**How to avoid:** Check for `err.errorMessage` property first (it exists on RPCError instances), then fall back to `err.message`.
**Warning signs:** Error messages shown to users contain "(caused by EditMessage)" suffixes.

### Pitfall 4: editMessage returns Message without _sender populated
**What goes wrong:** The edited message returned by `client.editMessage()` may not have `_sender` populated, resulting in `senderName: null` in the serialized output.
**Why it happens:** gramjs `_getResponseMessage` reconstructs the message from the Update response but may not populate `_sender` the same way `getMessages` does.
**How to avoid:** Pass the sender entity explicitly to `serializeMessage()` if available, or accept `null` sender name since the user knows they just edited their own message.
**Warning signs:** `senderName` is always null in edit responses.

### Pitfall 5: Delete result does not return which IDs succeeded
**What goes wrong:** gramjs `deleteMessages` returns `AffectedMessages[]` which contains only `pts` and `pts_count` -- not the actual deleted message IDs.
**Why it happens:** Telegram's API design returns affected points, not message IDs, for efficiency.
**How to avoid:** For the split result `{ deleted, failed }`, assume all IDs succeeded if no error is thrown. If an error occurs mid-batch, the response shape must be handled carefully -- individual failures are signaled by Telegram throwing an error, not by partial success reporting.
**Warning signs:** Unable to populate the `deleted` array with actual IDs from the API response.

### Pitfall 6: editDate field in gramjs Message
**What goes wrong:** Expecting `editDate` to be on the serialized MessageItem but it's not part of the current `MessageItem` interface.
**Why it happens:** The `serializeMessage` function maps standard fields but does not currently extract `editDate`.
**How to avoid:** Check if `(msg as any).editDate` exists on the gramjs Message object. If present, convert from Unix timestamp like `date` field. Note: for newly edited messages returned from `editMessage`, the `editDate` field should be populated by Telegram.
**Warning signs:** Edit responses don't show when the message was last edited.

## Code Examples

### Edit Message
```typescript
// gramjs high-level API (verified from node_modules/telegram/client/messages.d.ts)
// EditMessageParams: { message: number | Api.Message, text?: string, parseMode?, ... }
const editedMsg = await client.editMessage(entity, {
  message: messageId,  // number (message ID)
  text: newText,       // string (new message text)
  // parseMode defaults to Markdown (same as sendMessage)
});
// Returns: Api.Message (the edited message)
const serialized = serializeMessage(editedMsg as any);
```

### Delete Messages
```typescript
// gramjs high-level API (verified from node_modules/telegram/client/messages.js line 681)
// Signature: deleteMessages(client, entity, messageIds[], { revoke = false })
// For channels: always uses channels.DeleteMessages (revoke ignored)
// For others: uses messages.DeleteMessages with revoke flag
const results = await client.deleteMessages(entity, numericIds, {
  revoke: mode === 'revoke',  // true = delete for everyone, false = delete for self
});
// Returns: Api.messages.AffectedMessages[] (pts/pts_count, NOT message IDs)
```

### Pin Message
```typescript
// gramjs high-level API (verified from node_modules/telegram/client/messages.js line 721-722)
// UpdatePinMessageParams: { notify?: boolean, pmOneSide?: boolean }
// notify defaults to false (silent by default)
const result = await client.pinMessage(entity, messageId, {
  notify: notifyFlag,  // false = silent (default), true = notify members
});
// Returns: Api.Message (service message) or undefined (if already pinned / own chat)
```

### Unpin Message
```typescript
// gramjs high-level API (verified from node_modules/telegram/client/messages.js line 725-726)
// If message is undefined/0, unpins ALL (not wanted in this phase)
// Always pass the specific message ID
await client.unpinMessage(entity, messageId);
// Returns: undefined (unpinning produces no service message)
// Must synthesize confirmation from input args
```

### Error Translation
```typescript
// gramjs RPCError structure (verified from node_modules/telegram/errors/RPCBaseErrors.js)
// RPCError extends CustomError {
//   code: number (e.g., 400)
//   errorMessage: string (e.g., 'MESSAGE_EDIT_TIME_EXPIRED')
//   message: string (formatted: '400: MESSAGE_EDIT_TIME_EXPIRED (caused by EditMessage)')
// }

// Detection: check for errorMessage property
function isRPCError(err: unknown): err is { errorMessage: string; code: number; message: string } {
  return err != null && typeof err === 'object' && 'errorMessage' in err;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw `Api.messages.EditMessage` | `client.editMessage()` high-level | gramjs v1.x+ | Handles parseMode, entity resolution, response unwrapping |
| Manual channel detection for delete | `client.deleteMessages()` auto-routes | gramjs v1.x+ | Automatically uses correct API based on entity type |
| Manual `silent: true` on raw UpdatePinnedMessage | `client.pinMessage(entity, msg, { notify: false })` | gramjs v1.x+ | Cleaner boolean semantic (notify vs silent inversion) |

**No deprecated APIs in use.** All four gramjs high-level methods are stable and documented.

## Open Questions

1. **editDate serialization**
   - What we know: gramjs Message has `editDate` (Unix timestamp) when a message has been edited. Current `serializeMessage` does not extract it.
   - What's unclear: Whether to add `editDate` to the `MessageItem` interface (affects all messages globally) or only include it in the edit response.
   - Recommendation: Add `editDate` as an optional field to `MessageItem` -- it's useful for all message contexts (history, search, get-by-ID), not just edit responses.

2. **Batch delete partial failure behavior**
   - What we know: gramjs `deleteMessages` returns `AffectedMessages[]` (one per chunk of 100). Individual message failures throw RPCErrors.
   - What's unclear: Whether Telegram reports per-message failures within a batch or fails the entire batch atomically.
   - Recommendation: Treat each `deleteMessages` call as atomic (all succeed or throw). If an error occurs, report all IDs as failed. The split result `{ deleted, failed }` pattern works because we can try all IDs and catch the error for the batch.

3. **Additional Telegram error codes**
   - What we know: The CONTEXT.md lists 4 specific errors. Additional errors exist (MESSAGE_NOT_MODIFIED, MESSAGE_ID_INVALID, PEER_ID_INVALID).
   - What's unclear: Complete list of errors each operation can throw.
   - Recommendation: Implement the known error translations and add a fallback that passes through unknown RPCError.errorMessage values directly (they are already descriptive snake_case strings).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/unit/message-edit.test.ts tests/unit/message-delete.test.ts tests/unit/message-pin.test.ts tests/unit/message-unpin.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WRITE-09 | Edit message sends correct gramjs params, returns serialized MessageItem | unit | `npx vitest run tests/unit/message-edit.test.ts -x` | Wave 0 |
| WRITE-09 | Edit handles stdin pipe (dash placeholder) | unit | `npx vitest run tests/unit/message-edit.test.ts -x` | Wave 0 |
| WRITE-09 | Edit translates MESSAGE_EDIT_TIME_EXPIRED, MESSAGE_AUTHOR_REQUIRED | unit | `npx vitest run tests/unit/message-edit.test.ts -x` | Wave 0 |
| WRITE-10 | Delete requires --revoke or --for-me (DELETE_MODE_REQUIRED) | unit | `npx vitest run tests/unit/message-delete.test.ts -x` | Wave 0 |
| WRITE-10 | Delete parses comma-separated IDs, enforces max 100 | unit | `npx vitest run tests/unit/message-delete.test.ts -x` | Wave 0 |
| WRITE-10 | Delete passes revoke flag correctly to gramjs | unit | `npx vitest run tests/unit/message-delete.test.ts -x` | Wave 0 |
| WRITE-10 | Delete returns split result { deleted, failed, mode } | unit | `npx vitest run tests/unit/message-delete.test.ts -x` | Wave 0 |
| WRITE-11 | Pin defaults to silent, --notify opts in | unit | `npx vitest run tests/unit/message-pin.test.ts -x` | Wave 0 |
| WRITE-11 | Pin returns confirmation { messageId, chatId, action, silent } | unit | `npx vitest run tests/unit/message-pin.test.ts -x` | Wave 0 |
| WRITE-12 | Unpin specific message by ID | unit | `npx vitest run tests/unit/message-unpin.test.ts -x` | Wave 0 |
| WRITE-12 | Unpin returns confirmation { messageId, chatId, action } | unit | `npx vitest run tests/unit/message-unpin.test.ts -x` | Wave 0 |
| ALL | Error translation maps RPCError.errorMessage to human messages | unit | `npx vitest run tests/unit/message-edit.test.ts tests/unit/message-delete.test.ts -x` | Wave 0 |
| ALL | Human-readable formatters produce expected output | unit | `npx vitest run tests/unit/format.test.ts -x` | Existing (extend) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/message-edit.test.ts tests/unit/message-delete.test.ts tests/unit/message-pin.test.ts tests/unit/message-unpin.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/message-edit.test.ts` -- covers WRITE-09 (edit action, stdin pipe, error translation)
- [ ] `tests/unit/message-delete.test.ts` -- covers WRITE-10 (delete with revoke/for-me, batch IDs, split result)
- [ ] `tests/unit/message-pin.test.ts` -- covers WRITE-11 (pin with silent default, notify opt-in)
- [ ] `tests/unit/message-unpin.test.ts` -- covers WRITE-12 (unpin by ID, synthesized confirmation)
- [ ] `tests/unit/format.test.ts` -- extend with formatDeleteResult, formatPinResult tests

## Sources

### Primary (HIGH confidence)
- gramjs TypeScript definitions: `node_modules/telegram/client/messages.d.ts` -- verified EditMessageParams, UpdatePinMessageParams, deleteMessages signature, pinMessage/unpinMessage signatures
- gramjs JavaScript implementation: `node_modules/telegram/client/messages.js` -- verified revoke default (`false`), channel routing (line 702-717), pin notify default (`false`, line 729), unpin return value (`undefined`, line 751-755)
- gramjs error classes: `node_modules/telegram/errors/RPCBaseErrors.d.ts` and `.js` -- verified RPCError structure (`.errorMessage`, `.code`, `.message` formatting)
- Existing codebase: `src/commands/message/send.ts`, `react.ts`, `get.ts`, `forward.ts` -- verified command patterns
- Existing codebase: `src/lib/errors.ts`, `src/lib/format.ts`, `src/lib/output.ts`, `src/lib/types.ts`, `src/lib/serialize.ts` -- verified infrastructure patterns

### Secondary (MEDIUM confidence)
- [gramjs official docs - editMessage](https://painor.gitbook.io/gramjs/working-with-messages/messages.editmessage) -- API parameter documentation
- [gramjs official docs - deleteMessages](https://painor.gitbook.io/gramjs/working-with-messages/messages.deletemessages) -- revoke behavior documentation
- [gramjs official docs - updatePinnedMessage](https://painor.gitbook.io/gramjs/working-with-messages/messages.updatepinnedmessage) -- pin/unpin API parameters
- [gramjs TelegramClient API reference](https://gram.js.org/beta/classes/TelegramClient.html) -- method signatures
- [gramjs EditMessageParams interface](https://gram.js.org/beta/interfaces/client.message.EditMessageParams.html) -- full interface definition
- [Telegram API error handling](https://core.telegram.org/api/errors) -- error code structure

### Tertiary (LOW confidence)
- [gramjs GitHub issue #442](https://github.com/gram-js/gramjs/issues/442) -- community discussion on delete/edit behavior (confirmed by source code inspection)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- all four commands follow established patterns verified from source code
- gramjs API methods: HIGH -- verified directly from node_modules TypeScript definitions and JavaScript implementation
- Error translation: MEDIUM -- core error codes documented by Telegram, but additional undocumented errors may surface
- Pitfalls: HIGH -- all pitfalls verified by reading gramjs source code

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (gramjs API is stable, patterns are internal to project)
