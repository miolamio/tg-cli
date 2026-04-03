import type { Command } from 'commander';
import { outputSuccess, outputError } from '../../lib/output.js';
import { resolveEntity } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import { buildEntityMap } from '../../lib/entity-map.js';
import { withAuth } from '../../lib/with-auth.js';
import type { GlobalOptions, MessageItem } from '../../lib/types.js';

/**
 * Action handler for `tg message get <chat> <ids>`.
 *
 * Fetches specific messages by ID from a chat. Accepts comma-separated IDs (max 100).
 * Returns found messages and a list of IDs that were not found.
 *
 * Output shape: { messages: MessageItem[], notFound: number[] }
 */
export async function messageGetAction(
  this: Command,
  chatInput: string,
  idsInput: string,
): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;

  // Parse comma-separated message IDs
  const parts = idsInput.split(',').map(s => s.trim());
  const numericIds: number[] = [];
  const invalid: string[] = [];

  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num <= 0) {
      invalid.push(part);
    } else {
      numericIds.push(num);
    }
  }

  if (invalid.length > 0) {
    outputError(`Invalid message IDs: ${invalid.join(', ')}`, 'INVALID_MSG_ID');
    return;
  }

  if (numericIds.length === 0) {
    outputError('No message IDs provided', 'INVALID_MSG_ID');
    return;
  }

  if (numericIds.length > 100) {
    outputError(`Maximum 100 IDs per request (got ${numericIds.length})`, 'TOO_MANY_IDS');
    return;
  }

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, chatInput);

    // getMessages returns array where missing entries are undefined
    const result = await client.getMessages(entity, { ids: numericIds });

    const found: MessageItem[] = [];
    const notFound: number[] = [];

    // Build entity map as fallback for sender resolution
    const entityMap = buildEntityMap(result);

    // Iterate by index to preserve input order
    for (let i = 0; i < numericIds.length; i++) {
      const msg = result[i];
      if (msg) {
        // Prefer _sender from gramjs _finishInit, fall back to entity map
        let senderEntity = (msg as any)._sender;
        if (!senderEntity) {
          const senderId = (msg as any).fromId?.userId ?? (msg as any).fromId?.channelId ?? (msg as any).fromId?.chatId;
          if (senderId) {
            senderEntity = entityMap.get(senderId.toString());
          }
        }
        found.push(serializeMessage(msg, senderEntity));
      } else {
        notFound.push(numericIds[i]);
      }
    }

    outputSuccess({ messages: found, notFound });
  });
}
