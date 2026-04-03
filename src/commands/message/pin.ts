import type { Command } from 'commander';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import { withAuth } from '../../lib/with-auth.js';
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

  // Parse and validate message ID (strict: digits only, positive)
  if (!/^\d+$/.test(msgId)) {
    outputError('Invalid message ID: must be a positive integer', 'INVALID_MESSAGE_ID');
    return;
  }
  const messageId = parseInt(msgId, 10);
  if (messageId <= 0) {
    outputError('Invalid message ID: must be a positive integer', 'INVALID_MESSAGE_ID');
    return;
  }

  const notify = opts.notify ?? false;

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, chat);

    try {
      await client.pinMessage(entity, messageId, { notify });

      const result: PinResult = {
        messageId,
        chatId: bigIntToString((entity as any).id),
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
