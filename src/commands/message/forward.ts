import type { Command } from 'commander';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Action handler for `tg message forward <from-chat> <msg-ids> <to-chat>`.
 *
 * Forwards one or more messages from a source chat to a destination chat.
 * Message IDs are comma-separated: `tg message forward @source 123,456,789 @dest`
 *
 * Uses Telegram's native batch forward API via gramjs forwardMessages.
 * Always passes fromPeer to avoid PEER_ID_INVALID when using integer IDs.
 *
 * Returns: { forwarded: N, messages: MessageItem[] }
 */
export async function messageForwardAction(this: Command, fromChat: string, msgIds: string, toChat: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile } = opts;

  // Parse and validate comma-separated message IDs
  const parts = msgIds.split(',').map(s => s.trim());
  const ids: number[] = [];
  const invalid: string[] = [];

  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num)) {
      invalid.push(part);
    } else {
      ids.push(num);
    }
  }

  if (invalid.length > 0) {
    outputError(`Invalid message IDs: ${invalid.join(', ')}`, 'INVALID_MESSAGE_IDS');
    return;
  }

  if (ids.length === 0) {
    outputError('No message IDs provided', 'INVALID_MESSAGE_IDS');
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
        const fromEntity = await resolveEntity(client, fromChat);
        const toEntity = await resolveEntity(client, toChat);

        // MUST pass fromPeer when using integer IDs (pitfall #2 from research)
        const forwarded = await client.forwardMessages(toEntity, {
          messages: ids,
          fromPeer: fromEntity,
        });

        const messages = forwarded.map((msg: any) => serializeMessage(msg));

        outputSuccess({
          forwarded: messages.length,
          messages,
        });
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
