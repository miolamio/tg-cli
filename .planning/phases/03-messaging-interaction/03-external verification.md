# Phase 3 External Verification

## Summary

Phase 3 is strong in its core implementation: send, forward, and react are present, the mode-aware output architecture is coherent, the build passes, and the full test suite passes. The main quality concerns are not about missing features, but about human-readable output fidelity and how strongly the verification artifacts describe what has actually been proven.

## Verification Snapshot

- `npm test`: 234/234 tests passing
- `npx tsc --noEmit`: passing
- Core write-command logic is implemented and tested
- The remaining concerns are mostly about UX/contract fidelity in human mode and verification completeness

## Findings

### 1. `tg message send --human` does not match the intended human-readable contract

**Status:** Open  
**Severity:** Important

### Problem

`messageSendAction()` returns a single top-level `MessageItem`, but `formatData()` only recognizes wrapper shapes such as `{ messages: [...] }`, `{ chats: [...] }`, `{ members: [...] }`, or `ChatInfo`. As a result, `send --human` falls back to `formatGeneric()` and prints pretty JSON instead of the expected conversational message line.

### Code snippets

```ts
const sentMsg = await client.sendMessage(entity, {
  message: text,
  replyTo,
});

const serialized = serializeMessage(sentMsg as any);
outputSuccess(serialized);
```

```ts
export function formatData(data: unknown): string {
  if (data == null || typeof data !== 'object') {
    return formatGeneric(data);
  }

  const obj = data as Record<string, any>;

  if (Array.isArray(obj.messages) && obj.messages.length > 0) {
    const first = obj.messages[0];
    if ('chatTitle' in first) {
      return formatSearchResults(obj.messages as SearchResultItem[]);
    }
    if ('text' in first && 'date' in first) {
      return formatMessages(obj.messages as MessageItem[]);
    }
  }

  return formatGeneric(data);
}
```

### Why this is a problem

- The phase plan explicitly called out single-message formatting as a special case to handle.
- The current runtime behavior in human mode is weaker than the intended UX.
- The verification report overstates human-mode completeness for message sending.

### Possible solution methods

- Add single-message detection to `formatData()`.
- Or wrap send output in a `{ messages: [serialized] }` shape before calling `outputSuccess()`.
- Add a test for `message send --human` through the actual CLI or output layer.

### 2. Empty-list results in human mode fall back to generic JSON formatting

**Status:** Open  
**Severity:** Important

### Problem

The individual formatters support empty arrays, but `formatData()` only dispatches to them when the arrays are non-empty. That means commands like `chat list --human`, `chat members --human`, `message history --human`, and `message search --human` may produce formatted output when results exist, but pretty JSON when the result set is empty.

### Code snippets

```ts
export function formatMessages(messages: MessageItem[]): string {
  if (messages.length === 0) return '';
  return messages.map(formatSingleMessage).join('\n');
}
```

```ts
if (Array.isArray(obj.messages) && obj.messages.length > 0) {
  const first = obj.messages[0];
  if ('chatTitle' in first) {
    return formatSearchResults(obj.messages as SearchResultItem[]);
  }
  if ('text' in first && 'date' in first) {
    return formatMessages(obj.messages as MessageItem[]);
  }
}

if (Array.isArray(obj.chats) && obj.chats.length > 0) {
  const first = obj.chats[0];
  if ('type' in first && 'title' in first) {
    return formatChatList(obj.chats as ChatListItem[]);
  }
}

if (Array.isArray(obj.members) && obj.members.length > 0) {
  const first = obj.members[0];
  if ('isBot' in first) {
    return formatMembers(obj.members as MemberItem[]);
  }
}
```

### Why this is a problem

- Human-mode output becomes inconsistent depending on whether the result set is empty.
- The fallback is readable, but not aligned with the “same formatter family” UX the phase aims for.
- This is easy to miss because non-empty result paths are what most tests and demos cover.

### Possible solution methods

- Make `formatData()` detect empty `messages`, `chats`, and `members` arrays as known shapes too.
- Return an intentional empty-state string for each formatter instead of falling back to generic JSON.
- Add tests for empty human-mode list outputs.

### 3. The verification artifacts overstate how well Phase 3 CLI behavior is proven

**Status:** Open  
**Severity:** Important

### Problem

`03-VERIFICATION.md` claims that the Phase 3 message command group is fully verified in help output and that human mode applies correctly to all commands, but the current integration suite does not fully prove those statements.

### Code snippets

```md
| `src/commands/message/index.ts`      | send, forward, react subcommands wired into message group | VERIFIED | All three actions imported and registered with Commander; `tg message --help` shows all 5 subcommands |
```

```ts
it('message --help shows history and search subcommands', () => {
  const output = execSync(`node ${BINARY} message --help`, {
    cwd: ROOT,
    encoding: 'utf-8',
  });

  expect(output).toContain('history');
  expect(output).toContain('search');
});
```

```md
| 7  | User can pass --human to any command and get human-readable output instead of JSON | VERIFIED | `tg.ts` preAction hook: `setOutputMode(opts.human === true || opts.json === false)`; `--human` appears in `tg --help` |
| 8  | User can pass --no-json to any command as an alias for --human                     | VERIFIED | `.option('--no-json', ...)` in `tg.ts`; `--no-json` appears in `tg --help` |
| 13 | Human-readable output applies to ALL commands: auth, session, chat, message       | VERIFIED | preAction hook in `tg.ts` fires before every command; no per-command changes needed; all 17 handlers route through `outputSuccess` which dispatches to `formatData` in human mode |
```

### Why this is a problem

- The integration tests still do not explicitly check `send`, `forward`, and `react` in CLI help.
- There is no CLI-level verification of `--human` or `--no-json` behavior on the built binary.
- This is exactly why the single-message human-output issue slipped through.

### Possible solution methods

- Extend integration tests to verify `tg message --help` includes `send`, `forward`, and `react`.
- Add at least one CLI-level test for `--human` and one for `--no-json`.
- Tone down verification language until those paths are directly exercised.

## Recommended Final Position

Phase 3 should be described as:

- **Strong in core logic:** send, forward, react, and mode-aware output architecture are all in place
- **Still needing polish:** human-readable output consistency, especially for single-message and empty-result cases
- **Still needing stronger proof:** CLI-level verification for human mode and full message subcommand help coverage
