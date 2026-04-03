import type { Command } from 'commander';
import { Api } from 'telegram';
import { withAuth } from '../../lib/with-auth.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { resolveEntity } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import { ErrorCode } from '../../lib/error-codes.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Action handler for `tg chat kick <chat> <user>`.
 *
 * Kicks a user from a group or supergroup.
 */
export async function chatKickAction(this: Command, chatInput: string, userInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;

  await withAuth(opts, async (client) => {
    const chatEntity = await resolveEntity(client, chatInput);
    const userEntity = await resolveEntity(client, userInput);

    if (!(userEntity instanceof Api.User)) {
      outputError('Target must be a user', ErrorCode.NOT_A_USER);
      return;
    }

    if (chatEntity instanceof Api.Channel) {
      await client.invoke(
        new Api.channels.EditBanned({
          channel: chatEntity,
          participant: userEntity,
          bannedRights: new Api.ChatBannedRights({
            untilDate: 0,
            viewMessages: true,
          }),
        }),
      );
    } else if (chatEntity instanceof Api.Chat) {
      await client.invoke(
        new Api.messages.DeleteChatUser({
          chatId: chatEntity.id,
          userId: userEntity,
        }),
      );
    } else {
      outputError('Cannot kick from a user chat', ErrorCode.INVALID_CHAT_TYPE);
      return;
    }

    outputSuccess({
      chatId: bigIntToString((chatEntity as any).id),
      userId: bigIntToString(userEntity.id),
      kicked: true,
    });
  });
}
