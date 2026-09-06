import type { Command } from 'commander';
import { Api } from 'telegram';
import { withAuth } from '../../lib/with-auth.js';
import { outputSuccess } from '../../lib/output.js';
import { resolveEntity } from '../../lib/peer.js';
import { markedPeerId, serializeChatPhoto, serializeBannedRights } from '../../lib/serialize.js';
import type { GlobalOptions, ChatInfo } from '../../lib/types.js';

/**
 * Action handler for `tg chat info <chat>`.
 *
 * Gets detailed information for a chat by username, ID, or @username.
 * Returns kitchen-sink fields: description, member count, permissions, etc.
 */
export async function chatInfoAction(this: Command, chatInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;

  await withAuth(opts, async (client) => {
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
        id: markedPeerId(entity),
        title: entity.title ?? '',
        type,
        username: (entity as any).username ?? null,
        description: fc.about ?? null,
        memberCount: fc.participantsCount ?? null,
        creationDate: entity.date ? new Date(entity.date * 1000).toISOString() : null,
        photo: serializeChatPhoto((entity as any).photo),
        linkedChatId: fc.linkedChatId
          ? markedPeerId({ id: fc.linkedChatId, className: 'Channel' })
          : null,
        slowmodeSeconds: fc.slowmodeSeconds ?? null,
        permissions: serializeBannedRights((entity as any).defaultBannedRights),
        inviteLink: fc.exportedInvite?.link ?? null,
        migratedFrom: fc.migratedFromChatId
          ? markedPeerId({ id: fc.migratedFromChatId, className: 'Chat' })
          : null,
      };
    } else if (entity instanceof Api.Chat) {
      // Basic group
      const full = await client.invoke(
        new Api.messages.GetFullChat({ chatId: entity.id }),
      );
      const fc = full.fullChat as any;

      chatInfo = {
        id: markedPeerId(entity),
        title: entity.title ?? '',
        type: 'group',
        username: null,
        description: fc.about ?? null,
        memberCount: fc.participants?.participants?.length ?? null,
        creationDate: entity.date ? new Date(entity.date * 1000).toISOString() : null,
        photo: serializeChatPhoto((entity as any).photo),
        linkedChatId: null,
        slowmodeSeconds: null,
        permissions: serializeBannedRights((entity as any).defaultBannedRights),
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
        id: markedPeerId(user),
        title,
        type: 'user',
        username: (user as any).username ?? null,
        description: null,
        memberCount: null,
        creationDate: null,
        photo: serializeChatPhoto((user as any).photo),
        linkedChatId: null,
        slowmodeSeconds: null,
        permissions: null,
        inviteLink: null,
        migratedFrom: null,
      };
    }

    outputSuccess(chatInfo);
  });
}
