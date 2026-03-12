# Phase 1 External Verification 01-01

## Summary

Another verification pass shows that the previous three major gaps were mostly addressed, but the latest fix set introduced one new critical issue and left one important correctness issue in the import flow.

## Verification Snapshot

- `npm test`: 66/66 tests passing
- `npx tsc --noEmit`: passing
- Several earlier concerns are now resolved:
  - config path and `--config`
  - non-interactive login guard
  - hidden 2FA prompt
  - timeout now covers hung `connect()`
  - session import now has a real verification path

## Remaining Issues

### 1. Nested session lock in `logout` can deadlock or fail

**Status:** Open  
**Severity:** Critical

### Problem

`logoutAction()` now acquires a profile-level lock via `store.withLock()`, but then calls `store.delete()` inside the locked callback. `delete()` tries to acquire the same file lock again.

### Code snippets

```ts
await store.withLock(profile, async (sessionString) => {
  if (!sessionString) {
    outputError('Not logged in', 'NOT_LOGGED_IN');
    return;
  }

  const { apiId, apiHash } = getCredentialsOrThrow(config);

  await withClient({ apiId, apiHash, sessionString }, async (client) => {
    logStatus('Logging out...', quiet);
    await client.invoke(new Api.auth.LogOut());
  });

  await store.delete(profile);
  config.delete(`profiles.${profile}` as any);
  outputSuccess({ loggedOut: true });
});
```

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

### Why this is a problem

- `proper-lockfile` locks are not re-entrant.
- On a real session file, logout can hang or fail after retry exhaustion.
- Current tests do not catch this because they mock `withLock()` and `delete()` separately.

### Possible solution methods

- Do not call `delete()` from inside `withLock()`.
- Add a non-locking internal delete helper for use while the lock is already held.
- Move file deletion outside the callback if the lock design is changed.
- Add a real test for the nested-lock logout path.

### 2. `session import` can claim `verified: true` when no verification happened

**Status:** Open  
**Severity:** Important

### Problem

When `--skip-verify` is not used but API credentials are missing, the command warns and saves the session without Telegram verification. However, the success payload still reports `verified: true`.

### Code snippet

```ts
if (!skipVerify) {
  const creds = resolveCredentials(config);
  if (!creds) {
    logStatus(
      'Warning: Cannot verify session — API credentials not configured. Saving without verification.',
      quiet,
    );
  } else {
    // verification path
  }
}

await store.save(profile, session);
outputSuccess({ imported: true, profile, verified: !skipVerify });
```

### Why this is a problem

- The output can falsely tell automation that the session was verified.
- In the no-credentials path, the import still becomes storage-only success.
- That weakens the intended AUTH-05 fix.

### Possible solution methods

- Track verification outcome with a real boolean such as `wasVerified`.
- Return `verified: false` when credentials are missing and verification is skipped implicitly.
- Optionally add a separate field like `verificationSkipped: true`.
- Add a test that asserts the no-credentials path does not report `verified: true`.

### 3. CLI wiring for `--skip-verify` is implemented but not proven end-to-end

**Status:** Low confidence / test gap  
**Severity:** Low

### Problem

The option exists in the command definition, but current tests mostly inject `skipVerify` directly into mocked command contexts rather than proving real Commander parsing end-to-end.

### Code snippet

```ts
session
  .command('import')
  .argument('[session]', 'Session string to import')
  .option('--skip-verify', 'Skip session validation via Telegram API')
  .description('Import a session string')
  .action(importAction);
```

### Why this matters

- The implementation itself looks correct.
- There is no strong evidence yet that real CLI parsing passes this flag all the way through in production.
- This is not a confirmed bug, but it is still an unverified seam.

### Possible solution methods

- Add an integration test for `tg session import --skip-verify ...`.
- Assert that the parsed action context receives `skipVerify: true`.

## Recommended Next Fix Iteration

1. Fix the nested-lock `logout` path first.
2. Fix false `verified: true` reporting in the no-credentials import path.
3. Add one CLI-level integration test for `--skip-verify`.

## Current Position

Phase 1 is very close, but not clean enough to call fully complete yet.
