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
  const { profile } = opts;

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

        await client.pinMessage(entity, messageId, { notify });

        const result: PinResult = {
          messageId,
          chatId: bigIntToString((entity as any).id),
          action: 'pinned',
          silent: !notify,
        };
        outputSuccess(result);
      });
    });
  } catch (err: unknown) {
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
