import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { bigIntToString } from '../../lib/serialize.js';
import type { GlobalOptions, UserProfile, ContactSearchItem } from '../../lib/types.js';

/**
 * Map a gramjs user status object to a lastSeen string.
 *
 * Note: This duplicates the logic in profile.ts, add.ts, and list.ts.
 * All files maintain the same status mapping for consistency.
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
 * Follows the same enrichment pattern as profile.ts, add.ts, and list.ts.
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
  const { profile } = opts;

  const globalMode = !!opts.global;
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
    });
  } catch (err: unknown) {
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
