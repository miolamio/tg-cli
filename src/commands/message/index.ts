import { Command } from 'commander';
import { messageHistoryAction } from './history.js';
import { messageSearchAction } from './search.js';
import { messageSendAction } from './send.js';
import { messageForwardAction } from './forward.js';
import { messageReactAction } from './react.js';
import { messageRepliesAction } from './replies.js';
import { messageGetAction } from './get.js';
import { messagePinnedAction } from './pinned.js';
import { messageEditAction } from './edit.js';
import { messageDeleteAction } from './delete.js';
import { messagePinAction } from './pin.js';
import { messageUnpinAction } from './unpin.js';
import { messagePollAction } from './poll.js';
import { messageWatchAction } from './watch.js';

/**
 * Create the `message` command group with history, search, get, pinned, send, forward, react, replies,
 * edit, delete, pin, unpin, poll, and watch subcommands.
 *
 * Usage:
 *   tg message history <chat>               - Read message history from a chat
 *   tg message search                        - Search messages by keyword
 *   tg message get <chat> <ids>             - Get specific messages by ID (comma-separated, max 100)
 *   tg message pinned <chat>                - Get pinned messages from a chat
 *   tg message send <chat> <text>            - Send a text message
 *   tg message forward <from> <ids> <to>     - Forward messages between chats
 *   tg message react <chat> <id> <emoji>     - React to a message
 *   tg message replies <channel> <msg-ids>   - Read replies/comments on channel posts (comma-separated)
 *   tg message edit <chat> <id> <text>       - Edit a sent message
 *   tg message delete <chat> <ids>           - Delete messages (--revoke or --for-me required)
 *   tg message pin <chat> <id>              - Pin a message (silent by default)
 *   tg message unpin <chat> <id>            - Unpin a message
 *   tg message poll <chat>                  - Send a poll to a chat
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
    .command('get')
    .argument('<chat>', 'Chat ID, username, or @username')
    .argument('<ids>', 'Message IDs (comma-separated, max 100)')
    .description('Get specific messages by ID')
    .action(messageGetAction);

  message
    .command('pinned')
    .argument('<chat>', 'Chat ID, username, or @username')
    .description('Get pinned messages from a chat')
    .option('--limit <n>', 'Max messages', '50')
    .option('--offset <n>', 'Skip messages', '0')
    .action(messagePinnedAction);

  message
    .command('send')
    .argument('<chat>', 'Chat ID, username, or @username')
    .argument('<text>', 'Message text (use - for stdin)')
    .description('Send a text message to a chat')
    .option('--reply-to <msgId>', 'Reply to message ID')
    .option('--topic <topicId>', 'Forum topic ID')
    .option('--comment-to <postId>', 'Comment on a channel post')
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

  message
    .command('edit')
    .argument('<chat>', 'Chat ID, username, or @username')
    .argument('<msg-id>', 'Message ID')
    .argument('<text>', 'New message text (use - for stdin)')
    .description('Edit a sent message')
    .action(messageEditAction);

  message
    .command('delete')
    .argument('<chat>', 'Chat ID, username, or @username')
    .argument('<ids>', 'Message IDs (comma-separated, max 100)')
    .description('Delete messages')
    .option('--revoke', 'Delete for everyone')
    .option('--for-me', 'Delete only for self')
    .action(messageDeleteAction);

  message
    .command('pin')
    .argument('<chat>', 'Chat ID, username, or @username')
    .argument('<msg-id>', 'Message ID')
    .description('Pin a message in a chat')
    .option('--notify', 'Notify members (silent by default)')
    .action(messagePinAction);

  message
    .command('unpin')
    .argument('<chat>', 'Chat ID, username, or @username')
    .argument('<msg-id>', 'Message ID')
    .description('Unpin a message from a chat')
    .action(messageUnpinAction);

  message
    .command('poll')
    .argument('<chat>', 'Chat ID, username, or @username')
    .description('Send a poll to a chat')
    .requiredOption('--question <text>', 'Poll question (max 300 chars)')
    .option('--option <text>', 'Poll option (repeat 2-10 times)', collect, [])
    .option('--quiz', 'Quiz mode (one correct answer)')
    .option('--correct <index>', 'Correct answer index, 1-based (requires --quiz)')
    .option('--solution <text>', 'Solution explanation (requires --quiz)')
    .option('--multiple', 'Allow multiple choices')
    .option('--public', 'Show voter names (non-anonymous)')
    .option('--close-in <seconds>', 'Auto-close after N seconds')
    .action(messagePollAction);

  message
    .command('watch')
    .argument('<chat>', 'Chat ID, username, or @username')
    .description('Watch for new messages in real-time (requires daemon)')
    .option('--topic <topicId>', 'Forum topic ID')
    .action(messageWatchAction);

  return message;
}

/**
 * Commander repeatable option accumulator.
 * Used for --option flags that can be specified multiple times.
 */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
