import type { Command } from 'commander';
import { outputSuccess, outputError } from '../../lib/output.js';
import { resolveEntity } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import { withAuth } from '../../lib/with-auth.js';
import { parseMessageIds } from '../../lib/validate.js';
import { formatError } from '../../lib/errors.js';
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

  let ids: number[];
  try {
    ids = parseMessageIds(msgIds);
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
    return;
  }

  await withAuth(opts, async (client) => {
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
}
