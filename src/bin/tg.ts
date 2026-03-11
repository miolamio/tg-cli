import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createAuthCommand } from '../commands/auth/index.js';
import { createSessionCommand } from '../commands/session/index.js';
import { createChatCommand } from '../commands/chat/index.js';
import { createMessageCommand } from '../commands/message/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package version and gramjs version for --version output
let pkgVersion = '0.0.0';
let gramjsVersion = 'unknown';
try {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'),
  );
  pkgVersion = pkg.version;
} catch {}
try {
  const gramjsPkg = JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', 'node_modules', 'telegram', 'package.json'),
      'utf-8',
    ),
  );
  gramjsVersion = gramjsPkg.version;
} catch {}
const versionString = `${pkgVersion} (gramjs ${gramjsVersion})`;

// Create root program
const program = new Command()
  .name('tg')
  .description('Telegram CLI - Agent-first Telegram client')
  .version(versionString, '-V, --version');

// Global options available on all commands via optsWithGlobals()
program
  .option('--json', 'JSON output (default)', true)
  .option('--human', 'Human-readable output')
  .option('-v, --verbose', 'Show extra info')
  .option('-q, --quiet', 'Suppress stderr output')
  .option('--profile <name>', 'Named profile', 'default')
  .option('--config <path>', 'Config file path');

// Global options are parsed at any position in the command line

// Wire command groups with help group headings
const authCmd = createAuthCommand();
authCmd.helpGroup('Auth');
program.addCommand(authCmd);

const sessionCmd = createSessionCommand();
sessionCmd.helpGroup('Session');
program.addCommand(sessionCmd);

const chatCmd = createChatCommand();
chatCmd.helpGroup('Chat');
program.addCommand(chatCmd);

const messageCmd = createMessageCommand();
messageCmd.helpGroup('Message');
program.addCommand(messageCmd);

// Aliases (Phase 2+): tg ls -> chat list, tg s -> message search

// Handle unknown commands: show help
program.on('command:*', () => {
  program.outputHelp();
  process.exit(1);
});

program.parse();
