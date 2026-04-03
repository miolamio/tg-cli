import type { Command } from 'commander';
import { Api } from 'telegram';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import { withAuth } from '../../lib/with-auth.js';
import type { GlobalOptions, BlockResult } from '../../lib/types.js';

/**
 * Action handler for `tg user block <user>`.
 *
 * Blocks a single user. Validates that the resolved entity is a User
 * (not a Channel or Chat). Idempotent: blocking an already-blocked user
 * returns success silently.
 *
 * Returns BlockResult with userId, username, firstName, action: 'blocked'.
 */
export async function userBlockAction(this: Command, userInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, userInput);

    // Validate entity is a User (not Channel/Chat)
    if (!(entity instanceof Api.User)) {
      outputError('Not a user: this is a group/channel', 'NOT_A_USER');
      return;
    }

    const user = entity;

    try {
      await client.invoke(new Api.contacts.Block({ id: user }));
    } catch (err: unknown) {
      const { message, code } = translateTelegramError(err);
      outputError(message, code);
      return;
    }

    const result: BlockResult = {
      userId: bigIntToString(user.id),
      username: user.username ?? null,
      firstName: user.firstName ?? null,
      action: 'blocked',
    };

    outputSuccess(result);
  });
}
