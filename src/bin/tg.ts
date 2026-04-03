import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createAuthCommand } from '../commands/auth/index.js';
import { createSessionCommand } from '../commands/session/index.js';
import { createChatCommand } from '../commands/chat/index.js';
import { createMessageCommand } from '../commands/message/index.js';
import { createMediaCommand } from '../commands/media/index.js';
import { createUserCommand } from '../commands/user/index.js';
import { createContactCommand } from '../commands/contact/index.js';
import { createDaemonCommand } from '../commands/daemon/index.js';
import { setOutputMode, setJsonlMode, setToonMode, setFieldSelection, outputError } from '../lib/output.js';
import { ErrorCode } from '../lib/error-codes.js';

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
  .option('--no-json', 'Human-readable output (alias for --human)')
  .option('--human', 'Human-readable output')
  .option('-v, --verbose', 'Show extra info')
  .option('-q, --quiet', 'Suppress stderr output')
  .option('--profile <name>', 'Named profile', 'default')
  .option('--config <path>', 'Config file path')
  .option('--fields <fields>', 'Select output fields (comma-separated, dot notation for nested)')
  .option('--jsonl', 'Output one JSON object per line (list commands only)')
  .option('--toon', 'Token-efficient TOON output (LLM-optimized)')
  .option('--daemon', 'Route command through persistent daemon connection');

// Global options are parsed at any position in the command line

// Set output mode before any action runs based on --human or --no-json flags
program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  const isHuman = opts.human === true || opts.json === false;
  setOutputMode(isHuman);

  // --toon mutual exclusion checks
  if (opts.toon && isHuman) {
    outputError('--toon and --human are mutually exclusive', ErrorCode.INVALID_OPTIONS);
    process.exit(1);
  }
  if (opts.toon && opts.jsonl) {
    outputError('--toon and --jsonl are mutually exclusive', ErrorCode.INVALID_OPTIONS);
    process.exit(1);
  }
  if (opts.toon) setToonMode(true);

  // --jsonl and --human are mutually exclusive
  if (opts.jsonl && isHuman) {
    outputError('--jsonl and --human are mutually exclusive', ErrorCode.INVALID_OPTIONS);
    process.exit(1);
  }

  if (opts.jsonl) setJsonlMode(true);
  if (opts.fields) setFieldSelection(opts.fields.split(',').map((f: string) => f.trim()));
});

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

const mediaCmd = createMediaCommand();
mediaCmd.helpGroup('Media');
program.addCommand(mediaCmd);

const userCmd = createUserCommand();
userCmd.helpGroup('User');
program.addCommand(userCmd);

const contactCmd = createContactCommand();
contactCmd.helpGroup('Contact');
program.addCommand(contactCmd);

const daemonCmd = createDaemonCommand();
daemonCmd.helpGroup('Daemon');
program.addCommand(daemonCmd);

// Aliases (Phase 2+): tg ls -> chat list, tg s -> message search

// Handle unknown commands: show help
program.on('command:*', () => {
  program.outputHelp();
  process.exit(1);
});

program.parse();
