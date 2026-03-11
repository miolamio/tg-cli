# Phase 3: Messaging & Interaction - Research

**Researched:** 2026-03-11
**Domain:** gramjs messaging APIs (send, forward, react) + human-readable output formatting
**Confidence:** HIGH

## Summary

Phase 3 adds write capabilities (send, forward, react) and a human-readable output mode to an existing CLI that already has auth, chat discovery, and message reading. The gramjs library provides high-level client methods for all three write operations: `client.sendMessage()`, `client.forwardMessages()`, and `client.invoke(new Api.messages.SendReaction())`. The send and forward APIs are well-documented first-class methods on TelegramClient, while reactions require a lower-level `invoke()` call with specific `Api.ReactionEmoji` wrapper objects.

gramjs has a built-in Markdown parser (`MarkdownParser`) set as the default parse mode. When `client.sendMessage()` is called with a `message` string, gramjs automatically parses `**bold**`, `__italic__`, `` `code` ``, `[text](url)` into Telegram entities. This means the project does NOT need to build its own markdown-to-entities converter -- gramjs handles it natively.

The human-readable output mode (`--human`/`--no-json`) is a cross-cutting concern that affects every existing command plus all new Phase 3 commands. The architecture decision (from CONTEXT.md) is to treat it as an "opt-in overlay" -- data always goes through JSON serialization first, then a formatter converts it for display. picocolors (already a dependency) provides terminal colors that auto-disable when piped.

**Primary recommendation:** Implement write commands first (send/forward/react follow established patterns), then add the human-readable formatter as a separate cross-cutting layer that wraps `outputSuccess()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Send command: `tg message send <chat> <text>` with positional arguments
- Stdin piping via dash placeholder: `echo "msg" | tg message send @user -`
- Response returns full serialized MessageItem via `serializeMessage()`
- Markdown formatting in text parsed into Telegram entities before sending
- Multiline via shell quoting or stdin pipe
- Reply is a flag on send: `--reply-to <msgId>` (no separate reply command)
- Forward is separate command: `tg message forward <from-chat> <msg-ids> <to-chat>`
- Comma-separated message IDs for batch forward
- Forward response: `{ forwarded: N, messages: MessageItem[] }`
- Leverages Telegram native batch forwarding API
- Reaction: `tg message react <chat> <msgId> <emoji>`
- Remove reactions: `--remove` flag
- No client-side emoji validation (let Telegram API reject)
- Reaction response: `{ messageId, chatId, emoji, action: 'added'|'removed' }`
- JSON remains default output mode always
- `--human` or `--no-json` flag for human-readable format
- No TTY auto-detection -- explicit flag only
- Conversational format for messages: `[2026-03-11 12:30] Alice: Hello world`
- Table/column format for lists
- Colors via picocolors with auto-disable when piped
- Human-readable applies retroactively to ALL existing commands (Phase 1 & 2)

### Claude's Discretion
- Markdown-to-entities parsing implementation (gramjs may have built-in support)
- Human-readable format details for each command type (exact column widths, truncation)
- Error message formatting in human mode
- How to handle send failures (network, permissions, etc.)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WRITE-01 | User can send a text message to any chat | gramjs `client.sendMessage(entity, { message })` with built-in markdown parsing; `resolveEntity()` for peer resolution already exists |
| WRITE-02 | User can reply to a specific message by ID | gramjs `client.sendMessage(entity, { message, replyTo: msgId })` -- replyTo is a native parameter |
| WRITE-03 | User can forward messages between chats | gramjs `client.forwardMessages(toEntity, { messages: ids, fromPeer: fromEntity })` returns `Api.Message[]` |
| WRITE-05 | User can react to a message with an emoji | gramjs `client.invoke(new Api.messages.SendReaction({ peer, msgId, reaction: [new Api.ReactionEmoji({ emoticon })] }))` |
| OUT-03 | JSON default; human-readable via `--human`/`--no-json` | Wrap `outputSuccess()` with format check; picocolors for styling; Commander negatable option for `--no-json` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| telegram (gramjs) | ^2.26.22 | sendMessage, forwardMessages, SendReaction API | Already the project's MTProto client |
| commander | ^14.0.3 | CLI command definitions, argument parsing, negatable options | Already the project's CLI framework |
| picocolors | ^1.1.1 | Terminal colors for human-readable output | Already a dependency; auto-disables colors when piped |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | - | - | All dependencies already in package.json |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| picocolors | chalk | chalk is heavier (10x larger), picocolors already installed |
| Manual markdown parsing | gramjs built-in MarkdownParser | gramjs default parse mode is MarkdownParser -- no custom code needed |
| Custom table formatting | cli-table3 | Extra dependency; simple padding with string methods is sufficient for this scope |

**Installation:**
```bash
# No new packages needed -- all dependencies already in package.json
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  commands/
    message/
      index.ts           # MODIFY: add send, forward, react subcommands
      history.ts          # EXISTS: unchanged
      search.ts           # EXISTS: unchanged
      send.ts             # NEW: send + reply action handler
      forward.ts          # NEW: forward action handler
      react.ts            # NEW: react action handler
  lib/
    output.ts             # MODIFY: add human-readable output wrapper
    format.ts             # NEW: human-readable formatters per data type
    types.ts              # MODIFY: add SendOptions, ForwardOptions, ReactOptions
    serialize.ts          # EXISTS: serializeMessage() reused for send/forward responses
    peer.ts               # EXISTS: resolveEntity() reused
    client.ts             # EXISTS: withClient() reused
    entity-to-markdown.ts # EXISTS: unchanged (read-path only)
```

### Pattern 1: Send Message with gramjs Built-in Markdown
**What:** gramjs `sendMessage()` automatically parses markdown when the default parse mode is active
**When to use:** For WRITE-01 (send) and WRITE-02 (reply)
**Example:**
```typescript
// Source: gramjs client/messages.d.ts + client/telegramBaseClient.js line 133
// Default parseMode is MarkdownParser -- no explicit setting needed

const sentMsg = await client.sendMessage(entity, {
  message: text,       // "Hello **world**" -> auto-parsed to bold entity
  replyTo: replyToId,  // undefined for normal send, number for reply
});

// sentMsg is Api.Message -- pass to existing serializeMessage()
return serializeMessage(sentMsg);
```

### Pattern 2: Forward Messages with Batch API
**What:** gramjs `forwardMessages()` accepts arrays of message IDs natively
**When to use:** For WRITE-03 (forward)
**Example:**
```typescript
// Source: gramjs client/messages.d.ts ForwardMessagesParams
const forwarded = await client.forwardMessages(toEntity, {
  messages: messageIds,   // number[] -- parsed from comma-separated CLI input
  fromPeer: fromEntity,   // Required when using integer IDs (not Message objects)
});

// forwarded is Api.Message[] -- map through serializeMessage()
return {
  forwarded: forwarded.length,
  messages: forwarded.map((msg) => serializeMessage(msg)),
};
```

### Pattern 3: Reactions via Low-Level invoke()
**What:** gramjs has no high-level reaction method; must use `client.invoke()` with `Api.messages.SendReaction`
**When to use:** For WRITE-05 (react)
**Example:**
```typescript
// Source: gramjs tl/api.d.ts Api.messages.SendReaction + GitHub issue #538
// CRITICAL: reaction must be Api.ReactionEmoji[], NOT plain string

// Add reaction
await client.invoke(
  new Api.messages.SendReaction({
    peer: entity,
    msgId: messageId,
    reaction: [new Api.ReactionEmoji({ emoticon: emoji })],
  })
);

// Remove reaction (pass empty array)
await client.invoke(
  new Api.messages.SendReaction({
    peer: entity,
    msgId: messageId,
    reaction: [],  // empty array removes all reactions
  })
);
```

### Pattern 4: Stdin Reading for Dash Placeholder
**What:** When text argument is `-`, read all of stdin as the message body
**When to use:** For piped input support on send command
**Example:**
```typescript
// Read all stdin into a string
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8').trimEnd();
}

// In send action handler:
const text = textArg === '-' ? await readStdin() : textArg;
```

### Pattern 5: Human-Readable Output Wrapper
**What:** Intercept `outputSuccess()` data based on `--human` flag, format for terminal
**When to use:** For OUT-03 across all commands
**Example:**
```typescript
// src/lib/format.ts
import pc from 'picocolors';

export function formatMessages(messages: MessageItem[]): string {
  return messages
    .map((m) => {
      const ts = pc.dim(new Date(m.date).toLocaleString());
      const sender = pc.bold(m.senderName ?? 'Unknown');
      return `${ts} ${sender}: ${m.text}`;
    })
    .join('\n');
}

// Modify outputSuccess or create wrapper:
export function output<T>(data: T, human: boolean, formatter?: (d: T) => string): void {
  if (human && formatter) {
    process.stdout.write(formatter(data) + '\n');
  } else {
    outputSuccess(data);
  }
}
```

### Pattern 6: Commander Negatable Option for --no-json
**What:** Commander supports `--no-<option>` to negate a boolean. Since `--json` defaults to `true`, adding `--no-json` sets `json: false`.
**When to use:** For OUT-03 to support both `--human` and `--no-json` flags
**Example:**
```typescript
// Source: Commander.js documentation on negatable options
// Current: .option('--json', 'JSON output (default)', true)
// Add:     .option('--no-json', 'Alias for --human')

// In tg.ts, define both:
program
  .option('--json', 'JSON output (default)', true)
  .option('--no-json', 'Human-readable output (alias for --human)')
  .option('--human', 'Human-readable output')

// In action handlers, check either flag:
const isHuman = opts.human || !opts.json;
```

### Anti-Patterns to Avoid
- **Manually parsing markdown to entities:** gramjs default parse mode is `MarkdownParser` -- it handles `**bold**`, `__italic__`, `` `code` `` automatically. Do NOT build `markdownToEntities()`.
- **Passing plain emoji strings to SendReaction:** The `reaction` parameter MUST be `Api.ReactionEmoji[]`, NOT a string. This is a known gotcha (gramjs issue #538).
- **Building separate code paths for human vs JSON:** Data should always be serialized to the same structures first, then formatted. Human mode is a display layer, not a data layer.
- **TTY detection for output mode:** CONTEXT.md explicitly locks "no TTY auto-detection" -- use explicit `--human` flag only.
- **Stdin reading via `readline` interface:** For reading all piped input at once, use async iteration on `process.stdin` directly. `readline` is for interactive line-by-line input.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown to Telegram entities | Custom parser for `**bold**`, `_italic_`, etc. | gramjs built-in `MarkdownParser` (default parse mode) | gramjs automatically converts markdown in `sendMessage()` -- handles edge cases like nested entities, URLs, mentions |
| Batch message forwarding | Loop sending one at a time | gramjs `forwardMessages()` with array of IDs | Uses Telegram's native batch forward API -- single request for multiple messages |
| Terminal color detection | `process.stdout.isTTY` checks | picocolors `isColorSupported` | picocolors auto-detects and disables colors when piped; handles CI, FORCE_COLOR, NO_COLOR env vars |
| Emoji validation | Regex or emoji database | Let Telegram API reject | Telegram validates server-side; emoji sets change frequently; no need to maintain client-side lists |

**Key insight:** gramjs handles the heavy lifting for message operations. The CLI layer should be thin -- resolve entities, call gramjs, serialize response. Avoid wrapping gramjs in unnecessary abstraction layers.

## Common Pitfalls

### Pitfall 1: ReactionEmoji Wrapper Required
**What goes wrong:** Passing a plain emoji string to `Api.messages.SendReaction` causes a `missing getBytes function` error
**Why it happens:** The `reaction` field expects `Api.TypeReaction[]`, which are class instances with serialization methods, not plain strings
**How to avoid:** Always wrap: `reaction: [new Api.ReactionEmoji({ emoticon: '👍' })]`
**Warning signs:** Type error mentioning `getBytes` or `undefined is not a function`

### Pitfall 2: Forward Requires fromPeer When Using IDs
**What goes wrong:** `forwardMessages()` fails silently or throws when `fromPeer` is not provided
**Why it happens:** When passing integer message IDs (not Message objects), gramjs cannot determine the source chat
**How to avoid:** Always pass `fromPeer` when using integer IDs: `{ messages: [123, 456], fromPeer: sourceEntity }`
**Warning signs:** Messages not appearing in destination, or `PEER_ID_INVALID` error

### Pitfall 3: sendMessage Returns Different Types
**What goes wrong:** Code assumes `sendMessage()` always returns `Api.Message` but gets `UpdateShortSentMessage`
**Why it happens:** gramjs internally handles `UpdateShortSentMessage` and constructs an `Api.Message` from it, but edge cases may exist
**How to avoid:** Use `serializeMessage()` which handles the standard `Api.Message` interface; test with different chat types (user, group, channel)
**Warning signs:** Missing fields in the returned message object

### Pitfall 4: Comma-Separated IDs Need Validation
**What goes wrong:** Non-numeric values in comma-separated message IDs cause NaN or silent failures
**Why it happens:** CLI input is always string; `"123,abc,456".split(',').map(Number)` produces `[123, NaN, 456]`
**How to avoid:** Parse and validate each ID: filter NaN, throw descriptive error for invalid IDs
**Warning signs:** `NaN` in forwarded message responses, or Telegram API errors about invalid message IDs

### Pitfall 5: Human Output for Existing Commands Requires Touching All Actions
**What goes wrong:** Human output only works for new commands; existing commands still output JSON even with `--human`
**Why it happens:** Each action handler directly calls `outputSuccess()` -- changing behavior requires modifying each one
**How to avoid:** Create a wrapper function that checks the `--human` flag and routes to the appropriate formatter. Modify `outputSuccess` or replace all call sites with a new function that accepts a formatter.
**Warning signs:** Inconsistent behavior between old and new commands with `--human` flag

### Pitfall 6: Stdin Blocks When No Pipe
**What goes wrong:** `tg message send @user -` hangs indefinitely when run without piped input
**Why it happens:** `process.stdin` waits for input when connected to a TTY
**How to avoid:** Check `process.stdin.isTTY` -- if true and text is `-`, throw an error explaining that `-` requires piped input. Only read stdin when it's actually piped.
**Warning signs:** CLI appears to hang; user must Ctrl+C to exit

## Code Examples

### Complete Send Action Handler
```typescript
// Source: follows established pattern from src/commands/message/history.ts
import type { Command } from 'commander';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import type { GlobalOptions } from '../../lib/types.js';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8').trimEnd();
}

export async function messageSendAction(this: Command, chat: string, text: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { replyTo?: string };
  const { profile } = opts;

  // Handle stdin pipe
  if (text === '-') {
    if (process.stdin.isTTY) {
      outputError('"-" requires piped input. Example: echo "msg" | tg message send @user -', 'STDIN_REQUIRED');
      return;
    }
    text = await readStdin();
  }

  if (!text) {
    outputError('Message text is required', 'EMPTY_MESSAGE');
    return;
  }

  const replyTo = opts.replyTo ? parseInt(opts.replyTo, 10) : undefined;

  // ... standard config/store/withClient pattern from history.ts
  // Call: client.sendMessage(entity, { message: text, replyTo })
  // Serialize: serializeMessage(sentMsg)
}
```

### Reaction with Proper Type Wrapping
```typescript
// Source: gramjs API types + GitHub issue #538 fix
import { Api } from 'telegram';

// Add reaction
const result = await client.invoke(
  new Api.messages.SendReaction({
    peer: entity,
    msgId: messageId,
    reaction: [new Api.ReactionEmoji({ emoticon: emoji })],
  })
);

// Remove reaction
const result = await client.invoke(
  new Api.messages.SendReaction({
    peer: entity,
    msgId: messageId,
    reaction: [],
  })
);
```

### Human-Readable Formatter Architecture
```typescript
// src/lib/format.ts
import pc from 'picocolors';
import type { MessageItem, ChatListItem } from './types.js';

export function formatMessagesHuman(messages: MessageItem[]): string {
  return messages
    .map((m) => {
      const date = new Date(m.date);
      const ts = pc.dim(
        `[${date.toISOString().slice(0, 10)} ${date.toTimeString().slice(0, 5)}]`
      );
      const sender = pc.bold(m.senderName ?? 'Unknown');
      const reply = m.replyToMsgId ? pc.dim(` (reply to ${m.replyToMsgId})`) : '';
      const media = m.mediaType ? pc.yellow(` [${m.mediaType}]`) : '';
      return `${ts} ${sender}${reply}: ${m.text}${media}`;
    })
    .join('\n');
}

export function formatChatListHuman(chats: ChatListItem[]): string {
  // Simple aligned columns
  const rows = chats.map((c) => {
    const type = pc.dim(`[${c.type}]`);
    const name = pc.bold(c.title);
    const unread = c.unreadCount > 0 ? pc.yellow(` (${c.unreadCount} unread)`) : '';
    const user = c.username ? pc.dim(` @${c.username}`) : '';
    return `  ${type.padEnd(20)} ${name}${user}${unread}`;
  });
  return rows.join('\n');
}

// ... similar formatters for ChatInfo, MemberItem, SearchResultItem, etc.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `reaction: '👍'` (plain string) | `reaction: [new Api.ReactionEmoji({ emoticon: '👍' })]` | gramjs layer 129+ | Breaking: plain strings cause runtime errors |
| Custom markdown parser | gramjs built-in `MarkdownParser` (default) | Always been default | No custom code needed for markdown-to-entities |
| `client.disconnect()` | `client.destroy()` | Project decision from Phase 1 | Prevents zombie _updateLoop processes |

**Deprecated/outdated:**
- Plain string reaction parameter: Must use `Api.ReactionEmoji` wrapper objects
- Custom markdown parsing: gramjs handles this natively via default parse mode

## Open Questions

1. **Reaction removal semantics**
   - What we know: Passing `reaction: []` (empty array) to SendReaction removes reactions
   - What's unclear: Whether this removes all reactions or just the user's reaction; whether `--remove` should remove a specific emoji or all
   - Recommendation: Pass empty array to remove all user reactions. If the user passes `--remove` with a specific emoji, still send empty array (Telegram API behavior is to toggle). Test empirically during implementation.

2. **gramjs sendMessage markdown edge cases**
   - What we know: MarkdownParser handles `**bold**`, `__italic__`, `` `code` ``, `[text](url)`
   - What's unclear: Whether it handles `~~strikethrough~~`, `||spoilers||`, nested entities properly
   - Recommendation: Use gramjs default behavior. If users report formatting issues, consider switching to `MarkdownV2Parser` or `html` parse mode in a later phase. Do not build custom parser.

3. **Human output for error envelopes**
   - What we know: `outputError()` writes `{ ok: false, error, code }` to stdout
   - What's unclear: How errors should look in human mode -- plain text? colored?
   - Recommendation: In human mode, write error as `pc.red('Error: ') + message` to stderr (not stdout). This aligns with the existing stderr-for-status convention.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WRITE-01 | Send text message to any chat | unit | `npx vitest run tests/unit/message-send.test.ts -x` | Wave 0 |
| WRITE-02 | Reply to message by ID | unit | `npx vitest run tests/unit/message-send.test.ts -x` | Wave 0 |
| WRITE-03 | Forward messages between chats | unit | `npx vitest run tests/unit/message-forward.test.ts -x` | Wave 0 |
| WRITE-05 | React to message with emoji | unit | `npx vitest run tests/unit/message-react.test.ts -x` | Wave 0 |
| OUT-03 | Human-readable output mode | unit | `npx vitest run tests/unit/format.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/message-send.test.ts tests/unit/message-forward.test.ts tests/unit/message-react.test.ts tests/unit/format.test.ts -x`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/message-send.test.ts` -- covers WRITE-01, WRITE-02 (send + reply)
- [ ] `tests/unit/message-forward.test.ts` -- covers WRITE-03 (forward)
- [ ] `tests/unit/message-react.test.ts` -- covers WRITE-05 (react)
- [ ] `tests/unit/format.test.ts` -- covers OUT-03 (human-readable formatters)

Existing test infrastructure (vitest config, mock patterns for gramjs client, session store, config, peer resolution) fully covers the testing needs. No new test framework or fixture setup required.

## Sources

### Primary (HIGH confidence)
- gramjs `client/messages.d.ts` -- SendMessageParams, ForwardMessagesParams interfaces (local file, verified)
- gramjs `tl/api.d.ts` -- Api.messages.SendReaction, Api.ReactionEmoji class definitions (local file, verified)
- gramjs `client/telegramBaseClient.js` line 133 -- default parseMode is MarkdownParser (local file, verified)
- gramjs `extensions/markdown.d.ts` -- MarkdownParser.parse() and .unparse() methods (local file, verified)
- gramjs `client/messageParse.d.ts` -- _parseMessageText used internally by sendMessage (local file, verified)
- Existing codebase patterns: `src/commands/message/history.ts`, `src/lib/output.ts`, `src/lib/serialize.ts`, `src/lib/peer.ts` (local files)
- picocolors `types.d.ts` -- available formatters: bold, dim, red, yellow, green, cyan, etc. (local file)

### Secondary (MEDIUM confidence)
- [gramjs SendReaction documentation](https://gram.js.org/tl/messages/SendReaction) -- API parameters
- [gramjs issue #538](https://github.com/gram-js/gramjs/issues/538) -- ReactionEmoji wrapper requirement confirmed
- [Commander.js negatable options](https://github.com/tj/commander.js/blob/HEAD/examples/options-negatable.js) -- --no-* flag syntax

### Tertiary (LOW confidence)
- None -- all findings verified against local source files

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, APIs verified in local type definitions
- Architecture: HIGH -- follows established project patterns from Phase 1 & 2, all integration points verified
- Pitfalls: HIGH -- ReactionEmoji issue confirmed via both gramjs types and GitHub issue; other pitfalls derived from gramjs source inspection

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable -- gramjs API unlikely to change)
