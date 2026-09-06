import type { Command } from 'commander';
import type { TelegramClient } from 'telegram';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { resolveEntity, assertForum } from '../../lib/peer.js';
import {
  serializeMessage,
  serializeSearchResult,
  bigIntToString,
  markedPeerId,
  messagePeerMarkedId,
} from '../../lib/serialize.js';
import { FILTER_MAP, VALID_FILTERS } from '../../lib/media-utils.js';
import { withAuth } from '../../lib/with-auth.js';
import { ErrorCode } from '../../lib/error-codes.js';
import { validatePagination, parseTopicId, parseMessageId } from '../../lib/validate.js';
import { formatError } from '../../lib/errors.js';
import { buildEntityMap } from '../../lib/entity-map.js';
import { batchError, outputBatchResult } from '../../lib/batch-results.js';
import type { BatchItemError, GlobalOptions, PublicPostSearchResult, SearchResultItem } from '../../lib/types.js';

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
 * Global search (no --chat): iterates cross-chat search and skips --offset results;
 * results include marked chatId/chatTitle. Multi-chat failures include partial/errors.
 */
export async function messageSearchAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & {
    query?: string;
    filter?: string;
    chat?: string;
    topic?: string;
    public?: boolean;
    peer?: string;
    after?: string;
    limit: string;
    offset: string;
  };
  const { quiet } = opts;

  if (opts.public) {
    if (opts.chat) {
      outputError('--public cannot be combined with --chat', ErrorCode.INVALID_OPTIONS);
      return;
    }
    if (opts.filter) {
      outputError('--public cannot be combined with --filter', ErrorCode.INVALID_OPTIONS);
      return;
    }
    if (opts.topic !== undefined) {
      outputError('--public cannot be combined with --topic', ErrorCode.INVALID_OPTIONS);
      return;
    }
    if (!opts.query) {
      outputError(
        '--public requires --query (a public-channel hashtag, with or without #)',
        ErrorCode.MISSING_QUERY,
      );
      return;
    }
  } else if (opts.peer !== undefined || opts.after !== undefined) {
    outputError('--peer and --after require --public', ErrorCode.INVALID_OPTIONS);
    return;
  }

  // Validate: either --query or --filter (or both) must be provided
  if (!opts.query && !opts.filter) {
    outputError(
      'Either --query or --filter is required. Use --filter to browse by media type.',
      ErrorCode.MISSING_QUERY,
    );
    return;
  }

  // Validate filter name if provided
  if (opts.filter && !FILTER_MAP[opts.filter]) {
    outputError(
      `Unknown filter: ${opts.filter}. Valid: ${VALID_FILTERS.join(', ')}`,
      ErrorCode.INVALID_FILTER,
    );
    return;
  }

  let limit: number;
  let offset: number;
  try {
    ({ limit, offset } = validatePagination({ limit: opts.limit, offset: opts.offset }));
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
    return;
  }

  let topicId: number | undefined;
  if (opts.topic !== undefined) {
    try {
      topicId = parseTopicId(opts.topic);
    } catch (err: unknown) {
      outputError(
        err instanceof Error ? err.message : 'Invalid topic ID: must be a number',
        ErrorCode.INVALID_TOPIC_ID,
      );
      return;
    }
  }

  if (topicId !== undefined && !opts.chat) {
    outputError('--topic requires a single --chat', ErrorCode.INVALID_OPTIONS);
    return;
  }

  let afterId = 0;
  if (opts.after !== undefined) {
    try {
      afterId = parseMessageId(opts.after);
    } catch (err: unknown) {
      const { message, code } = formatError(err);
      outputError(message, code);
      return;
    }
  }

  await withAuth(opts, async (client) => {
    if (opts.public) {
      await searchPublicPosts(client, {
        query: opts.query!,
        limit,
        offsetRate: offset,
        afterId,
        peer: opts.peer,
      });
      return;
    }

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
          const peer = await client.getInputEntity(entity);
          const messages = [];
          let total = 0;
          let offsetId = 0;
          while (messages.length < limit) {
            const pageLimit = Math.min(100, limit - messages.length);
            const result = await client.invoke(new Api.messages.Search({
              peer,
              q: opts.query ?? '',
              filter: opts.filter ? FILTER_MAP[opts.filter]() : new Api.InputMessagesFilterEmpty(),
              topMsgId: topicId,
              offsetId,
              addOffset: offsetId === 0 ? offset : 0,
              limit: pageLimit,
              minDate: 0,
              maxDate: 0,
              maxId: 0,
              minId: 0,
              hash: bigInt.zero,
            }));
            if (!('messages' in result)) break;
            total = 'count' in result ? result.count : result.messages.length;
            const nextOffsetId = result.messages.at(-1)?.id;
            if (!nextOffsetId || (offsetId !== 0 && nextOffsetId >= offsetId)) break;
            const entities = buildEntityMap(result);
            for (const message of result.messages) {
              if (offsetId !== 0 && message.id >= offsetId) continue;
              const senderId = messagePeerMarkedId({ peerId: (message as any).fromId });
              messages.push(serializeMessage(message as any, entities.get(senderId)));
            }
            if (result.messages.length < pageLimit) break;
            offsetId = nextOffsetId;
          }
          outputSuccess({ messages: messages.slice(0, limit), total });
          return;
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
          outputError('--topic cannot be used with multi-chat search', ErrorCode.INVALID_OPTIONS);
          return;
        }

        const allResults: SearchResultItem[] = [];
        const errors: BatchItemError[] = [];
        // Fetch enough results from each chat to satisfy offset + limit after merge
        const perChatLimit = offset + limit;
        for (const chatId of chatIds) {
          try {
            const entity = await resolveEntity(client, chatId);
            const messages = await client.getMessages(entity, { ...baseSearchParams, addOffset: 0, limit: perChatLimit });
            for (const msg of messages) {
              const msgChatId = messagePeerMarkedId(msg);
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
            const error = batchError(chatId, err);
            errors.push(error);
            logStatus(`Warning: failed to search ${chatId}: ${error.error}`, quiet);
          }
        }

        // Sort newest first, apply offset, truncate to limit
        allResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const paged = allResults.slice(offset, offset + limit);
        outputBatchResult({ messages: paged, total: paged.length }, errors);
      }
    } else {
      // Global search (READ-04)
      // SearchGlobal has no addOffset. Let gramjs advance its full cursor
      // (offsetRate, offsetPeer, offsetId), then skip the requested result count.
      const iterator = client.iterMessages(undefined, { ...baseSearchParams, limit: offset + limit });
      const messages: Api.Message[] = [];
      let skipped = 0;
      for await (const message of iterator) {
        if (skipped < offset) {
          skipped++;
          continue;
        }
        messages.push(message);
        if (messages.length >= limit) break;
      }

      const serialized = messages.map((msg: any) => {
        const chatId = messagePeerMarkedId(msg);
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
        total: (iterator as any).total ?? 0,
      });
    }
  });
}

/**
 * Global hashtag search over public channel posts (`channels.searchPosts`).
 * gramjs 2.26.22 / layer 198 only has the hashtag form — not full-text `query`.
 */
async function searchPublicPosts(
  client: TelegramClient,
  opts: { query: string; limit: number; offsetRate: number; afterId: number; peer?: string },
): Promise<void> {
  const hashtag = opts.query.trim().replace(/^#/, '');
  if (!hashtag) {
    outputError('Search query cannot be empty', ErrorCode.MISSING_QUERY);
    return;
  }
  if (/\s/.test(hashtag)) {
    outputError(
      'Public post search looks up hashtags in public channels (including those you have not joined). Use a single token, with or without #.',
      ErrorCode.INVALID_OPTIONS,
    );
    return;
  }

  let offsetPeer: any = new Api.InputPeerEmpty();
  if (opts.peer) {
    const entity = await resolveEntity(client, opts.peer);
    offsetPeer = await client.getInputEntity(entity);
  }

  const result = await client.invoke(
    new Api.channels.SearchPosts({
      hashtag,
      offsetRate: opts.offsetRate,
      offsetPeer,
      offsetId: opts.afterId,
      limit: opts.limit,
    }),
  );

  const chats = ((result as any).chats ?? []) as any[];
  const rawMessages = ((result as any).messages ?? []) as any[];
  const messages = rawMessages.map((msg: any) => {
    const chatId = messagePeerMarkedId(msg);
    const chat = chats.find((c) => markedPeerId(c) === chatId)
      ?? chats.find((c) => bigIntToString(c.id) === bigIntToString(msg.peerId?.channelId));
    const title = chat?.title || chat?.username || chatId;
    return serializeSearchResult(msg, chatId, title);
  });

  const lastRaw = rawMessages[rawMessages.length - 1];
  const last = messages[messages.length - 1];
  const hasMore = messages.length > 0
    && ((result as any).nextRate != null || messages.length >= opts.limit);
  const nextRate = hasMore
    ? ((result as any).nextRate ?? lastRaw?.date ?? null)
    : null;

  const floodRaw = (result as any).searchFlood;
  const data: PublicPostSearchResult = {
    messages,
    total: (result as any).count ?? messages.length,
    hasMore,
    nextRate,
    nextOffsetId: hasMore ? (last?.id ?? null) : null,
    nextOffsetPeer: hasMore ? (last?.chatId ?? null) : null,
  };
  if (floodRaw) {
    data.flood = {
      remains: floodRaw.remains ?? null,
      totalDaily: floodRaw.totalDaily ?? null,
      waitTill: floodRaw.waitTill ?? null,
      starsAmount: floodRaw.starsAmount != null ? String(floodRaw.starsAmount) : null,
      queryIsFree: floodRaw.queryIsFree === true,
    };
  }

  outputSuccess(data);
}
