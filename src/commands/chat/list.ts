import type { Command } from 'commander';
import { withAuth } from '../../lib/with-auth.js';
import { outputSuccess } from '../../lib/output.js';
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

  const limit = parseInt(opts.limit, 10) || 50;
  const offset = parseInt(opts.offset, 10) || 0;

  await withAuth(opts, async (client) => {
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
}
