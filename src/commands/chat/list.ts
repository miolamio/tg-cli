import type { Command } from 'commander';
import type { TelegramClient } from 'telegram';
import { withAuth } from '../../lib/with-auth.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { bigIntToString, serializeDialog } from '../../lib/serialize.js';
import { validatePagination } from '../../lib/validate.js';
import { formatError } from '../../lib/errors.js';
import type { ChatListItem, GlobalOptions } from '../../lib/types.js';

const DIALOG_BATCH = 100;
const MAX_DIALOGS = 5000;

/**
 * Keep fetching dialogs until we have `offset + limit` matches of `type`,
 * or the dialog list is exhausted.
 */
async function fetchTypedPage(
  client: TelegramClient,
  type: string,
  offset: number,
  limit: number,
): Promise<{ chats: ChatListItem[]; total: number; hasMore: boolean }> {
  const needed = offset + limit;
  const matching: ChatListItem[] = [];
  const seen = new Set<string>();
  let last: any;
  let fetched = 0;
  let exhausted = false;

  while (matching.length < needed && fetched < MAX_DIALOGS) {
    const params: Record<string, unknown> = { limit: DIALOG_BATCH };
    if (last) {
      params.offsetDate = last.date ?? last.message?.date;
      params.offsetId = last.message?.id ?? last.topMessage ?? 0;
      params.offsetPeer = last.inputEntity ?? last.entity;
    }
    const batch = await client.getDialogs(params as any);
    if (!batch.length) {
      exhausted = true;
      break;
    }
    fetched += batch.length;
    for (const dialog of batch) {
      const key = bigIntToString((dialog as any).id) || String((dialog as any).id);
      if (seen.has(key)) continue;
      seen.add(key);
      last = dialog;
      const chat = serializeDialog(dialog);
      if (chat.type === type) matching.push(chat);
    }
    if (batch.length < DIALOG_BATCH) {
      exhausted = true;
      break;
    }
  }

  return {
    chats: matching.slice(offset, offset + limit),
    total: matching.length,
    hasMore:
      matching.length > offset + limit
      || (matching.length >= needed && !exhausted && fetched < MAX_DIALOGS),
  };
}

/**
 * Action handler for `tg chat list`.
 *
 * Lists all chats/dialogs with optional type filtering and pagination.
 * Options: --type (user|group|channel|supergroup), --limit (default 50), --offset (default 0)
 */
export async function chatListAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { type?: string; limit: string; offset: string };

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
    if (opts.type) {
      const { chats, total, hasMore } = await fetchTypedPage(client, opts.type, offset, limit);
      outputSuccess({ chats, total, hasMore });
      return;
    }

    const dialogs = await client.getDialogs({
      limit: offset + limit,
    });

    const chats = dialogs.map(serializeDialog).slice(offset, offset + limit);

    outputSuccess({
      chats,
      total: (dialogs as any).total ?? 0,
    });
  });
}
