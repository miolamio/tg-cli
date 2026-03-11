import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import type { GlobalOptions, ChatInfo } from '../../lib/types.js';

/**
 * Action handler for `tg chat info <chat>`.
 *
 * Gets detailed information for a chat by username, ID, or @username.
 * Returns kitchen-sink fields: description, member count, permissions, etc.
 */
export async function chatInfoAction(this: Command, chatInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile } = opts;

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
        const entity = await resolveEntity(client, chatInput);

        let chatInfo: ChatInfo;

        if (entity instanceof Api.Channel) {
          // Channel or Supergroup
          const full = await client.invoke(
            new Api.channels.GetFullChannel({ channel: entity }),
          );
          const fc = full.fullChat as any;
          const type = entity.megagroup ? 'supergroup' : 'channel';

          chatInfo = {
            id: bigIntToString(entity.id),
            title: entity.title ?? '',
            type,
            username: (entity as any).username ?? null,
            description: fc.about ?? null,
            memberCount: fc.participantsCount ?? null,
            creationDate: entity.date ? new Date(entity.date * 1000).toISOString() : null,
            photo: (entity as any).photo ?? null,
            linkedChatId: fc.linkedChatId ? bigIntToString(fc.linkedChatId) : null,
            slowmodeSeconds: fc.slowmodeSeconds ?? null,
            permissions: (entity as any).defaultBannedRights ?? null,
            inviteLink: fc.exportedInvite?.link ?? null,
            migratedFrom: fc.migratedFromChatId ? bigIntToString(fc.migratedFromChatId) : null,
          };
        } else if (entity instanceof Api.Chat) {
          // Basic group
          const full = await client.invoke(
            new Api.messages.GetFullChat({ chatId: entity.id }),
          );
          const fc = full.fullChat as any;

          chatInfo = {
            id: bigIntToString(entity.id),
            title: entity.title ?? '',
            type: 'group',
            username: null,
            description: fc.about ?? null,
            memberCount: fc.participants?.participants?.length ?? null,
            creationDate: entity.date ? new Date(entity.date * 1000).toISOString() : null,
            photo: (entity as any).photo ?? null,
            linkedChatId: null,
            slowmodeSeconds: null,
            permissions: (entity as any).defaultBannedRights ?? null,
            inviteLink: fc.exportedInvite?.link ?? null,
            migratedFrom: null,
          };
        } else {
          // User - basic info only
          const user = entity as Api.User;
          const firstName = (user as any).firstName ?? '';
          const lastName = (user as any).lastName ?? '';
          const title = lastName ? `${firstName} ${lastName}` : firstName;

          chatInfo = {
            id: bigIntToString(user.id),
            title,
            type: 'user',
            username: (user as any).username ?? null,
            description: null,
            memberCount: null,
            creationDate: null,
            photo: (user as any).photo ?? null,
            linkedChatId: null,
            slowmodeSeconds: null,
            permissions: null,
            inviteLink: null,
            migratedFrom: null,
          };
        }

        outputSuccess(chatInfo);
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
