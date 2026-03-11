import type { Command } from 'commander';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
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

  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));

  try {
    const sessionString = await store.load(profile);

    if (!sessionString) {
      outputSuccess({ authorized: false, reason: 'No session found' });
      return;
    }

    const { apiId, apiHash } = getCredentialsOrThrow(config);

    await withClient({ apiId, apiHash, sessionString }, async (client) => {
      const authorized = await client.checkAuthorization();

      if (authorized) {
        const me = await client.getMe();
        outputSuccess({
          authorized: true,
          user: {
            id: (me as any)?.id,
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
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
