import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import type { GlobalOptions, UserProfile, UserProfileResult } from '../../lib/types.js';

/**
 * Map a gramjs user status object to a lastSeen string.
 *
 * Returns:
 * - "online" for UserStatusOnline
 * - ISO timestamp for UserStatusOffline (from wasOnline)
 * - "recently" for UserStatusRecently
 * - "within_week" for UserStatusLastWeek
 * - "within_month" for UserStatusLastMonth
 * - "long_time_ago" for UserStatusEmpty
 * - null for unknown/missing status
 */
function mapUserStatus(status: any): string | null {
  if (!status || !status.className) return null;

  switch (status.className) {
    case 'UserStatusOnline':
      return 'online';
    case 'UserStatusOffline':
      return status.wasOnline
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
 * Action handler for `tg user profile <users>`.
 *
 * Fetches detailed user profiles. Accepts comma-separated usernames/IDs.
 * Returns { profiles: UserProfile[], notFound: string[] } with partial success.
 *
 * - Privacy-restricted phone shows '[restricted]' for non-bot users
 * - Bots include botInlinePlaceholder and supportsInline fields
 * - All 6 UserStatus types mapped to lastSeen strings
 * - Bots always have lastSeen: null
 */
export async function userProfileAction(this: Command, usersInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile } = opts;

  const inputs = usersInput.split(',').map(s => s.trim()).filter(Boolean);

  if (inputs.length === 0) {
    outputError('No users specified', 'INVALID_INPUT');
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
        const profiles: UserProfile[] = [];
        const notFound: string[] = [];

        for (const input of inputs) {
          try {
            const entity = await resolveEntity(client, input);

            // Validate entity is a User (not Channel/Chat)
            // Use className check (gramjs entities always have className property)
            if ((entity as any).className !== 'User') {
              notFound.push(input);
              continue;
            }

            const user = entity;

            // Fetch full user details
            const result = await client.invoke(
              new Api.users.GetFullUser({ id: user }),
            );

            const fullUser = (result as any).fullUser;
            const userFromResult = (result as any).users?.[0] ?? user;

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
              const photo = (userFromResult as any).photo;
              if (photo && photo.className !== 'UserProfilePhotoEmpty') {
                photoCount = 1;
              }
            }

            const isBot = !!(userFromResult as any).bot;

            // Map status - null for bots
            const lastSeen = isBot ? null : mapUserStatus((userFromResult as any).status);

            // Phone: restricted indicator for non-bots with missing phone
            const phone = (userFromResult as any).phone ?? (isBot ? null : '[restricted]');

            const profileData: UserProfile = {
              id: bigIntToString((userFromResult as any).id),
              firstName: (userFromResult as any).firstName ?? null,
              lastName: (userFromResult as any).lastName ?? null,
              username: (userFromResult as any).username ?? null,
              phone,
              bio: fullUser.about ?? null,
              photoCount,
              lastSeen,
              isBot,
              blocked: !!fullUser.blocked,
              commonChatsCount: fullUser.commonChatsCount ?? 0,
              premium: !!(userFromResult as any).premium,
              verified: !!(userFromResult as any).verified,
              mutualContact: !!(userFromResult as any).mutualContact,
              langCode: (userFromResult as any).langCode ?? null,
            };

            // Bot-specific fields
            if (isBot) {
              profileData.botInlinePlaceholder =
                (userFromResult as any).botInlinePlaceholder ?? undefined;
              profileData.supportsInline =
                !!(userFromResult as any).botInlinePlaceholder;
            }

            profiles.push(profileData);
          } catch {
            notFound.push(input);
          }
        }

        if (profiles.length === 0) {
          outputError('No users found', 'NO_USERS_FOUND');
          return;
        }

        const result: UserProfileResult = { profiles, notFound };
        outputSuccess(result);
      });
    });
  } catch (err: unknown) {
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
