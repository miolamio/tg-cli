import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import type { GlobalOptions, BlockResult } from '../../lib/types.js';

/**
 * Action handler for `tg user unblock <user>`.
 *
 * Unblocks a single user. Validates that the resolved entity is a User
 * (not a Channel or Chat). Idempotent: unblocking an already-unblocked user
 * returns success silently.
 *
 * Returns BlockResult with userId, username, firstName, action: 'unblocked'.
 */
export async function userUnblockAction(this: Command, userInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile } = opts;

  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));

  try {
    await store.withLock(profile, async (sessionString) => {
      if (!sessionString) {
        outputError('Not logged in. Run: tg auth login', 'NOT_AUTHENTICATED');
        return;
      }

      const { apiId, apiHash } = getCredentialsOrThrow(config);

      await withClient({ apiId, apiHash, sessionString }, async (client) => {
        const entity = await resolveEntity(client, userInput);

        // Validate entity is a User (not Channel/Chat)
        if (!(entity instanceof Api.User)) {
          outputError('Not a user: this is a group/channel', 'NOT_A_USER');
          return;
        }

        const user = entity;

        await client.invoke(new Api.contacts.Unblock({ id: user }));

        const result: BlockResult = {
          userId: bigIntToString(user.id),
          username: user.username ?? null,
          firstName: user.firstName ?? null,
          action: 'unblocked',
        };

        outputSuccess(result);
      });
    });
  } catch (err: unknown) {
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
