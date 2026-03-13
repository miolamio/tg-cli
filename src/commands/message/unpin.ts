import type { Command } from 'commander';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
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
  const { profile } = opts;

  // Parse and validate message ID
  const messageId = parseInt(msgId, 10);
  if (isNaN(messageId)) {
    outputError('Invalid message ID: must be a number', 'INVALID_MESSAGE_ID');
    return;
  }

  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));

  try {
    await store.withLock(profile, async (sessionString) => {
      if (!sessionString) {
        outputError('Not logged in. Run: tg auth login', 'NOT_AUTHENTICATED');
        return;
      }

      const { apiId, apiHash } = getCredentialsOrThrow(config);

      await withClient({ apiId, apiHash, sessionString }, async (client) => {
        const entity = await resolveEntity(client, chat);

        // API returns undefined — that's expected (Pitfall 2 from research)
        await client.unpinMessage(entity, messageId);

        // Synthesize confirmation since API gives no response payload
        const result: PinResult = {
          messageId,
          chatId: bigIntToString((entity as any).id),
          action: 'unpinned',
        };
        outputSuccess(result);
      });
    });
  } catch (err: unknown) {
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
