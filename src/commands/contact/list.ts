import type { Command } from 'commander';
import { Api } from 'telegram';
import { outputError } from '../../lib/output.js';
import { bigIntToString } from '../../lib/serialize.js';
import { buildUserProfile } from '../../lib/user-profile.js';
import { withAuth } from '../../lib/with-auth.js';
import { validatePagination } from '../../lib/validate.js';
import { formatError, TgError } from '../../lib/errors.js';
import { batchError, outputBatchResult } from '../../lib/batch-results.js';
import { ErrorCode } from '../../lib/error-codes.js';
import type { BatchItemError, GlobalOptions, UserProfile } from '../../lib/types.js';

/**
 * Action handler for `tg contact list`.
 *
 * Lists all contacts with full UserProfile enrichment.
 * Supports pagination via --limit (default 50) and --offset (default 0).
 * Results are sorted alphabetically by firstName + lastName.
 *
 * Returns ContactListResult { contacts: UserProfile[], total: number }
 * where total is the full count before pagination.
 */
export async function contactListAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { limit?: string; offset?: string };

  let limit: number;
  let offset: number;
  try {
    ({ limit, offset } = validatePagination({ limit: opts.limit, offset: opts.offset }));
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
    return;
  }

  await withAuth(opts, async (client) => {
    const result = await client.invoke(
      new Api.contacts.GetContacts({ hash: BigInt(0) as any }),
    );

    // Handle ContactsNotModified
    if ((result as any).className === 'contacts.ContactsNotModified') {
      outputBatchResult({ contacts: [], total: 0 }, []);
      return;
    }

    // Build userMap from result.users keyed by bigIntToString(user.id)
    const userMap = new Map<string, Api.User>();
    for (const user of (result as any).users ?? []) {
      userMap.set(bigIntToString(user.id), user);
    }

    // Get contact user IDs from result.contacts
    const contactUserIds: string[] = [];
    for (const contact of (result as any).contacts ?? []) {
      contactUserIds.push(bigIntToString(contact.userId));
    }

    // Sort alphabetically by firstName + lastName
    contactUserIds.sort((a, b) => {
      const userA = userMap.get(a);
      const userB = userMap.get(b);
      const nameA = [userA?.firstName ?? '', userA?.lastName ?? ''].join(' ').trim().toLowerCase();
      const nameB = [userB?.firstName ?? '', userB?.lastName ?? ''].join(' ').trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const total = contactUserIds.length;

    // Apply pagination
    const page = contactUserIds.slice(offset, offset + limit);

    // Enrich with GetFullUser in batches of 5
    const profiles: UserProfile[] = [];
    const errors: BatchItemError[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < page.length; i += BATCH_SIZE) {
      const batch = page.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (userId) => {
          const user = userMap.get(userId);
          if (!user) throw new TgError('Contact user was absent from the Telegram response', ErrorCode.PEER_NOT_FOUND);

          const fullResult = await client.invoke(
            new Api.users.GetFullUser({ id: user }),
          );

          const fullUser = fullResult.fullUser;
          const userFromResult = (fullResult.users?.find(candidate => bigIntToString(candidate.id) === bigIntToString(user.id)) ?? user) as Api.User;

          return buildUserProfile(client, user, fullUser, userFromResult, err => {
            errors.push(batchError(userId, err, 'Could not fetch profile photos'));
          });
        }),
      );

      for (const [index, r] of results.entries()) {
        if (r.status === 'fulfilled' && r.value != null) {
          profiles.push(r.value);
        } else if (r.status === 'rejected') {
          errors.push(batchError(batch[index], r.reason));
        }
      }
    }

    outputBatchResult({ contacts: profiles, total }, errors);
  });
}
