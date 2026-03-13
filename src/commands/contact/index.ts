import { Command } from 'commander';
import { contactListAction } from './list.js';
import { contactAddAction } from './add.js';
import { contactDeleteAction } from './delete.js';
import { contactSearchAction } from './search.js';

/**
 * Create the `contact` command group with list, add, delete, search subcommands.
 *
 * Usage:
 *   tg contact list               - List all contacts (--limit, --offset)
 *   tg contact add <input>        - Add a contact by username/ID or phone (--first-name, --last-name)
 *   tg contact delete <user>      - Delete a contact
 *   tg contact search <query>     - Search contacts (--global, --limit)
 */
export function createContactCommand(): Command {
  const contact = new Command('contact')
    .description('Contact management: list, add, delete, search');

  contact.command('list')
    .description('List all contacts')
    .option('--limit <n>', 'Max results', '50')
    .option('--offset <n>', 'Skip results', '0')
    .action(contactListAction);

  contact.command('add')
    .argument('<input>', 'Username, user ID, or phone number')
    .description('Add a contact')
    .option('--first-name <name>', 'First name (required for phone)')
    .option('--last-name <name>', 'Last name')
    .action(contactAddAction);

  contact.command('delete')
    .argument('<user>', 'Username or user ID')
    .description('Delete a contact')
    .action(contactDeleteAction);

  contact.command('search')
    .argument('<query>', 'Search query')
    .description('Search contacts')
    .option('--global', 'Include non-contact Telegram users')
    .option('--limit <n>', 'Max results', '20')
    .action(contactSearchAction);

  return contact;
}
