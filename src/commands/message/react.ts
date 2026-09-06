import type { Command } from 'commander';
import { Api } from 'telegram';
import { outputSuccess, outputError } from '../../lib/output.js';
import { resolveEntity } from '../../lib/peer.js';
import { markedPeerId } from '../../lib/serialize.js';
import { withAuth } from '../../lib/with-auth.js';
import { parseMessageId } from '../../lib/validate.js';
import { formatError } from '../../lib/errors.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Action handler for `tg message react <chat> <msg-id> <emoji>`.
 *
 * Adds or removes an emoji reaction on a message.
 * Uses Api.messages.SendReaction with Api.ReactionEmoji wrapper (NOT plain string).
 * Remove with --remove flag sends empty reaction array.
 *
 * Returns: { messageId, chatId, emoji, action: 'added'|'removed' }
 */
export async function messageReactAction(this: Command, chat: string, msgId: string, emoji: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { remove?: boolean };
  const remove = opts.remove ?? false;

  let messageId: number;
  try {
    messageId = parseMessageId(msgId);
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
    return;
  }

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, chat);

    // CRITICAL: reaction MUST be Api.ReactionEmoji[], NOT plain string (pitfall #1)
    const reaction = remove
      ? []
      : [new Api.ReactionEmoji({ emoticon: emoji })];

    await client.invoke(
      new Api.messages.SendReaction({
        peer: entity,
        msgId: messageId,
        reaction,
      }),
    );

    outputSuccess({
      messageId,
      chatId: markedPeerId(entity),
      emoji,
      action: remove ? 'removed' : 'added',
    });
  });
}
