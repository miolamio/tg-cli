import type { Command } from 'commander';
import { Api } from 'telegram';
import { withAuth } from '../../lib/with-auth.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { bigIntToString } from '../../lib/serialize.js';
import { ErrorCode } from '../../lib/error-codes.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Action handler for `tg chat create <title>`.
 *
 * Creates a new group, supergroup, or channel.
 * Options: --type (group|supergroup|channel, default supergroup), --description
 */
export async function chatCreateAction(this: Command, title: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { type?: string; description?: string };

  if (!title) {
    outputError('Chat title is required', ErrorCode.INVALID_INPUT);
    return;
  }

  const chatType = opts.type ?? 'supergroup';

  await withAuth(opts, async (client) => {
    let result: any;

    if (chatType === 'channel' || chatType === 'supergroup') {
      result = await client.invoke(
        new Api.channels.CreateChannel({
          title,
          about: opts.description ?? '',
          broadcast: chatType === 'channel',
          megagroup: chatType === 'supergroup',
        }),
      );
    } else {
      result = await client.invoke(
        new Api.messages.CreateChat({
          title,
          users: [],
        }),
      );
    }

    const chat = result.chats?.[0];
    outputSuccess({
      id: chat ? bigIntToString(chat.id) : null,
      title,
      type: chatType,
    });
  });
}
