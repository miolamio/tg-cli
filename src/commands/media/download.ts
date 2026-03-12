import type { Command } from 'commander';
import { resolve } from 'node:path';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { TgError, formatError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { extractMediaInfo, detectMedia } from '../../lib/serialize.js';
import { generateFilename, formatBytes } from '../../lib/media-utils.js';
import type { GlobalOptions, DownloadResult } from '../../lib/types.js';

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
 * Returns DownloadResult for single, { files, downloaded } for batch.
 */
export async function mediaDownloadAction(this: Command): Promise<void> {
  const chat = this.args[0];
  const rawIds = this.args[1];
  const opts = this.optsWithGlobals() as GlobalOptions & { output?: string };
  const { profile, quiet } = opts;

  // Parse comma-separated message IDs
  const messageIds = rawIds.split(',').map((s: string) => {
    const id = parseInt(s.trim(), 10);
    if (isNaN(id)) {
      throw new TgError(`Invalid message ID: ${s}`, 'INVALID_ID');
    }
    return id;
  });

  const isBatch = messageIds.length > 1;
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
        const results: DownloadResult[] = [];

        for (const msgId of messageIds) {
          const messages = await client.getMessages(entity, { ids: [msgId] });
          const msg = messages[0];

          if (!msg || !msg.media) {
            throw new TgError(
              `Message ${msgId} has no downloadable media`,
              'NO_MEDIA',
            );
          }

          const { mediaType } = detectMedia((msg as any).media);
          if (!mediaType) {
            throw new TgError(
              `Message ${msgId} has no downloadable media`,
              'NO_MEDIA',
            );
          }

          const mediaInfo = extractMediaInfo((msg as any).media);
          const filename = mediaInfo?.filename
            ?? generateFilename(mediaType, msgId, mediaInfo?.mimeType ?? null);

          // Determine target path
          let targetPath: string;
          if (opts.output) {
            if (isBatch) {
              // Batch: -o is directory, auto-name inside
              targetPath = resolve(opts.output, filename);
            } else {
              // Single: -o is the file path
              targetPath = resolve(opts.output);
            }
          } else {
            targetPath = resolve(process.cwd(), filename);
          }

          // Download with progress
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

          results.push({
            path: targetPath,
            filename,
            size: mediaInfo?.fileSize ?? 0,
            mediaType,
            messageId: msgId,
          });
        }

        if (isBatch) {
          outputSuccess({ files: results, downloaded: results.length });
        } else {
          outputSuccess(results[0]);
        }
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
