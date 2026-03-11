import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
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
        const entity = await resolveEntity(client, input);

        outputSuccess({
          id: bigIntToString((entity as any).id),
          type: entityType(entity),
          title: entityTitle(entity),
          username: (entity as any).username ?? null,
        });
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
