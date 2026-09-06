import type { Command } from 'commander';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import { outputError } from '../../lib/output.js';
import { bigIntToString } from '../../lib/serialize.js';
import { validatePagination } from '../../lib/validate.js';
import { formatError, TgError } from '../../lib/errors.js';
import { ErrorCode } from '../../lib/error-codes.js';
import { buildUserProfile } from '../../lib/user-profile.js';
import { withAuth } from '../../lib/with-auth.js';
import { batchError, outputBatchResult } from '../../lib/batch-results.js';
import type { BatchItemError, GlobalOptions, ContactSearchItem } from '../../lib/types.js';

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Action handler for `tg contact search <query>`.
 *
 * Searches the address book locally by name/username. With --global, appends
 * remote username matches after local contacts, within the same result limit.
 *
 * Returns ContactSearchResult { results: ContactSearchItem[], total: number }
 * Contact membership comes from the address book, not contacts.Search.myResults.
 */
export async function contactSearchAction(this: Command, query: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { global?: boolean; limit?: string };

  const globalMode = !!opts.global;
  const normalizedQuery = normalizeSearchText(query);
  const usernameQuery = normalizedQuery.replace(/^@/, '');
  if (!usernameQuery) {
    outputError('Search query cannot be empty', ErrorCode.INVALID_INPUT);
    return;
  }
  let limit: number;
  try {
    ({ limit } = validatePagination({ limit: opts.limit }, 20));
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
    return;
  }

  await withAuth(opts, async (client) => {
    const errors: BatchItemError[] = [];
    const userMap = new Map<string, Api.User>();
    const myContactIds = new Set<string>();
    const peerUserIds: string[] = [];
    const seenIds = new Set<string>();
    const addCandidate = (id: string) => {
      if (!seenIds.has(id)) {
        peerUserIds.push(id);
        seenIds.add(id);
      }
    };

    // contacts.Search excludes the address book. Fetch it without a cache hash
    // and match names/usernames locally, including queries shorter than 3 chars.
    try {
      const contacts = await client.invoke(new Api.contacts.GetContacts({ hash: bigInt.zero }));
      if (!('contacts' in contacts)) {
        throw new TgError('Telegram returned unchanged contacts without a cached contact list', ErrorCode.UNKNOWN_ERROR);
      }
      for (const u of contacts.users) userMap.set(bigIntToString(u.id), u as Api.User);
      for (const contact of contacts.contacts) {
        const id = bigIntToString(contact.userId);
        if (myContactIds.has(id)) continue;
        myContactIds.add(id);
        const user = userMap.get(id);
        if (!user) {
          errors.push(batchError(id, new TgError('Contact user was absent from the Telegram response', ErrorCode.PEER_NOT_FOUND)));
          continue;
        }
        const fullName = normalizeSearchText([user.firstName, user.lastName].filter(Boolean).join(' '));
        const username = normalizeSearchText(user.username ?? '');
        if ((!normalizedQuery.startsWith('@') && fullName.includes(normalizedQuery))
          || username.includes(usernameQuery)) {
          addCandidate(id);
        }
      }
    } catch (err: unknown) {
      errors.push(batchError('contacts', err, 'Could not read contacts'));
    }

    // Local contacts take precedence. Avoid a remote lookup when they already
    // fill the page, so remote query limits do not hide usable local matches.
    if (globalMode && peerUserIds.length < limit) {
      try {
        const found = await client.invoke(new Api.contacts.Search({ q: query.trim().replace(/^@/, ''), limit }));
        for (const u of found.users) {
          const id = bigIntToString(u.id);
          if (!userMap.has(id)) userMap.set(id, u as Api.User);
        }
        for (const peer of [...found.myResults, ...found.results]) {
          if ('userId' in peer) addCandidate(bigIntToString(peer.userId));
        }
      } catch (err: unknown) {
        errors.push(batchError(query, err, 'Global username search failed'));
      }
    }

    // Apply the CLI limit after deduplication, before expensive enrichment RPCs.
    const selectedUserIds = peerUserIds.slice(0, limit);

    // Enrich with GetFullUser in batches of 5
    const results: ContactSearchItem[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < selectedUserIds.length; i += BATCH_SIZE) {
      const batch = selectedUserIds.slice(i, i + BATCH_SIZE);
      const enriched = await Promise.allSettled(
        batch.map(async (userId) => {
          const user = userMap.get(userId);
          if (!user) throw new TgError('Contact user was absent from the Telegram response', ErrorCode.PEER_NOT_FOUND);

          const fullResult = await client.invoke(
            new Api.users.GetFullUser({ id: user }),
          );

          const fullUser = fullResult.fullUser;
          const userFromResult = (fullResult.users?.find(candidate => bigIntToString(candidate.id) === bigIntToString(user.id)) ?? user) as Api.User;

          const profile = await buildUserProfile(client, user, fullUser, userFromResult, err => {
            errors.push(batchError(userId, err, 'Could not fetch profile photos'));
          });
          return {
            ...profile,
            isContact: myContactIds.has(userId) || userFromResult.contact === true,
          } as ContactSearchItem;
        }),
      );

      for (const [index, r] of enriched.entries()) {
        if (r.status === 'fulfilled' && r.value != null) {
          results.push(r.value);
        } else if (r.status === 'rejected') {
          errors.push(batchError(batch[index], r.reason));
        }
      }
    }

    outputBatchResult({ results, total: results.length }, errors);
  });
}
