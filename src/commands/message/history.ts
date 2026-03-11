import type { Command } from 'commander';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import type { GlobalOptions, MessageItem } from '../../lib/types.js';

/**
 * Action handler for `tg message history <chat>`.
 *
 * Reads message history from a chat with pagination and date filtering.
 * Options: --limit (default 50), --offset (default 0), --since <date>, --until <date>
 *
 * Date options use ISO 8601 format (e.g., 2026-03-01T00:00:00Z).
 * --until uses server-side offsetDate for efficiency.
 * --since uses post-filtering (newest-first ordering ensures early stop).
 */
export async function messageHistoryAction(this: Command, chatInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & {
    limit: string;
    offset: string;
    since?: string;
    until?: string;
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

        // Build getMessages parameters
        const params: Record<string, any> = {
          limit,
          addOffset: offset,
        };

        // --until: server-side date filter via offsetDate
        if (opts.until) {
          params.offsetDate = Math.floor(new Date(opts.until).getTime() / 1000);
        }

        const messages = await client.getMessages(entity, params);

        // Serialize messages
        let serialized: MessageItem[] = messages.map((msg: any) =>
          serializeMessage(msg),
        );

        // --since: post-filter messages after the given date
        if (opts.since) {
          const sinceMs = new Date(opts.since).getTime();
          serialized = serialized.filter(
            (m) => new Date(m.date).getTime() >= sinceMs,
          );
        }

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
