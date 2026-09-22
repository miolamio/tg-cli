import { Command } from 'commander';
import { exportAction } from './export.js';
import { importAction } from './import.js';
import { importDesktopAction } from './import-desktop.js';

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

  session
    .command('import-desktop')
    .argument('<tdata>', 'Official Telegram Desktop tdata directory (read only)')
    .option('--desktop-closed', 'Confirm Desktop and all other clients using this authorization are closed')
    .option('--account <index>', 'Stored Desktop account index (listed when selection is ambiguous)')
    .option('--ask-passcode', 'Prompt secretly for the Desktop local passcode in a terminal')
    .description('Import a selected Desktop account into a new --profile and verify it online')
    .action(importDesktopAction);

  return session;
}
