import type { Command } from 'commander';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
import { resolveEntity, assertForum } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import type { GlobalOptions } from '../../lib/types.js';

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
 * - Reply to a specific message via --reply-to <msgId>
 * - Piped stdin input via dash placeholder: echo "msg" | tg message send <chat> -
 * - gramjs built-in markdown parsing for **bold**, __italic__, `code`, [links](url)
 *
 * Returns the sent message as a serialized MessageItem.
 */
export async function messageSendAction(this: Command, chat: string, text: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { replyTo?: string; topic?: string; commentTo?: string };
  const { profile } = opts;

  // Handle stdin pipe via dash placeholder
  if (text === '-') {
    if (process.stdin.isTTY) {
      outputError('"-" requires piped input. Example: echo "msg" | tg message send @user -', 'STDIN_REQUIRED');
      return;
    }
    text = await readStdin();
  }

  // Validate non-empty text
  if (!text) {
    outputError('Message text is required', 'EMPTY_MESSAGE');
    return;
  }

  // Telegram message length limit
  if (text.length > 4096) {
    outputError('Message too long (max 4096 chars)', 'MESSAGE_TOO_LONG');
    return;
  }

  // Parse --topic as integer
  const topicId = opts.topic ? parseInt(opts.topic, 10) : undefined;
  if (opts.topic && (topicId === undefined || isNaN(topicId))) {
    outputError('Invalid topic ID: must be a number', 'INVALID_TOPIC_ID');
    return;
  }

  // Parse replyTo as integer
  const replyTo = opts.replyTo ? parseInt(opts.replyTo, 10) : undefined;
  if (opts.replyTo && (replyTo === undefined || isNaN(replyTo))) {
    outputError('Invalid reply-to message ID: must be a number', 'INVALID_REPLY_TO');
    return;
  }

  // Parse commentTo as integer (for channel post comments)
  const commentTo = opts.commentTo ? parseInt(opts.commentTo, 10) : undefined;
  if (opts.commentTo && (commentTo === undefined || isNaN(commentTo))) {
    outputError('Invalid comment-to message ID: must be a number', 'INVALID_COMMENT_TO');
    return;
  }

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
        const entity = await resolveEntity(client, chat);

        // Forum guard: reject --topic on non-forum chats
        await assertForum(entity, topicId);

        // --topic overrides --reply-to since topic scoping IS the replyTo in gramjs
        const effectiveReplyTo = topicId !== undefined ? topicId : replyTo;

        // gramjs built-in MarkdownParser handles **bold**, __italic__, `code`, [links](url) automatically
        const sentMsg = await client.sendMessage(entity, {
          message: text,
          replyTo: effectiveReplyTo,
          ...(commentTo !== undefined && { commentTo }),
        });

        const serialized = serializeMessage(sentMsg as any);
        outputSuccess(serialized);
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
