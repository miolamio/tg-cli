import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { bigIntToString } from '../../lib/serialize.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Determine chat type from a gramjs Chat or Channel entity.
 */
function chatType(entity: any): string {
  if (entity.className === 'Channel') {
    return entity.megagroup ? 'supergroup' : 'channel';
  }
  if (entity.className === 'Chat') return 'group';
  return 'unknown';
}

/**
 * Action handler for `tg chat search <query>`.
 *
 * Searches for public channels and groups globally via contacts.Search.
 * Returns the chats array from the API response (channels, supergroups, groups).
 * Options: --limit (default 20)
 */
export async function chatSearchAction(this: Command, query: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { limit?: string };
  const { profile } = opts;

  const limit = parseInt(opts.limit ?? '20', 10);

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
        const found = await client.invoke(
          new Api.contacts.Search({ q: query, limit }),
        );

        const chats = ((found as any).chats ?? [])
          .filter((c: any) => c.className === 'Channel' || c.className === 'Chat')
          .map((c: any) => ({
            id: bigIntToString(c.id),
            title: c.title ?? '',
            type: chatType(c),
            username: c.username ?? null,
            membersCount: c.participantsCount ?? null,
          }));

        outputSuccess({ chats, total: chats.length });
      });
    });
  } catch (err: unknown) {
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
