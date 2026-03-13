import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { bigIntToString } from '../../lib/serialize.js';
import type { GlobalOptions, UserProfile } from '../../lib/types.js';

/**
 * Map a gramjs user status object to a lastSeen string.
 *
 * Note: This duplicates the logic in profile.ts and add.ts. All files maintain
 * the same status mapping for consistency.
 */
function mapUserStatus(status: any): string | null {
  if (!status || !status.className) return null;

  switch (status.className) {
    case 'UserStatusOnline':
      return 'online';
    case 'UserStatusOffline':
      return status.wasOnline != null
        ? new Date(status.wasOnline * 1000).toISOString()
        : null;
    case 'UserStatusRecently':
      return 'recently';
    case 'UserStatusLastWeek':
      return 'within_week';
    case 'UserStatusLastMonth':
      return 'within_month';
    case 'UserStatusEmpty':
      return 'long_time_ago';
    default:
      return null;
  }
}

/**
 * Build a full UserProfile from a GetFullUser result.
 * Follows the same enrichment pattern as profile.ts and add.ts.
 */
async function buildUserProfile(
  client: any,
  user: Api.User,
  fullUser: any,
  userFromResult: Api.User,
): Promise<UserProfile> {
  // Fetch photo count
  let photoCount = 0;
  try {
    const photosResult = await client.invoke(
      new Api.photos.GetUserPhotos({
        userId: user,
        offset: 0,
        maxId: BigInt(0) as any,
        limit: 1,
      }),
    );
    photoCount = (photosResult as any).count
      ?? (photosResult as any).photos?.length
      ?? 0;
  } catch {
    // Fall back: if user has a profile photo, report 1
    const photo = userFromResult.photo;
    if (photo && (photo as any).className !== 'UserProfilePhotoEmpty') {
      photoCount = 1;
    }
  }

  const isBot = !!userFromResult.bot;
  const lastSeen = isBot ? null : mapUserStatus(userFromResult.status);
  const phone = userFromResult.phone ?? (isBot ? null : '[restricted]');

  const profileData: UserProfile = {
    id: bigIntToString(userFromResult.id),
    firstName: userFromResult.firstName ?? null,
    lastName: userFromResult.lastName ?? null,
    username: userFromResult.username ?? null,
    phone,
    bio: fullUser.about ?? null,
    photoCount,
    lastSeen,
    isBot,
    blocked: !!fullUser.blocked,
    commonChatsCount: fullUser.commonChatsCount ?? 0,
    premium: !!userFromResult.premium,
    verified: !!userFromResult.verified,
    mutualContact: !!userFromResult.mutualContact,
    langCode: userFromResult.langCode ?? null,
  };

  // Bot-specific fields
  if (isBot) {
    profileData.botInlinePlaceholder =
      userFromResult.botInlinePlaceholder ?? undefined;
    profileData.supportsInline =
      !!userFromResult.botInlinePlaceholder;
  }

  return profileData;
}

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
