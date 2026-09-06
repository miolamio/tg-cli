import type { Command } from 'commander';
import { Api } from 'telegram';
import { withAuth } from '../../lib/with-auth.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { TgError, formatError } from '../../lib/errors.js';
import { validatePagination } from '../../lib/validate.js';
import { resolveEntity } from '../../lib/peer.js';
import { serializeTopic } from '../../lib/serialize.js';
import { ErrorCode } from '../../lib/error-codes.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Action handler for `tg chat topics <chat>`.
 *
 * Lists forum topics in a supergroup with pagination.
 * Options: --limit (default 50), --offset (default 0)
 *
 * Forum guard: rejects non-forum chats with NOT_A_FORUM error code.
 * Filters out ForumTopicDeleted items from API results.
 * Applies client-side offset slicing for simple pagination.
 */
export async function chatTopicsAction(this: Command, chatInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { limit: string; offset: string };

  let limit: number;
  let offset: number;
  try {
    ({ limit, offset } = validatePagination({ limit: opts.limit, offset: opts.offset }));
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
    return;
  }

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, chatInput);

    // Forum guard: entity must be a Channel with forum enabled
    if ((entity as any).className !== 'Channel') {
      throw new TgError('Chat is not a forum-enabled supergroup', ErrorCode.NOT_A_FORUM);
    }
    if ((entity as any).forum !== true) {
      throw new TgError('Chat is not a forum-enabled supergroup', ErrorCode.NOT_A_FORUM);
    }

    const TOPIC_BATCH = 100;
    const needed = offset + limit;
    const collected: any[] = [];
    let offsetDate = 0;
    let offsetId = 0;
    let offsetTopic = 0;
    let total = 0;

    while (collected.length < needed) {
      const result = await client.invoke(
        new Api.channels.GetForumTopics({
          channel: entity as Api.Channel,
          offsetDate,
          offsetId,
          offsetTopic,
          limit: TOPIC_BATCH,
        }),
      );
      total = (result as any).count ?? total;
      const raw = ((result as any).topics ?? []) as any[];
      // ForumTopicDeleted items count toward the API limit and are the
      // pagination placeholders. Filter them only from the user-facing list.
      if (!raw.length) break;
      for (const t of raw) {
        if (t.className !== 'ForumTopicDeleted') collected.push(t);
      }
      const last = raw[raw.length - 1];
      offsetTopic = last.id ?? offsetTopic;
      offsetId = last.topMessage ?? 0;
      offsetDate = last.date ?? 0;
      if (raw.length < TOPIC_BATCH) break;
    }

    const serialized = collected.map(serializeTopic);
    const sliced = serialized.slice(offset, offset + limit);

    outputSuccess({
      topics: sliced,
      total,
    });
  });
}
