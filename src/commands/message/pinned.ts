import type { Command } from 'commander';
import { Api } from 'telegram';
import { outputSuccess, outputError } from '../../lib/output.js';
import { resolveEntity } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import { withAuth } from '../../lib/with-auth.js';
import { validatePagination } from '../../lib/validate.js';
import { formatError } from '../../lib/errors.js';
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
}
