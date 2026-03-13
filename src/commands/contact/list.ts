import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { bigIntToString } from '../../lib/serialize.js';
import { buildUserProfile } from '../../lib/user-profile.js';
import type { GlobalOptions, UserProfile } from '../../lib/types.js';

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
  const { profile } = opts;

  const limit = parseInt(opts.limit ?? '50', 10);
  const offset = parseInt(opts.offset ?? '0', 10);

  if (isNaN(limit) || isNaN(offset)) {
    outputError('Invalid limit or offset: must be a number', 'INVALID_INPUT');
    return;
  }

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
        const result = await client.invoke(
          new Api.contacts.GetContacts({ hash: BigInt(0) as any }),
        );

        // Handle ContactsNotModified
        if ((result as any).className === 'contacts.ContactsNotModified') {
          outputSuccess({ contacts: [], total: 0 });
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
        const BATCH_SIZE = 5;

        for (let i = 0; i < page.length; i += BATCH_SIZE) {
          const batch = page.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map(async (userId) => {
              const user = userMap.get(userId);
              if (!user) return null;

              const fullResult = await client.invoke(
                new Api.users.GetFullUser({ id: user }),
              );

              const fullUser = fullResult.fullUser;
              const userFromResult = (fullResult.users?.[0] ?? user) as Api.User;

              return buildUserProfile(client, user, fullUser, userFromResult);
            }),
          );

          for (const r of results) {
            if (r.status === 'fulfilled' && r.value != null) {
              profiles.push(r.value);
            }
          }
        }

        outputSuccess({ contacts: profiles, total });
      });
    });
  } catch (err: unknown) {
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
