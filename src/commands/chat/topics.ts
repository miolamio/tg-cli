import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { TgError, formatError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { serializeTopic } from '../../lib/serialize.js';
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
  const { profile } = opts;

  const limit = parseInt(opts.limit, 10) || 50;
  const offset = parseInt(opts.offset, 10) || 0;

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
        const entity = await resolveEntity(client, chatInput);

        // Forum guard: entity must be a Channel with forum enabled
        if ((entity as any).className !== 'Channel') {
          throw new TgError('Chat is not a forum-enabled supergroup', 'NOT_A_FORUM');
        }
        if ((entity as any).forum === false) {
          throw new TgError('Chat is not a forum-enabled supergroup', 'NOT_A_FORUM');
        }

        const result = await client.invoke(
          new Api.channels.GetForumTopics({
            channel: entity as Api.Channel,
            offsetDate: 0,
            offsetId: 0,
            offsetTopic: 0,
            limit: offset + limit,
          }),
        );

        // Filter out ForumTopicDeleted items, only keep ForumTopic instances
        const validTopics = (result as any).topics.filter(
          (t: any) => t.className !== 'ForumTopicDeleted',
        );

        // Serialize each topic
        const serialized = validTopics.map(serializeTopic);

        // Apply client-side offset + limit slicing
        const sliced = serialized.slice(offset, offset + limit);

        outputSuccess({
          topics: sliced,
          total: (result as any).count,
        });
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
