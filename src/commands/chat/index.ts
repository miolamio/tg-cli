import { Command } from 'commander';
import { chatListAction } from './list.js';
import { chatInfoAction } from './info.js';
import { chatJoinAction } from './join.js';
import { chatLeaveAction } from './leave.js';
import { chatResolveAction } from './resolve.js';
import { chatInviteInfoAction } from './invite-info.js';
import { chatMembersAction } from './members.js';
import { chatTopicsAction } from './topics.js';
import { chatSearchAction } from './search.js';
import { chatCreateAction } from './create.js';
import { chatEditAction } from './edit.js';
import { chatKickAction } from './kick.js';

/**
 * Create the `chat` command group with 8 subcommands for chat discovery and management.
 *
 * Usage:
 *   tg chat list             - List all chats/dialogs
 *   tg chat info <chat>      - Get detailed chat info
 *   tg chat join <target>    - Join a group or channel
 *   tg chat leave <chat>     - Leave a group or channel
 *   tg chat resolve <input>  - Resolve a peer to entity info
 *   tg chat invite-info <link> - Check invite link info without joining
 *   tg chat members <chat>   - List members of a group/channel
 *   tg chat topics <chat>    - List forum topics in a supergroup
 */
export function createChatCommand(): Command {
  const chat = new Command('chat')
    .description('Chat discovery and management');

  chat
    .command('list')
    .description('List all chats/dialogs')
    .option('--type <type>', 'Filter by type: user, group, channel, supergroup')
    .option('--limit <n>', 'Max results', '50')
    .option('--offset <n>', 'Skip results', '0')
    .action(chatListAction);

  chat
    .command('info')
    .argument('<chat>', 'Chat ID, username, or @username')
    .description('Get detailed chat info')
    .action(chatInfoAction);

  chat
    .command('join')
    .argument('<target>', 'Username, @username, or invite link')
    .description('Join a group or channel')
    .action(chatJoinAction);

  chat
    .command('leave')
    .argument('<chat>', 'Chat ID, username, or @username')
    .description('Leave a group or channel')
    .action(chatLeaveAction);

  chat
    .command('resolve')
    .argument('<input>', 'Username, ID, or phone number')
    .description('Resolve a peer to entity info')
    .action(chatResolveAction);

  chat
    .command('invite-info')
    .argument('<link>', 'Invite link (t.me/+HASH)')
    .description('Check invite link info without joining')
    .action(chatInviteInfoAction);

  chat
    .command('members')
    .argument('<chat>', 'Chat ID, username, or @username')
    .description('List members of a group/channel')
    .option('--limit <n>', 'Max results', '50')
    .option('--offset <n>', 'Skip results', '0')
    .option('--search <query>', 'Filter members by name')
    .action(chatMembersAction);

  chat
    .command('topics')
    .argument('<chat>', 'Chat ID, username, or @username')
    .description('List forum topics in a supergroup')
    .option('--limit <n>', 'Max topics', '50')
    .option('--offset <n>', 'Skip topics', '0')
    .action(chatTopicsAction);

  chat
    .command('search')
    .argument('<query>', 'Search query')
    .description('Search for public channels and groups globally')
    .option('--limit <n>', 'Max results', '20')
    .action(chatSearchAction);

  chat
    .command('create')
    .argument('<title>', 'Chat title')
    .description('Create a new group, supergroup, or channel')
    .option('--type <type>', 'Chat type: group, supergroup, channel', 'supergroup')
    .option('--description <text>', 'Chat description')
    .action(chatCreateAction);

  chat
    .command('edit')
    .argument('<chat>', 'Chat ID, username, or @username')
    .description('Edit chat title or description')
    .option('--title <text>', 'New title')
    .option('--description <text>', 'New description')
    .action(chatEditAction);

  chat
    .command('kick')
    .argument('<chat>', 'Chat ID, username, or @username')
    .argument('<user>', 'User ID, username, or @username')
    .description('Kick a user from a group or channel')
    .action(chatKickAction);

  return chat;
}
