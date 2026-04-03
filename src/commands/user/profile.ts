import type { Command } from 'commander';
import { Api } from 'telegram';
import { outputSuccess, outputError } from '../../lib/output.js';
import { resolveEntity } from '../../lib/peer.js';
import { buildUserProfile } from '../../lib/user-profile.js';
import { withAuth } from '../../lib/with-auth.js';
import type { GlobalOptions, UserProfile, UserProfileResult } from '../../lib/types.js';

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

  const inputs = usersInput.split(',').map(s => s.trim()).filter(Boolean);

  if (inputs.length === 0) {
    outputError('No users specified', 'INVALID_INPUT');
    return;
  }

  if (inputs.length > 50) {
    outputError('Too many users (max 50)', 'TOO_MANY_USERS');
    return;
  }

  await withAuth(opts, async (client) => {
    const profiles: UserProfile[] = [];
    const notFound: string[] = [];

    for (const input of inputs) {
      try {
        const entity = await resolveEntity(client, input);

        // Validate entity is a User (not Channel/Chat)
        if (!(entity instanceof Api.User)) {
          notFound.push(input);
          continue;
        }

        const user = entity;

        // Fetch full user details
        const result = await client.invoke(
          new Api.users.GetFullUser({ id: user }),
        );

        const fullUser = result.fullUser;
        const userFromResult = (result.users?.[0] ?? user) as Api.User;

        const profileData = await buildUserProfile(client, user, fullUser, userFromResult);
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
}
