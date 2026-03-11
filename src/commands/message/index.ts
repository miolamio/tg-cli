import { Command } from 'commander';
import { messageHistoryAction } from './history.js';
import { messageSearchAction } from './search.js';

/**
 * Create the `message` command group with history and search subcommands.
 *
 * Usage:
 *   tg message history <chat>  - Read message history from a chat
 *   tg message search           - Search messages by keyword
 */
export function createMessageCommand(): Command {
  const message = new Command('message')
    .description('Message reading and search');

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

  return message;
}
