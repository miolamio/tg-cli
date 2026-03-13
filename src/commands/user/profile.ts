import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { buildUserProfile } from '../../lib/user-profile.js';
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
  const { profile } = opts;

  const inputs = usersInput.split(',').map(s => s.trim()).filter(Boolean);

  if (inputs.length === 0) {
    outputError('No users specified', 'INVALID_INPUT');
    return;
  }

  if (inputs.length > 50) {
    outputError('Too many users (max 50)', 'TOO_MANY_USERS');
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
    });
  } catch (err: unknown) {
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
