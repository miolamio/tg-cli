import type { Command } from 'commander';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { serializeMessage, serializeSearchResult, bigIntToString } from '../../lib/serialize.js';
import { FILTER_MAP, VALID_FILTERS } from '../../lib/media-utils.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Action handler for `tg message search`.
 *
 * Searches messages by keyword within a specific chat (--chat) or globally.
 * Options: --query (required), --chat <chat>, --limit (default 50), --offset (default 0)
 *
 * Per-chat search (--chat provided): resolves entity, passes search param to getMessages.
 * Global search (no --chat): passes undefined entity for cross-chat search, results include chatId/chatTitle.
 */
export async function messageSearchAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & {
    query?: string;
    filter?: string;
    chat?: string;
    limit: string;
    offset: string;
  };
  const { profile } = opts;

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
        const searchParams: Record<string, any> = {
          search: opts.query || '',
          limit,
          addOffset: offset,
        };

        if (opts.filter) {
          searchParams.filter = FILTER_MAP[opts.filter]();
        }

        if (opts.chat) {
          // Per-chat search (READ-03)
          const entity = await resolveEntity(client, opts.chat);
          const messages = await client.getMessages(entity, searchParams);

          const serialized = messages.map((msg: any) =>
            serializeMessage(msg),
          );

          outputSuccess({
            messages: serialized,
            total: (messages as any).total ?? 0,
          });
        } else {
          // Global search (READ-04)
          const messages = await client.getMessages(undefined, searchParams);

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
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
