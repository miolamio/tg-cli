import { Api } from 'telegram';
import { bigIntToString } from './serialize.js';
import type { UserProfile } from './types.js';

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
export function mapUserStatus(status: any): string | null {
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
 *
 * Fetches photo count, maps user status, and assembles all UserProfile fields
 * including bot-specific fields when applicable.
 */
export async function buildUserProfile(
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
