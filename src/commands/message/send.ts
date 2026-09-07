import type { Command } from 'commander';
import { parseSchedule } from '../../lib/schedule.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { resolveEntity, assertForum } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import { withAuth } from '../../lib/with-auth.js';
import type { GlobalOptions, ScheduledMessageResult } from '../../lib/types.js';
import { ErrorCode } from '../../lib/error-codes.js';
import { getDaemonContext } from '../../lib/daemon/execution-context.js';
import { parseTopicId, parseMessageId } from '../../lib/validate.js';

/**
 * Read all data from stdin as a UTF-8 string.
 * Used when the text argument is "-" (dash placeholder) to support piped input.
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8').trimEnd();
}

/**
 * Action handler for `tg message send <chat> <text>`.
 *
 * Sends a text message to any chat. Supports:
 * - Server-side scheduled delivery via --schedule <zoned ISO timestamp>
 * - Reply to a specific message via --reply-to <msgId>
 * - Piped stdin input via dash placeholder: echo "msg" | tg message send <chat> -
 * - gramjs built-in markdown parsing for **bold**, __italic__, `code`, [links](url)
 *
 * Returns the sent message as a serialized MessageItem.
 */
export async function messageSendAction(this: Command, chat: string, text: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { replyTo?: string; topic?: string; commentTo?: string; schedule?: string };

  let schedule: number | undefined;
  if (opts.schedule !== undefined) {
    try { schedule = parseSchedule(opts.schedule); }
    catch (err) {
      outputError((err as Error).message, ErrorCode.INVALID_SCHEDULE);
      return;
    }
  }

  // Handle stdin pipe via dash placeholder
  if (text === '-') {
    const context = getDaemonContext();
    if (context ? context.stdin === undefined : process.stdin.isTTY) {
      outputError('"-" requires piped input. Example: echo "msg" | tg message send @user -', ErrorCode.STDIN_REQUIRED);
      return;
    }
    text = context ? context.stdin!.trimEnd() : await readStdin();
  }

  // Validate non-empty text
  if (!text) {
    outputError('Message text is required', ErrorCode.EMPTY_MESSAGE);
    return;
  }

  // Telegram message length limit
  if (text.length > 4096) {
    outputError('Message too long (max 4096 chars)', ErrorCode.MESSAGE_TOO_LONG);
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

  // Parse replyTo as integer
  let replyTo: number | undefined;
  try {
    if (opts.replyTo !== undefined) replyTo = parseMessageId(opts.replyTo);
  } catch {
    outputError('Invalid reply-to message ID: must be a positive integer', ErrorCode.INVALID_REPLY_TO);
    return;
  }

  // Parse commentTo as integer (for channel post comments)
  let commentTo: number | undefined;
  try {
    if (opts.commentTo !== undefined) commentTo = parseMessageId(opts.commentTo);
  } catch {
    outputError('Invalid comment-to message ID: must be a positive integer', ErrorCode.INVALID_COMMENT_TO);
    return;
  }

  if (topicId !== undefined && replyTo !== undefined) {
    outputError(
      '--topic and --reply-to cannot be combined yet. Use --reply-to to reply in-topic, or --topic to post to the topic root.',
      ErrorCode.INVALID_OPTIONS,
    );
    return;
  }
  if (commentTo !== undefined && (topicId !== undefined || replyTo !== undefined)) {
    outputError('--comment-to cannot be combined with --topic or --reply-to', ErrorCode.INVALID_OPTIONS);
    return;
  }
  const effectiveReplyTo = topicId !== undefined ? topicId : replyTo;

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, chat);

    // Forum guard: reject --topic on non-forum chats
    await assertForum(entity, topicId);

    // Auth/peer resolution may have taken long enough to expire the requested time.
    if (opts.schedule !== undefined) schedule = parseSchedule(opts.schedule);

    // gramjs built-in MarkdownParser handles **bold**, __italic__, `code`, [links](url) automatically
    const sentMsg = await client.sendMessage(entity, {
      message: text,
      replyTo: effectiveReplyTo,
      ...(commentTo !== undefined && { commentTo }),
      ...(schedule !== undefined && { schedule }),
    });

    if (!sentMsg) {
      outputError('Telegram did not return the sent message result; retrying may create a duplicate.', ErrorCode.MESSAGE_RESULT_UNAVAILABLE);
      return;
    }
    const serialized = serializeMessage(sentMsg as any);
    if (schedule === undefined) outputSuccess(serialized);
    else {
      const scheduled: ScheduledMessageResult = { ...serialized, scheduledAt: new Date(schedule * 1000).toISOString() };
      outputSuccess(scheduled);
    }
  });
}
