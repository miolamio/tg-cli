import type { Command } from 'commander';
import { resolve, extname } from 'node:path';
import { access } from 'node:fs/promises';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { TgError, formatError } from '../../lib/errors.js';
import { resolveEntity, assertForum } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import { detectFileType } from '../../lib/media-utils.js';
import type { GlobalOptions } from '../../lib/types.js';

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
  const { profile, quiet } = opts;

  // Validate file count for albums
  if (files.length > 10) {
    outputError('Albums support a maximum of 10 files', 'ALBUM_TOO_LARGE');
    return;
  }

  // Validate all files exist before attempting upload
  for (const fp of files) {
    try {
      await access(resolve(fp));
    } catch {
      outputError(`File not found: ${fp}`, 'FILE_NOT_FOUND');
      return;
    }
  }

  // Parse --topic as integer
  const topicId = opts.topic ? parseInt(opts.topic, 10) : undefined;
  if (opts.topic && (topicId === undefined || isNaN(topicId))) {
    outputError('Invalid topic ID: must be a number', 'INVALID_TOPIC_ID');
    return;
  }

  const replyTo = opts.replyTo ? parseInt(opts.replyTo, 10) : undefined;
  if (opts.replyTo && (replyTo === undefined || isNaN(replyTo))) {
    outputError('Invalid reply-to message ID: must be a number', 'INVALID_REPLY_TO');
    return;
  }

  // --topic overrides --reply-to since topic scoping IS the replyTo in gramjs
  const effectiveReplyTo = topicId !== undefined ? topicId : replyTo;

  const isAlbum = files.length > 1;
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

        // Build send params
        const sendParams: any = {
          file: isAlbum
            ? files.map(f => resolve(f))
            : resolve(files[0]),
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

        if (isAlbum) {
          // Album: re-fetch sequential messages to get all album items
          const ids = Array.from(
            { length: files.length },
            (_, i) => (result as any).id - files.length + 1 + i,
          );
          const albumMsgs = await client.getMessages(entity, { ids });
          const validMsgs = albumMsgs.filter(Boolean);

          if (validMsgs.length > 0) {
            const serialized = validMsgs.map(m => serializeMessage(m as any));
            const output: Record<string, any> = { messages: serialized, sent: serialized.length };
            if (validMsgs.length < files.length) {
              output.warning = `Only ${validMsgs.length} of ${files.length} album messages could be retrieved`;
            }
            outputSuccess(output);
          } else {
            // Fallback: return just the single result message
            const serialized = serializeMessage(result as any);
            outputSuccess({
              messages: [serialized],
              sent: 1,
              warning: `Only 1 of ${files.length} album messages could be retrieved`,
            });
          }
        } else {
          // Single file: serialize and return
          const serialized = serializeMessage(result as any);
          outputSuccess(serialized);
        }
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
