import { Command } from 'commander';
import { messageHistoryAction } from './history.js';
import { messageSearchAction } from './search.js';
import { messageSendAction } from './send.js';
import { messageForwardAction } from './forward.js';
import { messageReactAction } from './react.js';

/**
 * Create the `message` command group with history, search, send, forward, and react subcommands.
 *
 * Usage:
 *   tg message history <chat>               - Read message history from a chat
 *   tg message search                        - Search messages by keyword
 *   tg message send <chat> <text>            - Send a text message
 *   tg message forward <from> <ids> <to>     - Forward messages between chats
 *   tg message react <chat> <id> <emoji>     - React to a message
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
    .action(messageHistoryAction);

  message
    .command('search')
    .description('Search messages by keyword')
    .option('--chat <chat>', 'Search in specific chat (omit for global search)')
    .requiredOption('--query <text>', 'Search query (required)')
    .option('--limit <n>', 'Max results', '50')
    .option('--offset <n>', 'Skip results', '0')
    .action(messageSearchAction);

  message
    .command('send')
    .argument('<chat>', 'Chat ID, username, or @username')
    .argument('<text>', 'Message text (use - for stdin)')
    .description('Send a text message to a chat')
    .option('--reply-to <msgId>', 'Reply to message ID')
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

  return message;
}
