import type { Command } from 'commander';
import { Api } from 'telegram';
import { withAuth } from '../../lib/with-auth.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { resolveEntity } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Action handler for `tg chat leave <chat>`.
 *
 * Leaves a group or channel.
 * - Channel/Supergroup: uses LeaveChannel
 * - Basic group: uses DeleteChatUser with self as user
 */
export async function chatLeaveAction(this: Command, chatInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, chatInput);

    if (entity instanceof Api.Channel) {
      // Channel or supergroup
      await client.invoke(
        new Api.channels.LeaveChannel({ channel: entity }),
      );
    } else if (entity instanceof Api.Chat) {
      // Basic group: remove self
      const me = await client.getMe();
      await client.invoke(
        new Api.messages.DeleteChatUser({
          chatId: entity.id,
          userId: (me as any).id,
        }),
      );
    } else {
      outputError('Cannot leave a user chat', 'INVALID_CHAT_TYPE');
      return;
    }

    outputSuccess({
      left: true,
      chat: {
        id: bigIntToString((entity as any).id),
        title: (entity as any).title ?? '',
      },
    });
  });
}
