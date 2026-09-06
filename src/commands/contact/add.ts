import type { Command } from 'commander';
import { Api } from 'telegram';
import { outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity, isPhoneNumber } from '../../lib/peer.js';
import { buildUserProfile } from '../../lib/user-profile.js';
import { withAuth } from '../../lib/with-auth.js';
import { batchError, outputBatchResult } from '../../lib/batch-results.js';
import { bigIntToString } from '../../lib/serialize.js';
import type { BatchItemError, GlobalOptions } from '../../lib/types.js';
import { ErrorCode } from '../../lib/error-codes.js';

/**
 * Detect whether input is a phone number.
 * Phone numbers start with '+' or are all digits.
 */
function isPhoneInput(input: string): boolean {
  return isPhoneNumber(input);
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
  const { firstName, lastName } = opts;

  await withAuth(opts, async (client) => {
    let targetUser: Api.User;

    try {
      if (isPhoneInput(input)) {
        // Phone route: ImportContacts
        if (!firstName) {
          outputError('--first-name is required when adding by phone number', ErrorCode.MISSING_FIRST_NAME);
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
          outputError('Phone number not found on Telegram', ErrorCode.PHONE_NOT_FOUND);
          return;
        }

        targetUser = importResult.users[0] as Api.User;
      } else {
        // Username/ID route: resolveEntity + AddContact
        const entity = await resolveEntity(client, input);

        if (!(entity instanceof Api.User)) {
          outputError('Not a user: this is a group/channel', ErrorCode.NOT_A_USER);
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

      // The contact has already been added. Keep that fact in the response even
      // when the subsequent read fails, so callers need not repeat the mutation.
      let fullResult;
      try {
        fullResult = await client.invoke(new Api.users.GetFullUser({ id: targetUser }));
      } catch (err: unknown) {
        outputBatchResult({
          added: true,
          id: bigIntToString(targetUser.id),
          firstName: targetUser.firstName ?? null,
          lastName: targetUser.lastName ?? null,
          username: targetUser.username ?? null,
        }, [batchError(input, err, 'Could not fetch added contact profile')]);
        return;
      }

      const fullUser = fullResult.fullUser;
      const userFromResult = (fullResult.users?.find(candidate => bigIntToString(candidate.id) === bigIntToString(targetUser.id)) ?? targetUser) as Api.User;

      const errors: BatchItemError[] = [];
      const profileData = await buildUserProfile(client, targetUser, fullUser, userFromResult, err => {
        errors.push(batchError(input, err, 'Could not fetch profile photos'));
      });
      outputBatchResult({ ...profileData, added: true }, errors);
    } catch (err: unknown) {
      const { message, code } = translateTelegramError(err);
      outputError(message, code);
    }
  });
}
