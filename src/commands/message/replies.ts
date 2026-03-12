import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import type { GlobalOptions, MessageItem } from '../../lib/types.js';

/**
 * Build entity lookup map from GetReplies result users/chats arrays.
 */
function buildEntityMap(result: any): Map<string, any> {
  const map = new Map<string, any>();
  for (const u of result.users ?? []) {
    map.set(u.id.toString(), u);
  }
  for (const c of result.chats ?? []) {
    map.set(c.id.toString(), c);
  }
  return map;
}

/**
 * Serialize messages from a GetReplies result, resolving sender names.
 */
function serializeReplies(result: any): MessageItem[] {
  const entityMap = buildEntityMap(result);
  return result.messages.map((msg: any) => {
    const senderId = msg.fromId?.userId ?? msg.fromId?.channelId ?? msg.fromId?.chatId;
    const senderEntity = senderId ? entityMap.get(senderId.toString()) : undefined;
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
  const { profile } = opts;

  const limit = parseInt(opts.limit, 10) || 50;
  const offset = parseInt(opts.offset, 10) || 0;

  // Parse comma-separated message IDs (same pattern as forward command)
  const parts = msgIdsInput.split(',').map(s => s.trim());
  const msgIds: number[] = [];
  const invalid: string[] = [];

  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num <= 0) {
      invalid.push(part);
    } else {
      msgIds.push(num);
    }
  }

  if (invalid.length > 0) {
    outputError(`Invalid message IDs: ${invalid.join(', ')}`, 'INVALID_MSG_ID');
    return;
  }

  if (msgIds.length === 0) {
    outputError('No message IDs provided', 'INVALID_MSG_ID');
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
          } catch (err: any) {
            // Skip posts that fail (e.g. MSG_ID_INVALID) but continue batch
            posts.push({
              postId: msgId,
              messages: [],
              total: 0,
            });
          }
        }

        outputSuccess({ posts });
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
