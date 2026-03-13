import { Command } from 'commander';
import { userProfileAction } from './profile.js';
import { userBlockAction } from './block.js';
import { userUnblockAction } from './unblock.js';
import { userBlockedAction } from './blocked.js';

/**
 * Create the `user` command group with profile, block, unblock, blocked subcommands.
 *
 * Usage:
 *   tg user profile <users>    - Get detailed user profile(s) (comma-separated)
 *   tg user block <user>       - Block a user
 *   tg user unblock <user>     - Unblock a user
 *   tg user blocked            - List blocked users (--limit, --offset)
 */
export function createUserCommand(): Command {
  const user = new Command('user')
    .description('User profiles and block management');

  user.command('profile')
    .argument('<users>', 'User ID(s) or username(s), comma-separated')
    .description('Get detailed user profile(s)')
    .action(userProfileAction);

  user.command('block')
    .argument('<user>', 'User ID or username')
    .description('Block a user')
    .action(userBlockAction);

  user.command('unblock')
    .argument('<user>', 'User ID or username')
    .description('Unblock a user')
    .action(userUnblockAction);

  user.command('blocked')
    .description('List blocked users')
    .option('--limit <n>', 'Max results', '50')
    .option('--offset <n>', 'Skip results', '0')
    .action(userBlockedAction);

  return user;
}
