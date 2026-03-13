# Phase 1 External Verification

## Summary

External review found that Phase 1 is mostly solid from a build, test, and core infrastructure perspective, but not every originally reported issue is fully closed. Some concerns were fixed cleanly, some were only partially addressed, and one important requirement remains open.

## Verification Snapshot

- `npm test`: 57/57 tests passing
- `npx tsc --noEmit`: passing
- Build and CLI smoke checks were previously passing
- The verification report should still be revised to reflect the current true status of remaining gaps

## Fixes Confirmed

### 1. `INFRA-06` config path mismatch and ignored `--config`

**Status:** Resolved

**What changed**

The default config location now uses `telegram-cli`, and custom config paths passed via `--config` are now honored.

```ts
export function createConfig(configPath?: string): Conf<TgConfig> {
  if (configPath) {
    return new Conf<TgConfig>({
      projectName: 'telegram-cli',
      configName: basename(configPath, extname(configPath)),
      cwd: dirname(configPath),
      defaults: {
        profiles: {},
      },
    });
  }
  return new Conf<TgConfig>({
    projectName: 'telegram-cli',
    configName: 'config',
    defaults: {
      profiles: {},
    },
  });
}
```

**Why this now looks correct**

- Matches the documented `~/.config/telegram-cli/config.json` path
- Makes `--config <path>` behavior real instead of implied
- Covered by new config-path tests

### 2. Non-interactive login handling

**Status:** Resolved

**What changed**

`tg auth login` now fails fast when `stdin` is not a TTY.

```ts
if (!process.stdin.isTTY) {
  outputError(
    'Interactive login requires a terminal (TTY). Use `tg session import` for non-interactive auth.',
    'NOT_INTERACTIVE',
  );
  return;
}
```

**Why this now looks correct**

- Prevents hang-prone behavior in CI, piped execution, and agent automation
- Returns a structured error instead of silently attempting interactive auth
- Covered by unit tests

### 3. 2FA password echoing in plain text

**Status:** Resolved in code

**What changed**

The prompt layer now supports secret input, and login uses that path for Telegram 2FA.

```ts
return {
  ask: (question: string): Promise<string> => rl.question(question),
  askSecret: async (question: string): Promise<string> => {
    process.stderr.write(question);
    muted = true;
    try {
      const answer = await rl.question('');
      return answer;
    } finally {
      muted = false;
      process.stderr.write('\n');
    }
  },
  close: (): void => rl.close(),
};
```

```ts
password: async (hint?: string) => {
  const msg = hint
    ? `2FA password (hint: ${hint}): `
    : '2FA password: ';
  return prompt.askSecret(msg);
},
```

**Why this now looks correct**

- Removes obvious plaintext echo behavior from the old prompt implementation
- Uses a dedicated secret-input path for 2FA
- Unit tests prove `askSecret()` is used, though terminal-level echo suppression is still mostly validated by implementation review rather than deep integration testing

### 4. `process.exit(1)` inside `withClient()`

**Status:** Partially resolved, but the original issue is improved

**What changed**

The library no longer calls `process.exit(1)` on timeout and now rejects with a structured `TgError`.

```ts
const timeoutPromise = new Promise<never>((_, reject) => {
  timeoutId = setTimeout(() => {
    client.destroy().catch(() => {});
    reject(new TgError('Client operation timed out after 30 seconds', 'TIMEOUT'));
  }, 30_000);
});
```

**Why this is better**

- Preserves the structured error path instead of killing the process directly
- Supports proper JSON error handling in command handlers
- Covered by tests that verify `process.exit` is no longer called

## Remaining Open Issues

### 1. `AUTH-05` is still not verified end-to-end

**Status:** Open

**Problem**

`tg session import` still accepts any non-empty string, stores it, and reports success without proving that the imported session actually restores authorization.

```ts
const config = createConfig(opts.config);
const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));

await store.save(profile, session);

config.set(`profiles.${profile}`, {
  session,
  created: new Date().toISOString(),
});

logStatus('Session imported successfully!', quiet);
logStatus('Run `tg auth status` to verify the session is valid.', quiet);
outputSuccess({ imported: true, profile });
```

**Why this is still a problem**

- This is still storage-only success, not verified auth restoration
- Invalid, expired, or unrelated session strings can still be accepted
- The added follow-up message is more honest, but it does not close the requirement if the requirement is interpreted as "import restores auth"

**Possible solution methods**

- Validate the session during import via `connect()` and `checkAuthorization()`
- Reject invalid imported sessions
- Add integration coverage for `export -> import -> auth status`
- Add a negative-path test for invalid imported session strings

### 2. `INFRA-03` is only partially fixed

**Status:** Partially resolved

**Problem**

`delete()` is now locked, which fixes the narrow delete race, but the broader concurrency claim still remains stronger than the actual implementation.

```ts
async delete(profile: string): Promise<void> {
  const file = this.filePath(profile);
  if (!existsSync(file)) return;

  const release = await lock(file, { retries: { retries: 3, minTimeout: 100 } });
  try {
    unlinkSync(file);
  } finally {
    await release();
  }
}
```

**Related usage pattern**

```ts
const sessionString = await store.load(profile);
await withClient({ apiId, apiHash, sessionString }, async (client) => {
  const authorized = await client.checkAuthorization();
});
```

**Why this is still a problem**

- The file lock is released before the live Telegram client starts using the session
- Two processes can still load the same session and use it concurrently
- That means protection against real concurrent auth-key use is not actually demonstrated

**Possible solution methods**

- Hold a profile-level lock for the full connected-client lifecycle
- Wrap `withClient()` usage in a higher-level session lease
- Add real concurrency tests for parallel authenticated command execution

### 3. `withClient()` timeout does not cover hung `connect()`

**Status:** Partially resolved

**Problem**

The timeout no longer kills the process, but it still does not bound a stuck `client.connect()` call.

```ts
try {
  await client.connect();
  return await Promise.race([fn(client), timeoutPromise]);
} finally {
  clearTimeout(timeoutId!);
  await client.destroy().catch(() => {});
}
```

**Why this is still a problem**

- The timeout only races against `fn(client)`
- If `client.connect()` hangs, the timeout promise does not protect that path in a meaningful way
- The current test covers a hung callback, not a hung connect

**Possible solution methods**

- Include `client.connect()` in the timed race
- Split connect timeout and operation timeout into separate explicit guards
- Add a test for a hanging `connect()` implementation

## Verification Report Corrections Still Needed

The Phase 1 verification report should be updated to reflect the current reality.

These items should not all remain marked as fully satisfied without qualification:

- `AUTH-05`: still open if end-to-end auth restoration is required
- `INFRA-03`: partially resolved, but not proven for live concurrent use
- Timeout/lifecycle handling: improved significantly, but still not complete for hung `connect()`

## Recommended Final Position

Phase 1 should be described as:

- **Resolved:** config path contract, `--config`, non-TTY login guard, secret prompt path
- **Improved but not fully closed:** timeout handling, session locking guarantees
- **Still open:** end-to-end validation of imported sessions
