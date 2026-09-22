import type { Command } from 'commander';
import { dirname } from 'node:path';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { readDesktopSession } from '../../lib/desktop-session.js';
import { assertNoDesktopDuplicate, assertUnusedDesktopProfile } from '../../lib/desktop-profiles.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { resolveTransport } from '../../lib/transport.js';
import { createPrompt } from '../../lib/prompt.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { TgError } from '../../lib/errors.js';
import { ErrorCode } from '../../lib/error-codes.js';
import { refuseDirectConnectIfDaemon } from '../../lib/daemon/guard.js';
import type { GlobalOptions, ProfileData } from '../../lib/types.js';

function verificationError(error: unknown): TgError {
  const rpc = (error as { errorMessage?: unknown } | undefined)?.errorMessage;
  if (rpc === 'AUTH_KEY_DUPLICATED') {
    return new TgError('Telegram invalidated this authorization after concurrent use. Close all copies; a new login is required.', ErrorCode.AUTH_KEY_DUPLICATED);
  }
  if (typeof rpc === 'string' && /^(AUTH_KEY_UNREGISTERED|AUTH_KEY_INVALID|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED(?:_BAN)?)$/.test(rpc)) {
    return new TgError('The Desktop authorization is no longer valid. Sign in through the official client again.', ErrorCode.INVALID_SESSION);
  }
  if (error instanceof TgError && error.code === ErrorCode.TIMEOUT) {
    return new TgError('Desktop session verification timed out. No profile was saved.', ErrorCode.TIMEOUT);
  }
  return new TgError('Desktop session verification failed. Check the connection and selected account; no profile was saved.', ErrorCode.VERIFY_FAILED);
}

/** Import an existing official Desktop authorization without requesting a login code. */
export async function importDesktopAction(this: Command, tdata: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & {
    desktopClosed?: boolean; account?: string; askPasscode?: boolean;
  };
  const { profile, quiet } = opts;
  try {
    if (this.getOptionValueSourceWithGlobals('profile') !== 'cli' || profile.toLowerCase() === 'default') {
      throw new TgError('Specify an unused, non-default --profile for Desktop import.', ErrorCode.INVALID_OPTIONS);
    }
    if (!opts.desktopClosed) {
      throw new TgError('Close Desktop and all clients/daemons using this authorization, then pass --desktop-closed.', ErrorCode.INVALID_OPTIONS);
    }
    if (process.env.TG_API_ID !== undefined || process.env.TG_API_HASH !== undefined) {
      throw new TgError('Desktop import uses the desktop preset. Run with env -u TG_API_ID -u TG_API_HASH.', ErrorCode.CREDENTIAL_ERROR);
    }
    if (opts.account !== undefined && !/^[0-5]$/.test(opts.account)) {
      throw new TgError('--account must be a stored Desktop index from 0 to 5.', ErrorCode.INVALID_OPTIONS);
    }
    if (opts.askPasscode && (!process.stdin.isTTY || !process.stderr.isTTY)) {
      throw new TgError('--ask-passcode requires an interactive terminal. Never pass the local passcode as an argument.', ErrorCode.NOT_INTERACTIVE);
    }
    if (await refuseDirectConnectIfDaemon(opts)) return;
    const config = createConfig(opts.config);
    assertUnusedDesktopProfile(config, profile);
    const store = new SessionStore(dirname(config.path));
    let passcode: string | undefined;
    if (opts.askPasscode) {
      const prompt = createPrompt();
      try { passcode = await prompt.askSecret('Telegram Desktop local passcode: '); }
      finally { prompt.close(); }
    }
    await store.withLock(profile, async (_previous, holdUntil) => {
      assertUnusedDesktopProfile(config, profile);
      const imported = await readDesktopSession(tdata, {
        account: opts.account === undefined ? undefined : Number(opts.account), passcode,
      });
      await assertNoDesktopDuplicate(config, store, imported.keyFingerprints);
      const creds = await getCredentialsOrThrow(config, 'desktop');
      if (!Number.isSafeInteger(creds.apiId) || creds.apiId <= 0 || creds.apiId > 2_147_483_647
        || typeof creds.apiHash !== 'string' || !/^[a-f0-9]{32}$/i.test(creds.apiHash)) {
        throw new TgError('The cached desktop preset is invalid. Refresh the client presets before importing.', ErrorCode.CREDENTIAL_ERROR);
      }
      const transport = resolveTransport(config, profile, opts.transport);
      const cleanups: Promise<unknown>[] = [];
      logStatus('Verifying the selected Desktop authorization...', quiet);
      try {
        await withClient({ ...creds, sessionString: imported.sessionString, transport }, async (client, signal) => {
          signal.throwIfAborted();
          const me = await client.getMe();
          signal.throwIfAborted();
          if (!me || me.id.toString() !== imported.userId) throw new Error('Identity mismatch');
        }, { holdUntil: cleanup => { holdUntil(cleanup); cleanups.push(cleanup); } });
        await Promise.all(cleanups);
      } catch (error) { throw verificationError(error); }

      // Reserve metadata before exposing a usable key. A crash can leave only an
      // empty reserved profile; it cannot leave a key using fallback credentials.
      assertUnusedDesktopProfile(config, profile);
      const metadata: ProfileData = { client: 'desktop', importedFrom: 'desktop', transport, created: new Date().toISOString() };
      const metadataMatches = () => {
        const value = config.get(`profiles.${profile}`) as ProfileData | undefined;
        return value !== undefined && value.client === metadata.client && value.importedFrom === metadata.importedFrom
          && value.transport === metadata.transport && value.created === metadata.created;
      };
      let sessionWriteAttempted = false;
      try {
        config.set(`profiles.${profile}`, metadata);
        if (!metadataMatches()) throw new Error();
        sessionWriteAttempted = true;
        store.saveUnlocked(profile, imported.sessionString);
        if (!metadataMatches()) throw new Error();
      } catch {
        let sessionRemoved = !sessionWriteAttempted;
        if (sessionWriteAttempted) {
          try { store.deleteUnlocked(profile); sessionRemoved = true; } catch { /* Retain metadata for a surviving key. */ }
        }
        if (sessionRemoved) {
          try { config.delete(`profiles.${profile}`); } catch { /* A reserved profile may require local cleanup. */ }
        }
        throw new TgError('Cannot persist the imported profile. Check storage permissions and remove any incomplete local profile before retrying; do not use auth logout.', ErrorCode.SESSION_ERROR);
      }
      outputSuccess({ imported: true, profile, verified: true });
    });
  } catch (error) {
    // Parser and our own errors are fixed text. Never echo paths, SDK errors,
    // passwords or contents from arbitrary dependency exceptions.
    if (error instanceof TgError && error.code !== ErrorCode.FETCH_FAILED) outputError(error.message, error.code);
    else outputError('Desktop import failed. Check source access, preset availability and the target profile lock.', ErrorCode.SESSION_ERROR);
  }
}
