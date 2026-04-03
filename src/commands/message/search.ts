import type { Command } from 'commander';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { resolveEntity, assertForum } from '../../lib/peer.js';
import { serializeMessage, serializeSearchResult, bigIntToString } from '../../lib/serialize.js';
import { FILTER_MAP, VALID_FILTERS } from '../../lib/media-utils.js';
import { withAuth } from '../../lib/with-auth.js';
import type { GlobalOptions, SearchResultItem } from '../../lib/types.js';

/**
 * Action handler for `tg message search`.
 *
 * Searches messages by keyword within a specific chat (--chat), across multiple
 * chats (comma-separated --chat), or globally (no --chat).
 *
 * Options: --query, --filter, --chat <chat>, --topic <topicId>, --limit (default 50), --offset (default 0)
 *
 * Single-chat search (--chat with one value): resolves entity, passes search param to getMessages.
 * Multi-chat search (--chat with comma-separated values): resolves each, searches sequentially, merges results.
 * Global search (no --chat): passes undefined entity for cross-chat search, results include chatId/chatTitle.
 */
export async function messageSearchAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & {
    query?: string;
    filter?: string;
    chat?: string;
    topic?: string;
    limit: string;
    offset: string;
  };
  const { quiet } = opts;

  // Validate: either --query or --filter (or both) must be provided
  if (!opts.query && !opts.filter) {
    outputError(
      'Either --query or --filter is required. Use --filter to browse by media type.',
      'MISSING_QUERY',
    );
    return;
  }

  // Validate filter name if provided
  if (opts.filter && !FILTER_MAP[opts.filter]) {
    outputError(
      `Unknown filter: ${opts.filter}. Valid: ${VALID_FILTERS.join(', ')}`,
      'INVALID_FILTER',
    );
    return;
  }

  const limit = parseInt(opts.limit, 10) || 50;
  const offset = parseInt(opts.offset, 10) || 0;

  // Parse --topic as integer
  const topicId = opts.topic ? parseInt(opts.topic, 10) : undefined;
  if (opts.topic && (topicId === undefined || isNaN(topicId))) {
    outputError('Invalid topic ID: must be a number', 'INVALID_TOPIC_ID');
    return;
  }

  await withAuth(opts, async (client) => {
    const baseSearchParams: Record<string, any> = {
      search: opts.query || '',
    };

    if (opts.filter) {
      baseSearchParams.filter = FILTER_MAP[opts.filter]();
    }

    if (opts.chat) {
      const chatIds = opts.chat.split(',').map(c => c.trim()).filter(Boolean);

      if (chatIds.length === 1) {
        // Single-chat search (READ-03) with optional topic scoping
        const entity = await resolveEntity(client, chatIds[0]);

        if (topicId !== undefined) {
          await assertForum(entity, topicId);
          baseSearchParams.replyTo = topicId;
        }

        const messages = await client.getMessages(entity, { ...baseSearchParams, limit, addOffset: offset });

        const serialized = messages.map((msg: any) =>
          serializeMessage(msg),
        );

        outputSuccess({
          messages: serialized,
          total: (messages as any).total ?? 0,
        });
      } else {
        // Multi-chat search (READ-06)
        // Topic flag not supported on multi-chat search (ambiguous which chat)
        if (topicId !== undefined) {
          outputError('--topic cannot be used with multi-chat search', 'INVALID_OPTIONS');
          return;
        }

        const allResults: SearchResultItem[] = [];
        // Fetch enough results from each chat to satisfy offset + limit after merge
        const perChatLimit = offset + limit;
        for (const chatId of chatIds) {
          try {
            const entity = await resolveEntity(client, chatId);
            const messages = await client.getMessages(entity, { ...baseSearchParams, addOffset: 0, limit: perChatLimit });
            for (const msg of messages) {
              const peerId = (msg as any).peerId;
              const msgChatId = bigIntToString(
                peerId?.channelId || peerId?.chatId || peerId?.userId,
              );
              const chat = (msg as any).chat || (msg as any)._chat;
              let chatTitle: string;
              if (chat?.firstName) {
                const last = chat.lastName ? ` ${chat.lastName}` : '';
                chatTitle = `${chat.firstName}${last}`;
              } else {
                chatTitle = chat?.title || msgChatId;
              }
              allResults.push(serializeSearchResult(msg as any, msgChatId, chatTitle));
            }
          } catch (err) {
            logStatus(`Warning: failed to search ${chatId}: ${(err as Error).message}`, quiet);
          }
        }

        // Sort newest first, apply offset, truncate to limit
        allResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const paged = allResults.slice(offset, offset + limit);
        outputSuccess({ messages: paged, total: paged.length });
      }
    } else {
      // Global search (READ-04)
      const messages = await client.getMessages(undefined, { ...baseSearchParams, limit, addOffset: offset });

      const serialized = messages.map((msg: any) => {
        const peerId = msg.peerId;
        const chatId = bigIntToString(
          peerId?.channelId || peerId?.chatId || peerId?.userId,
        );
        const chat = msg.chat || (msg as any)._chat;
        let chatTitle: string;
        if (chat?.firstName) {
          // User entity (DM): use firstName + lastName
          const last = chat.lastName ? ` ${chat.lastName}` : '';
          chatTitle = `${chat.firstName}${last}`;
        } else {
          chatTitle = chat?.title || chatId;
        }

        return serializeSearchResult(msg, chatId, chatTitle);
      });

      outputSuccess({
        messages: serialized,
        total: (messages as any).total ?? 0,
      });
    }
  });
}
