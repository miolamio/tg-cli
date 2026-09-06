import type { Command } from 'commander';
import { resolve, extname, isAbsolute } from 'node:path';
import { access } from 'node:fs/promises';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { resolveEntity, assertForum } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import { detectFileType } from '../../lib/media-utils.js';
import { withAuth } from '../../lib/with-auth.js';
import type { GlobalOptions } from '../../lib/types.js';
import { ErrorCode } from '../../lib/error-codes.js';
import { parseMessageId, parseTopicId } from '../../lib/validate.js';
import { outputBatchResult } from '../../lib/batch-results.js';
import type { BatchItemError } from '../../lib/types.js';
import { getDaemonContext } from '../../lib/daemon/execution-context.js';

/**
 * Action handler for `tg media send <chat> <files...>`.
 *
 * Uploads and sends files to a chat. Supports:
 * - Single file send: `tg media send @chat photo.jpg`
 * - Album send (multiple files, max 10): `tg media send @chat a.jpg b.jpg c.jpg`
 * - Caption: `--caption "My caption"`
 * - Reply: `--reply-to 42`
 * - Voice note auto-detection for .ogg/.opus files
 * - Force document mode for non-photo/video/voice files
 * - Progress output on stderr (suppressed with --quiet)
 *
 * Returns MessageItem for single, { messages, sent } for album.
 */
export async function mediaSendAction(this: Command): Promise<void> {
  const chat = this.args[0];
  const files = this.args.slice(1);
  const opts = this.optsWithGlobals() as GlobalOptions & {
    caption?: string;
    replyTo?: string;
    topic?: string;
  };
  const { quiet } = opts;
  const context = getDaemonContext();
  if (context && (!context.cwd || !isAbsolute(context.cwd))) {
    outputError('Media commands through the daemon require an absolute cwd', ErrorCode.INVALID_OPTIONS);
    return;
  }
  const cwd = context?.cwd ?? process.cwd();

  // Validate file count for albums
  if (files.length > 10) {
    outputError('Albums support a maximum of 10 files', ErrorCode.ALBUM_TOO_LARGE);
    return;
  }

  // Validate all files exist before attempting upload
  for (const fp of files) {
    try {
      await access(resolve(cwd, fp));
    } catch {
      outputError(`File not found: ${fp}`, ErrorCode.FILE_NOT_FOUND);
      return;
    }
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

  let replyTo: number | undefined;
  if (opts.replyTo !== undefined) {
    try {
      replyTo = parseMessageId(opts.replyTo);
    } catch {
      outputError('Invalid reply-to message ID: must be a positive message ID', ErrorCode.INVALID_REPLY_TO);
      return;
    }
  }

  if (topicId !== undefined && replyTo !== undefined) {
    outputError(
      '--topic and --reply-to cannot be combined yet. Use --reply-to to reply in-topic, or --topic to post to the topic root.',
      ErrorCode.INVALID_OPTIONS,
    );
    return;
  }
  const effectiveReplyTo = topicId !== undefined ? topicId : replyTo;

  const isAlbum = files.length > 1;

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, chat);

    // Forum guard: reject --topic on non-forum chats
    await assertForum(entity, topicId);

    // Build send params
    const sendParams: any = {
      file: isAlbum
        ? files.map(f => resolve(cwd, f))
        : resolve(cwd, files[0]),
      caption: opts.caption ?? '',
      replyTo: effectiveReplyTo,
      progressCallback: (progress: number) => {
        logStatus(
          `Uploading: ${Math.round(progress * 100)}%`,
          quiet,
        );
      },
    };

    // Single file type detection
    if (!isAlbum) {
      const ext = extname(files[0]);
      const fileType = detectFileType(ext);

      if (fileType === 'voice') {
        sendParams.voiceNote = true;
      } else if (fileType === 'document') {
        sendParams.forceDocument = true;
      }
    }

    const result = await client.sendFile(entity, sendParams);

    if (!isAlbum && result == null) {
      outputError('Telegram did not return the sent message ID; the file may have been sent and retrying may create a duplicate', ErrorCode.MESSAGE_RESULT_UNAVAILABLE);
      return;
    }

    if (isAlbum) {
      // gramjs returns each sent message; their IDs need not be consecutive.
      const returnedMessages = Array.isArray(result) ? result : [result];
      const sentMessages = returnedMessages.filter(message => message != null);
      const serialized = sentMessages.map(message => serializeMessage(message));
      const output: Record<string, unknown> = { messages: serialized, sent: serialized.length };
      const errors: BatchItemError[] = [];
      for (let index = 0; index < files.length; index++) {
        if (returnedMessages[index] == null) {
          errors.push({ input: files[index], error: `Message ID for album item ${index + 1} is unavailable after sending; retrying may create a duplicate`, code: ErrorCode.MESSAGE_RESULT_UNAVAILABLE });
        }
      }
      if (sentMessages.length !== files.length) {
        output.warning = `Telegram returned ${sentMessages.length} messages for ${files.length} files; missing message IDs are unknown`;
      }
      outputBatchResult(output, errors);
    } else {
      // Single file: serialize and return
      const serialized = serializeMessage(result as any);
      outputSuccess(serialized);
    }
  });
}
