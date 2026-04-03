import type { Command } from 'commander';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import { withAuth } from '../../lib/with-auth.js';
import type { GlobalOptions, PinResult } from '../../lib/types.js';

/**
 * Action handler for `tg message unpin <chat> <msg-id>`.
 *
 * Unpins a specific message from a chat.
 * API returns undefined (no confirmation payload), so we synthesize a PinResult.
 *
 * Returns PinResult with messageId, chatId, action: 'unpinned' (no silent field).
 * Uses translateTelegramError for Telegram-specific permission errors.
 */
export async function messageUnpinAction(this: Command, chat: string, msgId: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;

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

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, chat);

    try {
      // API returns undefined — that's expected (Pitfall 2 from research)
      await client.unpinMessage(entity, messageId);

      // Synthesize confirmation since API gives no response payload
      const result: PinResult = {
        messageId,
        chatId: bigIntToString((entity as any).id),
        action: 'unpinned',
      };
      outputSuccess(result);
    } catch (err: unknown) {
      const { message, code } = translateTelegramError(err);
      outputError(message, code);
    }
  });
}
