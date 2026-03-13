import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import type { GlobalOptions, UserProfile } from '../../lib/types.js';

/**
 * Detect whether input is a phone number.
 * Phone numbers start with '+' or are all digits.
 */
function isPhoneInput(input: string): boolean {
  return /^\+?\d+$/.test(input);
}

/**
 * Map a gramjs user status object to a lastSeen string.
 *
 * Note: This duplicates the logic in profile.ts. Both files maintain
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
 * Follows the same enrichment pattern as profile.ts.
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
 * Action handler for `tg contact add <input>`.
 *
 * Adds a contact with dual routing:
 * - Phone number (starts with '+' or all digits): uses ImportContacts API
 * - Username/ID: uses resolveEntity + AddContact API
 *
 * Both routes fetch full profile via GetFullUser after adding.
 * Returns UserProfile on success.
 *
 * Phone-based add requires --first-name flag.
 * Idempotent: adding an existing contact returns success with profile.
 */
export async function contactAddAction(this: Command, input: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { firstName?: string; lastName?: string };
  const { profile, firstName, lastName } = opts;

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
        let targetUser: Api.User;

        if (isPhoneInput(input)) {
          // Phone route: ImportContacts
          if (!firstName) {
            outputError('--first-name is required when adding by phone number', 'MISSING_FIRST_NAME');
            return;
          }

          const phoneNumber = input.startsWith('+') ? input : `+${input}`;

          const importResult = await client.invoke(
            new Api.contacts.ImportContacts({
              contacts: [
                new Api.InputPhoneContact({
                  clientId: BigInt(Math.floor(Math.random() * 2 ** 32)) as any,
                  phone: phoneNumber,
                  firstName,
                  lastName: lastName ?? '',
                }),
              ],
            }),
          );

          if (importResult.users.length === 0) {
            outputError('Phone number not found on Telegram', 'PHONE_NOT_FOUND');
            return;
          }

          targetUser = importResult.users[0] as Api.User;
        } else {
          // Username/ID route: resolveEntity + AddContact
          const entity = await resolveEntity(client, input);

          if (!(entity instanceof Api.User)) {
            outputError('Not a user: this is a group/channel', 'NOT_A_USER');
            return;
          }

          targetUser = entity;

          await client.invoke(
            new Api.contacts.AddContact({
              id: entity,
              firstName: entity.firstName ?? '',
              lastName: entity.lastName ?? '',
              phone: '',
            }),
          );
        }

        // Fetch full profile for the response
        const fullResult = await client.invoke(
          new Api.users.GetFullUser({ id: targetUser }),
        );

        const fullUser = fullResult.fullUser;
        const userFromResult = (fullResult.users?.[0] ?? targetUser) as Api.User;

        const profileData = await buildUserProfile(client, targetUser, fullUser, userFromResult);
        outputSuccess(profileData);
      });
    });
  } catch (err: unknown) {
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
