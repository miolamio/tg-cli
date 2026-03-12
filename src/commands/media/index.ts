import { Command } from 'commander';
import { mediaDownloadAction } from './download.js';
import { mediaSendAction } from './send.js';

/**
 * Create the `media` command group with download and send subcommands.
 *
 * Usage:
 *   tg media download <chat> <msg-ids>  - Download media from messages
 *   tg media send <chat> <files...>     - Upload and send files to a chat
 */
export function createMediaCommand(): Command {
  const media = new Command('media')
    .description('Download and upload media files');

  media
    .command('download')
    .argument('<chat>', 'Chat ID, username, or @username')
    .argument('<msg-ids>', 'Message ID(s), comma-separated for batch')
    .description('Download media from messages')
    .option('-o, --output <path>', 'Output path (file for single, directory for batch)')
    .action(mediaDownloadAction);

  media
    .command('send')
    .argument('<chat>', 'Chat ID, username, or @username')
    .argument('<files...>', 'File path(s) to send (multiple = album)')
    .description('Upload and send files to a chat')
    .option('--caption <text>', 'Caption for the media')
    .option('--reply-to <msgId>', 'Reply to message ID')
    .option('--topic <topicId>', 'Forum topic ID')
    .action(mediaSendAction);

  return media;
}
