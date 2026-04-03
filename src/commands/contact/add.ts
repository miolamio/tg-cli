import type { Command } from 'commander';
import { Api } from 'telegram';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { buildUserProfile } from '../../lib/user-profile.js';
import { withAuth } from '../../lib/with-auth.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Detect whether input is a phone number.
 * Phone numbers start with '+' or are all digits.
 */
function isPhoneInput(input: string): boolean {
  return /^\+?\d+$/.test(input);
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
    } catch (err: unknown) {
      const { message, code } = translateTelegramError(err);
      outputError(message, code);
    }
  });
}
