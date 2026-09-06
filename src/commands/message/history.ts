import type { Command } from 'commander';
import { outputSuccess, outputError } from '../../lib/output.js';
import { resolveEntity, assertForum } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import { withAuth } from '../../lib/with-auth.js';
import { validatePagination, parseIsoDate, parseTopicId } from '../../lib/validate.js';
import { formatError } from '../../lib/errors.js';
import type { GlobalOptions, MessageItem } from '../../lib/types.js';
import { ErrorCode } from '../../lib/error-codes.js';

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
    topic?: string;
  };
  let limit: number;
  let offset: number;
  let untilDate: Date | undefined;
  let sinceDate: Date | undefined;
  try {
    ({ limit, offset } = validatePagination({ limit: opts.limit, offset: opts.offset }));
    if (opts.until) untilDate = parseIsoDate(opts.until, '--until');
    if (opts.since) sinceDate = parseIsoDate(opts.since, '--since');
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

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, chatInput);

    // Forum guard: reject --topic on non-forum chats
    await assertForum(entity, topicId);

    // Build getMessages parameters
    const params: Record<string, any> = {
      limit,
      addOffset: offset,
    };

    // --topic: scope messages to a specific forum topic
    if (topicId !== undefined) {
      params.replyTo = topicId;
    }

    // --until: server-side date filter via offsetDate
    if (untilDate) {
      params.offsetDate = Math.floor(untilDate.getTime() / 1000);
    }

    const messages = await client.getMessages(entity, params);

    // Serialize messages
    let serialized: MessageItem[] = messages.map((msg: any) =>
      serializeMessage(msg),
    );

    // --since: post-filter messages after the given date
    if (sinceDate) {
      const sinceMs = sinceDate.getTime();
      serialized = serialized.filter(
        (m) => new Date(m.date).getTime() >= sinceMs,
      );
    }

    outputSuccess({
      messages: serialized,
      total: (messages as any).total ?? 0,
    });
  });
}
