import type { Command } from 'commander';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
import { ErrorCode } from '../../lib/error-codes.js';
import { bigIntToString } from '../../lib/serialize.js';
import { refuseDirectConnectIfDaemon } from '../../lib/daemon/guard.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Status action handler for `tg auth status`.
 *
 * Checks whether the current session is authorized.
 * If no session file exists, outputs { authorized: false } without connecting.
 * If session exists, connects and checks authorization state.
 */
export async function statusAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile, quiet } = opts;
  if (await refuseDirectConnectIfDaemon(opts)) return;

  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));

  try {
    await store.withLock(profile, async (sessionString, holdUntil) => {
      if (!sessionString) {
        outputSuccess({ authorized: false, reason: 'No session found' });
        return;
      }

      const { apiId, apiHash } = await getCredentialsOrThrow(config, undefined, profile);

      await withClient({ apiId, apiHash, sessionString }, async (client, signal) => {
        const authorized = await client.checkAuthorization();
        signal.throwIfAborted();

        if (authorized) {
          const me = await client.getMe();
          signal.throwIfAborted();
          outputSuccess({
            authorized: true,
            user: {
              id: bigIntToString((me as any)?.id),
              phone: (me as any)?.phone,
              username: (me as any)?.username,
              firstName: (me as any)?.firstName,
            },
          });
        } else {
          outputSuccess({
            authorized: false,
            reason: 'Session expired or invalid',
          });
        }
      }, { holdUntil });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code ?? ErrorCode.UNKNOWN_ERROR);
  }
}
