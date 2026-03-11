import { Command } from 'commander';
import { chatListAction } from './list.js';
import { chatInfoAction } from './info.js';
import { chatJoinAction } from './join.js';
import { chatLeaveAction } from './leave.js';
import { chatResolveAction } from './resolve.js';
import { chatInviteInfoAction } from './invite-info.js';
import { chatMembersAction } from './members.js';

/**
 * Create the `chat` command group with 7 subcommands for chat discovery and management.
 *
 * Usage:
 *   tg chat list             - List all chats/dialogs
 *   tg chat info <chat>      - Get detailed chat info
 *   tg chat join <target>    - Join a group or channel
 *   tg chat leave <chat>     - Leave a group or channel
 *   tg chat resolve <input>  - Resolve a peer to entity info
 *   tg chat invite-info <link> - Check invite link info without joining
 *   tg chat members <chat>   - List members of a group/channel
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

  return chat;
}
