import type { Command } from 'commander';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
import { serializeDialog } from '../../lib/serialize.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Action handler for `tg chat list`.
 *
 * Lists all chats/dialogs with optional type filtering and pagination.
 * Options: --type (user|group|channel|supergroup), --limit (default 50), --offset (default 0)
 */
export async function chatListAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { type?: string; limit: string; offset: string };
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
        const dialogs = await client.getDialogs({
          limit: offset + limit,
        });

        // Serialize all fetched dialogs
        let chats = dialogs.map(serializeDialog);

        // Filter by type BEFORE pagination so counts are accurate
        if (opts.type) {
          chats = chats.filter((c) => c.type === opts.type);
        }

        // Apply pagination after filtering
        chats = chats.slice(offset, offset + limit);

        outputSuccess({
          chats,
          total: (dialogs as any).total ?? 0,
        });
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
