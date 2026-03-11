import { Command } from 'commander';
import { loginAction } from './login.js';
import { statusAction } from './status.js';
import { logoutAction } from './logout.js';

/**
 * Create the `auth` command group with login, status, and logout subcommands.
 *
 * Usage:
 *   tg auth login   - Log in with phone number + code + optional 2FA
 *   tg auth status  - Check current authentication status
 *   tg auth logout  - Log out and destroy session
 */
export function createAuthCommand(): Command {
  const auth = new Command('auth')
    .description('Authentication commands');

  auth
    .command('login')
    .description('Log in with phone number + code + optional 2FA')
    .action(loginAction);

  auth
    .command('status')
    .description('Check current authentication status')
    .action(statusAction);

  auth
    .command('logout')
    .description('Log out and destroy session')
    .action(logoutAction);

  return auth;
}
