import type { Command } from 'commander';
import { Api } from 'telegram';
import { outputSuccess } from '../../lib/output.js';
import { bigIntToString } from '../../lib/serialize.js';
import { buildUserProfile } from '../../lib/user-profile.js';
import { withAuth } from '../../lib/with-auth.js';
import type { GlobalOptions, UserProfile, ContactSearchItem } from '../../lib/types.js';

/**
 * Action handler for `tg contact search <query>`.
 *
 * Searches for contacts by name/username. By default, only returns contacts
 * (myResults). With --global flag, also returns non-contact Telegram users.
 *
 * Returns ContactSearchResult { results: ContactSearchItem[], total: number }
 * where each result has isContact: true (from myResults) or false (global only).
 */
export async function contactSearchAction(this: Command, query: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { global?: boolean; limit?: string };

  const globalMode = !!opts.global;
  const limit = parseInt(opts.limit ?? '20', 10);

  await withAuth(opts, async (client) => {
    const found = await client.invoke(
      new Api.contacts.Search({ q: query, limit: globalMode ? limit : 100 }),
    );

    // Build userMap from found.users keyed by bigIntToString(u.id)
    const userMap = new Map<string, Api.User>();
    for (const u of (found as any).users ?? []) {
      userMap.set(bigIntToString(u.id), u);
    }

    // Build myContactIds set from found.myResults
    const myContactIds = new Set<string>();
    for (const peer of (found as any).myResults ?? []) {
      if (peer.userId != null) {
        myContactIds.add(bigIntToString(peer.userId));
      }
    }

    // Determine which peers to process
    const peerUserIds: string[] = [];
    const seenIds = new Set<string>();

    // Always include myResults
    for (const peer of (found as any).myResults ?? []) {
      if (peer.userId != null) {
        const id = bigIntToString(peer.userId);
        if (!seenIds.has(id)) {
          peerUserIds.push(id);
          seenIds.add(id);
        }
      }
    }

    // In global mode, also include results (non-contact matches)
    if (globalMode) {
      for (const peer of (found as any).results ?? []) {
        if (peer.userId != null) {
          const id = bigIntToString(peer.userId);
          if (!seenIds.has(id)) {
            peerUserIds.push(id);
            seenIds.add(id);
          }
        }
      }
    }

    if (peerUserIds.length === 0) {
      outputSuccess({ results: [], total: 0 });
      return;
    }

    // Enrich with GetFullUser in batches of 5
    const results: ContactSearchItem[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < peerUserIds.length; i += BATCH_SIZE) {
      const batch = peerUserIds.slice(i, i + BATCH_SIZE);
      const enriched = await Promise.allSettled(
        batch.map(async (userId) => {
          const user = userMap.get(userId);
          if (!user) return null;

          const fullResult = await client.invoke(
            new Api.users.GetFullUser({ id: user }),
          );

          const fullUser = fullResult.fullUser;
          const userFromResult = (fullResult.users?.[0] ?? user) as Api.User;

          const profile = await buildUserProfile(client, user, fullUser, userFromResult);
          return {
            ...profile,
            isContact: myContactIds.has(userId),
          } as ContactSearchItem;
        }),
      );

      for (const r of enriched) {
        if (r.status === 'fulfilled' && r.value != null) {
          results.push(r.value);
        }
      }
    }

    outputSuccess({ results, total: results.length });
  });
}
