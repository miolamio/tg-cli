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
 * Action handler for `tg message pinned <chat>`.
 *
 * Fetches pinned messages from a chat using the pinned filter.
 * Returns serialized messages with total count for pagination.
 *
 * Output shape: { messages: MessageItem[], total: number }
 */
export async function messagePinnedAction(
  this: Command,
  chatInput: string,
): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & {
    limit: string;
    offset: string;
  };
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

        // CRITICAL: Pass search: '' alongside the pinned filter to ensure gramjs
        // creates a messages.Search request. Without this, gramjs falls through
        // to GetHistory which ignores filters.
        const messages = await client.getMessages(entity, {
          search: '',
          filter: new Api.InputMessagesFilterPinned(),
          limit,
          addOffset: offset,
        });

        const serialized: MessageItem[] = messages.map(msg =>
          serializeMessage(msg, (msg as any)._sender),
        );

        outputSuccess({
          messages: serialized,
          total: (messages as any).total ?? 0,
        });
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
