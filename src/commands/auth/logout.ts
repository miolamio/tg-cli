import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
import { ErrorCode } from '../../lib/error-codes.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Logout action handler for `tg auth logout`.
 *
 * Connects with the existing session, invokes auth.LogOut on the server,
 * then deletes the local session file and removes the profile from config.
 */
export async function logoutAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile, quiet } = opts;

  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));

  try {
    await store.withLock(profile, async (sessionString) => {
      if (!sessionString) {
        outputError('Not logged in', ErrorCode.NOT_LOGGED_IN);
        return;
      }

      const { apiId, apiHash } = await getCredentialsOrThrow(config);

      await withClient({ apiId, apiHash, sessionString }, async (client) => {
        logStatus('Logging out...', quiet);
        await client.invoke(new Api.auth.LogOut());
      });

      // Delete file without re-acquiring lock (we're already inside withLock)
      store.deleteUnlocked(profile);
      config.delete(`profiles.${profile}` as keyof Record<string, unknown>);

      logStatus('Logged out successfully.', quiet);
      outputSuccess({ loggedOut: true });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
