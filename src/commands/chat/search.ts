import type { Command } from 'commander';
import { Api } from 'telegram';
import { withAuth } from '../../lib/with-auth.js';
import { outputSuccess } from '../../lib/output.js';
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

  const limit = parseInt(opts.limit ?? '20', 10);

  await withAuth(opts, async (client) => {
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
}
