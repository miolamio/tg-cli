import type { Command } from 'commander';
import { Api } from 'telegram';
import { withAuth } from '../../lib/with-auth.js';
import { outputSuccess } from '../../lib/output.js';
import { resolveEntity } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Determine the entity type string from a resolved entity.
 */
function entityType(entity: Api.User | Api.Chat | Api.Channel): string {
  if (entity instanceof Api.Channel) {
    return (entity as any).megagroup ? 'supergroup' : 'channel';
  }
  if (entity instanceof Api.Chat) return 'group';
  return 'user';
}

/**
 * Get a display title from a resolved entity.
 */
function entityTitle(entity: Api.User | Api.Chat | Api.Channel): string {
  if (entity instanceof Api.User) {
    const first = (entity as any).firstName ?? '';
    const last = (entity as any).lastName ?? '';
    return last ? `${first} ${last}` : first;
  }
  return (entity as any).title ?? '';
}

/**
 * Action handler for `tg chat resolve <input>`.
 *
 * Resolves a peer by username, numeric ID, or phone number.
 * Outputs the entity's id, type, title, and username.
 */
export async function chatResolveAction(this: Command, input: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, input);

    outputSuccess({
      id: bigIntToString((entity as any).id),
      type: entityType(entity),
      title: entityTitle(entity),
      username: (entity as any).username ?? null,
    });
  });
}
