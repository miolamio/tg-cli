import { Command } from 'commander';
import { exportAction } from './export.js';
import { importAction } from './import.js';

/**
 * Create the `session` command group with export and import subcommands.
 *
 * Usage:
 *   tg session export  - Export session string for portability
 *   tg session import  - Import a session string (argument or stdin pipe)
 */
export function createSessionCommand(): Command {
  const session = new Command('session')
    .description('Session management commands');

  session
    .command('export')
    .description('Export session string for portability')
    .action(exportAction);

  session
    .command('import')
    .argument('[session]', 'Session string to import')
    .option('--skip-verify', 'Skip session validation via Telegram API')
    .description('Import a session string')
    .action(importAction);

  return session;
}
