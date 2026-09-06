import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve, basename, sep, isAbsolute } from 'node:path';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { TgError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { extractMediaInfo, detectMedia } from '../../lib/serialize.js';
import { generateFilename, formatBytes } from '../../lib/media-utils.js';
import { withAuth } from '../../lib/with-auth.js';
import { parseMessageIds } from '../../lib/validate.js';
import { formatError } from '../../lib/errors.js';
import type { GlobalOptions, DownloadResult } from '../../lib/types.js';
import { ErrorCode } from '../../lib/error-codes.js';
import { getDaemonContext } from '../../lib/daemon/execution-context.js';

const DOWNLOADABLE = new Set(['photo', 'video', 'voice', 'document', 'audio']);

/**
 * Action handler for `tg media download <chat> <msg-ids>`.
 *
 * Downloads media from one or more messages. Supports:
 * - Single download: `tg media download @chat 123`
 * - Batch download: `tg media download @chat 123,456,789`
 * - Output override: `-o <path>` (file for single, directory for batch)
 * - Auto-naming from Telegram metadata or generateFilename fallback
 * - Progress output on stderr (suppressed with --quiet)
 *
 * Returns DownloadResult for single, { files, downloaded, failed } for batch.
 */
export async function mediaDownloadAction(this: Command): Promise<void> {
  const chat = this.args[0];
  const rawIds = this.args[1];
  const opts = this.optsWithGlobals() as GlobalOptions & { output?: string; force?: boolean };
  const { quiet } = opts;
  const context = getDaemonContext();
  if (context && (!context.cwd || !isAbsolute(context.cwd))) {
    outputError('Media commands through the daemon require an absolute cwd', ErrorCode.INVALID_OPTIONS);
    return;
  }
  const cwd = context?.cwd ?? process.cwd();

  let messageIds: number[];
  try {
    messageIds = parseMessageIds(rawIds);
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
    return;
  }

  const isBatch = messageIds.length > 1;

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, chat);
    const results: DownloadResult[] = [];
    const failed: { messageId: number; error: string; code: string }[] = [];

    const downloadOne = async (msgId: number): Promise<DownloadResult> => {
      const messages = await client.getMessages(entity, { ids: [msgId] });
      const msg = messages[0];

      if (!msg || !msg.media) {
        throw new TgError(
          `Message ${msgId} has no downloadable media`,
          ErrorCode.NO_MEDIA,
        );
      }

      const { mediaType } = detectMedia((msg as any).media);
      if (!mediaType || !DOWNLOADABLE.has(mediaType)) {
        throw new TgError(
          `Message ${msgId} has no downloadable media`,
          ErrorCode.NO_MEDIA,
        );
      }

      const mediaInfo = extractMediaInfo((msg as any).media);
      const rawFilename = mediaInfo?.filename;
      const filename = rawFilename
        ? basename(rawFilename)
        : generateFilename(mediaType, msgId, mediaInfo?.mimeType ?? null);

      let targetPath: string;
      if (opts.output) {
        if (isBatch) {
          targetPath = resolve(cwd, opts.output, filename);
        } else {
          targetPath = resolve(cwd, opts.output);
        }
      } else {
        targetPath = resolve(cwd, filename);
      }

      const allowedDir = opts.output ? resolve(cwd, opts.output) : cwd;
      const baseDir = isBatch || !opts.output ? allowedDir : resolve(allowedDir, '..');
      if (targetPath !== baseDir && !targetPath.startsWith(baseDir + sep)) {
        throw new TgError(
          `Path traversal detected: ${targetPath} is outside ${baseDir}`,
          ErrorCode.PATH_TRAVERSAL,
        );
      }

      if (existsSync(targetPath) && !opts.force) {
        throw new TgError(
          `File exists: ${targetPath} (use --force to overwrite)`,
          ErrorCode.FILE_EXISTS,
        );
      }

      let lastProgressTime = 0;
      await client.downloadMedia(msg as any, {
        outputFile: targetPath,
        progressCallback: (downloaded: any, total: any) => {
          const now = Date.now();
          if (now - lastProgressTime < 1000) return;
          lastProgressTime = now;
          const dl = typeof downloaded?.toJSNumber === 'function'
            ? downloaded.toJSNumber() : Number(downloaded);
          const tot = typeof total?.toJSNumber === 'function'
            ? total.toJSNumber() : Number(total);
          const pct = tot > 0 ? Math.round((dl / tot) * 100) : 0;
          logStatus(
            `Downloading ${filename}: ${pct}% (${formatBytes(dl)}/${formatBytes(tot)})`,
            quiet,
          );
        },
      });

      const savedFilename = (!isBatch && opts.output)
        ? basename(targetPath)
        : filename;

      return {
        path: targetPath,
        filename: savedFilename,
        size: mediaInfo?.fileSize ?? 0,
        mediaType,
        messageId: msgId,
      };
    };

    for (const msgId of messageIds) {
      try {
        results.push(await downloadOne(msgId));
      } catch (err: unknown) {
        if (!isBatch) throw err;
        const { message, code } = formatError(err);
        failed.push({
          messageId: msgId,
          error: message,
          code: code ?? ErrorCode.UNKNOWN_ERROR,
        });
      }
    }

    if (isBatch) {
      outputSuccess({ files: results, downloaded: results.length, failed });
    } else {
      outputSuccess(results[0]);
    }
  });
}
