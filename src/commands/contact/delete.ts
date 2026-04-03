import type { Command } from 'commander';
import { Api } from 'telegram';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import { withAuth } from '../../lib/with-auth.js';
import type { GlobalOptions, ContactDeleteResult } from '../../lib/types.js';

/**
 * Action handler for `tg contact delete <user>`.
 *
 * Deletes a single contact. Validates that the resolved entity is a User
 * (not a Channel or Chat). Idempotent: deleting a non-contact returns
 * success silently.
 *
 * Returns ContactDeleteResult with userId, username, firstName, action: 'deleted'.
 */
export async function contactDeleteAction(this: Command, userInput: string): Promise<void> {
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
      await client.invoke(
        new Api.contacts.DeleteContacts({ id: [user] }),
      );
    } catch (err: unknown) {
      const { message, code } = translateTelegramError(err);
      outputError(message, code);
      return;
    }

    const result: ContactDeleteResult = {
      userId: bigIntToString(user.id),
      username: user.username ?? null,
      firstName: user.firstName ?? null,
      action: 'deleted',
    };

    outputSuccess(result);
  });
}
