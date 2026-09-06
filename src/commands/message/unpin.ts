import type { Command } from 'commander';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError, formatError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { markedPeerId } from '../../lib/serialize.js';
import { withAuth } from '../../lib/with-auth.js';
import { parseMessageId } from '../../lib/validate.js';
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

    try {
      // API returns undefined — that's expected (Pitfall 2 from research)
      await client.unpinMessage(entity, messageId);

      // Synthesize confirmation since API gives no response payload
      const result: PinResult = {
        messageId,
        chatId: markedPeerId(entity),
        action: 'unpinned',
      };
      outputSuccess(result);
    } catch (err: unknown) {
      const { message, code } = translateTelegramError(err);
      outputError(message, code);
    }
  });
}
