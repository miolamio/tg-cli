import type { Command } from 'commander';
import { Api } from 'telegram';
import { outputError } from '../../lib/output.js';
import { resolveEntity } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import { buildUserProfile } from '../../lib/user-profile.js';
import { withAuth } from '../../lib/with-auth.js';
import type { BatchItemError, GlobalOptions, UserProfile } from '../../lib/types.js';
import { ErrorCode } from '../../lib/error-codes.js';
import { batchError, outputBatchResult } from '../../lib/batch-results.js';

/**
 * Action handler for `tg user profile <users>`.
 *
 * Fetches detailed user profiles. Accepts comma-separated usernames/IDs.
 * Returns profiles, genuinely missing inputs, and per-input errors. Any failed
 * input sets partial:true and a nonzero exit status without dropping successes.
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
    outputError('No users specified', ErrorCode.INVALID_INPUT);
    return;
  }

  if (inputs.length > 50) {
    outputError('Too many users (max 50)', ErrorCode.TOO_MANY_USERS);
    return;
  }

  await withAuth(opts, async (client) => {
    const profiles: UserProfile[] = [];
    const notFound: string[] = [];
    const errors: BatchItemError[] = [];

    for (const input of inputs) {
      try {
        const entity = await resolveEntity(client, input);

        // Validate entity is a User (not Channel/Chat)
        if (!(entity instanceof Api.User)) {
          notFound.push(input);
          errors.push({ input, error: 'Peer is not a user', code: ErrorCode.NO_USERS_FOUND });
          continue;
        }

        const user = entity;

        // Fetch full user details
        const result = await client.invoke(
          new Api.users.GetFullUser({ id: user }),
        );

        const fullUser = result.fullUser;
        const userFromResult = (result.users?.find(candidate => bigIntToString(candidate.id) === bigIntToString(user.id)) ?? user) as Api.User;

        const profileData = await buildUserProfile(client, user, fullUser, userFromResult, err => {
          errors.push(batchError(input, err, 'Could not fetch profile photos'));
        });
        profiles.push(profileData);
      } catch (err: unknown) {
        const error = batchError(input, err);
        errors.push(error);
        if ([ErrorCode.PEER_NOT_FOUND, 'USERNAME_NOT_OCCUPIED', 'USER_ID_INVALID'].includes(error.code)) {
          notFound.push(input);
        }
      }
    }

    outputBatchResult({ profiles, notFound }, errors);
  });
}
