import type { Command } from 'commander';
import { Api } from 'telegram';
import { outputSuccess, outputError } from '../../lib/output.js';
import { resolveEntity } from '../../lib/peer.js';
import { messagePeerMarkedId, serializeMessage } from '../../lib/serialize.js';
import { buildEntityMap } from '../../lib/entity-map.js';
import { withAuth } from '../../lib/with-auth.js';
import { parseMessageIds, validatePagination } from '../../lib/validate.js';
import { formatError } from '../../lib/errors.js';
import { batchError, outputBatchResult } from '../../lib/batch-results.js';
import type { BatchItemError, GlobalOptions, MessageItem } from '../../lib/types.js';

/**
 * Serialize messages from a GetReplies result, resolving sender names.
 */
function serializeReplies(result: any): MessageItem[] {
  const entityMap = buildEntityMap(result);
  return result.messages.map((msg: any) => {
    const senderId = messagePeerMarkedId({ peerId: msg.fromId });
    const senderEntity = entityMap.get(senderId);
    return serializeMessage(msg, senderEntity);
  });
}

/**
 * Action handler for `tg message replies <channel> <msg-ids>`.
 *
 * Reads replies/comments on channel posts using messages.GetReplies.
 * Accepts comma-separated msg IDs for batch fetching in a single connection.
 * Options: --limit (default 50), --offset (default 0)
 */
export async function messageRepliesAction(
  this: Command,
  channelInput: string,
  msgIdsInput: string,
): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & {
    limit: string;
    offset: string;
  };

  let limit: number;
  let offset: number;
  let msgIds: number[];
  try {
    ({ limit, offset } = validatePagination({ limit: opts.limit, offset: opts.offset }));
    msgIds = parseMessageIds(msgIdsInput);
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
    return;
  }

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, channelInput);

    // Single post — original simple output
    if (msgIds.length === 1) {
      const result = await client.invoke(
        new Api.messages.GetReplies({
          peer: entity,
          msgId: msgIds[0],
          limit,
          addOffset: offset,
        }),
      );

      outputSuccess({
        messages: serializeReplies(result),
        total: (result as any).count ?? 0,
        postId: msgIds[0],
      });
      return;
    }

    // Batch mode — iterate over post IDs within one connection
    const posts: Array<{
      postId: number;
      messages: MessageItem[];
      total: number;
    }> = [];
    const errors: BatchItemError[] = [];

    for (const msgId of msgIds) {
      try {
        const result = await client.invoke(
          new Api.messages.GetReplies({
            peer: entity,
            msgId,
            limit,
            addOffset: offset,
          }),
        );

        posts.push({
          postId: msgId,
          messages: serializeReplies(result),
          total: (result as any).count ?? 0,
        });
      } catch (err: unknown) {
        errors.push(batchError(String(msgId), err));
      }
    }

    outputBatchResult({ posts }, errors);
  });
}
