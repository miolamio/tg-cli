import type { Command } from 'commander';
import { Api } from 'telegram';
import { withAuth } from '../../lib/with-auth.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { markedPeerId } from '../../lib/serialize.js';
import { resolveEntity } from '../../lib/peer.js';
import { ErrorCode } from '../../lib/error-codes.js';
import type { GlobalOptions } from '../../lib/types.js';

const CHAT_TYPES = new Set(['group', 'supergroup', 'channel']);

/**
 * Action handler for `tg chat create <title>`.
 *
 * Creates a new group, supergroup, or channel.
 * Options: --type (group|supergroup|channel, default supergroup), --description, --members
 */
export async function chatCreateAction(this: Command, title: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & {
    type?: string;
    description?: string;
    members?: string;
  };

  if (!title) {
    outputError('Chat title is required', ErrorCode.INVALID_INPUT);
    return;
  }

  const chatType = opts.type ?? 'supergroup';
  if (!CHAT_TYPES.has(chatType)) {
    outputError(
      `Invalid chat type '${chatType}'. Use: group, supergroup, channel`,
      ErrorCode.INVALID_CHAT_TYPE,
    );
    return;
  }

  const members = (opts.members ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (chatType === 'group' && members.length === 0) {
    outputError(
      'Basic groups require at least one other member. Pass --members or use --type supergroup.',
      ErrorCode.INVALID_OPTIONS,
    );
    return;
  }

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
      const users = [];
      for (const member of members) {
        users.push(await resolveEntity(client, member));
      }
      result = await client.invoke(
        new Api.messages.CreateChat({
          title,
          users,
        }),
      );
    }

    // messages.CreateChat returns messages.InvitedUsers; channels.CreateChannel
    // returns Updates directly.
    const updates = chatType === 'group' ? (result.updates ?? result) : result;
    const chat = updates.chats?.[0];
    outputSuccess({
      id: chat
        ? markedPeerId({
            ...chat,
            className: chat.className ?? (chatType === 'group' ? 'Chat' : 'Channel'),
            megagroup: chat.megagroup ?? chatType === 'supergroup',
          })
        : null,
      title,
      type: chatType,
    });
  });
}
