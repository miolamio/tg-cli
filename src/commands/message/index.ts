import { Command } from 'commander';
import { messageHistoryAction } from './history.js';
import { messageSearchAction } from './search.js';
import { messageSendAction } from './send.js';
import { messageForwardAction } from './forward.js';
import { messageReactAction } from './react.js';
import { messageRepliesAction } from './replies.js';

/**
 * Create the `message` command group with history, search, send, forward, and react subcommands.
 *
 * Usage:
 *   tg message history <chat>               - Read message history from a chat
 *   tg message search                        - Search messages by keyword
 *   tg message send <chat> <text>            - Send a text message
 *   tg message forward <from> <ids> <to>     - Forward messages between chats
 *   tg message react <chat> <id> <emoji>     - React to a message
 *   tg message replies <channel> <msg-ids>   - Read replies/comments on channel posts (comma-separated)
 */
export function createMessageCommand(): Command {
  const message = new Command('message')
    .description('Message reading, sending, and interaction');

  message
    .command('history')
    .argument('<chat>', 'Chat ID, username, or @username')
    .description('Read message history from a chat')
    .option('--limit <n>', 'Max messages', '50')
    .option('--offset <n>', 'Skip messages', '0')
    .option('--since <date>', 'Messages after this date (ISO 8601)')
    .option('--until <date>', 'Messages before this date (ISO 8601)')
    .option('--topic <topicId>', 'Forum topic ID')
    .action(messageHistoryAction);

  message
    .command('search')
    .description('Search messages by keyword or media type')
    .option('--chat <chat>', 'Search in specific chat or comma-separated chats (omit for global search)')
    .option('--query <text>', 'Search query')
    .option('--filter <type>', 'Filter by type (photos|videos|documents|urls|voice|music|gifs|round|photo_video|round_voice|chat_photos|phone_calls|mentions|geo|contacts|pinned)')
    .option('--limit <n>', 'Max results', '50')
    .option('--offset <n>', 'Skip results', '0')
    .option('--topic <topicId>', 'Forum topic ID (single --chat only)')
    .addHelpText('after', '\nValid filters: photos, videos, photo_video, documents, urls, gifs, voice, music, round, round_voice, chat_photos, phone_calls, mentions, geo, contacts, pinned')
    .action(messageSearchAction);

  message
    .command('send')
    .argument('<chat>', 'Chat ID, username, or @username')
    .argument('<text>', 'Message text (use - for stdin)')
    .description('Send a text message to a chat')
    .option('--reply-to <msgId>', 'Reply to message ID')
    .option('--topic <topicId>', 'Forum topic ID')
    .action(messageSendAction);

  message
    .command('forward')
    .argument('<from-chat>', 'Source chat')
    .argument('<msg-ids>', 'Message IDs (comma-separated)')
    .argument('<to-chat>', 'Destination chat')
    .description('Forward messages between chats')
    .action(messageForwardAction);

  message
    .command('react')
    .argument('<chat>', 'Chat ID, username, or @username')
    .argument('<msg-id>', 'Message ID')
    .argument('<emoji>', 'Emoji to react with')
    .description('React to a message with an emoji')
    .option('--remove', 'Remove reaction')
    .action(messageReactAction);

  message
    .command('replies')
    .argument('<channel>', 'Channel ID, username, or @username')
    .argument('<msg-ids>', 'Post message IDs (comma-separated for batch)')
    .description('Read replies/comments on channel posts')
    .option('--limit <n>', 'Max replies per post', '50')
    .option('--offset <n>', 'Skip replies', '0')
    .action(messageRepliesAction);

  return message;
}
