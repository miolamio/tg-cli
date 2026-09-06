import type { Command } from 'commander';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError, formatError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { markedPeerId } from '../../lib/serialize.js';
import { withAuth } from '../../lib/with-auth.js';
import { parseMessageId } from '../../lib/validate.js';
import type { GlobalOptions, PinResult } from '../../lib/types.js';

/**
 * Action handler for `tg message pin <chat> <msg-id>`.
 *
 * Pins a message in a chat. Silent by default (no notification).
 * Use --notify to send a notification to chat members.
 *
 * Returns PinResult with messageId, chatId, action, and silent indicator.
 * Uses translateTelegramError for Telegram-specific permission errors.
 */
export async function messagePinAction(this: Command, chat: string, msgId: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { notify?: boolean };

  let messageId: number;
  try {
    messageId = parseMessageId(msgId);
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
    return;
  }

  const notify = opts.notify ?? false;

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, chat);

    try {
      await client.pinMessage(entity, messageId, { notify });

      const result: PinResult = {
        messageId,
        chatId: markedPeerId(entity),
        action: 'pinned',
        silent: !notify,
      };
      outputSuccess(result);
    } catch (err: unknown) {
      const { message, code } = translateTelegramError(err);
      outputError(message, code);
    }
  });
}
