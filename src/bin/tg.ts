import { Command, CommanderError } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createAuthCommand } from '../commands/auth/index.js';
import { createSessionCommand } from '../commands/session/index.js';
import { createChatCommand } from '../commands/chat/index.js';
import { createMessageCommand } from '../commands/message/index.js';
import { createMediaCommand } from '../commands/media/index.js';
import { createUserCommand } from '../commands/user/index.js';
import { createContactCommand } from '../commands/contact/index.js';
import { createDaemonCommand } from '../commands/daemon/index.js';
import { createCompletionCommand } from '../commands/completion/index.js';
import { setOutputMode, setJsonlMode, setToonMode, setFieldSelection, outputError } from '../lib/output.js';
import { setQuietMode, setVerboseMode } from '../lib/cli-mode.js';
import { ErrorCode } from '../lib/error-codes.js';
import { validateProfile } from '../lib/validate.js';
import { validateTransport } from '../lib/transport.js';
import { formatError, TgError } from '../lib/errors.js';
import { installCliConsoleGuard } from '../lib/cli-console.js';
import { DaemonCommandHandled, routeThroughDaemon } from '../lib/daemon/route.js';
import { formatHelpBanner } from '../lib/branding.js';

installCliConsoleGuard();

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
      createRequire(import.meta.url).resolve('telegram/package.json'),
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
  .option('--transport <mode>', 'Telegram transport: tcp or wss (default: saved profile or tcp)')
  .option('--fields <fields>', 'Select output fields (comma-separated, dot notation for nested)')
  .option('--jsonl', 'Output one JSON object per line (list commands only)')
  .option('--toon', 'Token-efficient TOON output (LLM-optimized)')
  .option('--daemon', 'Route command through persistent daemon connection');

program.addHelpText('before', ({ error }) => error ? '' : formatHelpBanner(!!program.opts().quiet));

// Global options are parsed at any position in the command line

// Set output mode before any action runs based on --human or --no-json flags
function configureOutput(): void {
  const opts = program.optsWithGlobals();
  const isHuman = opts.human === true || opts.json === false;
  setOutputMode(isHuman);
  setQuietMode(!!opts.quiet);
  setVerboseMode(!!opts.verbose);
  // Invalid combinations use a deterministic error format.
  setToonMode(!!opts.toon && !isHuman && !opts.jsonl);
  setJsonlMode(!!opts.jsonl && !isHuman && !opts.toon);
  if (opts.fields) setFieldSelection(opts.fields.split(',').map((f: string) => f.trim()));
}

program.hook('preAction', async (thisCommand, actionCommand) => {
  configureOutput();
  const opts = thisCommand.optsWithGlobals();
  validateProfile(opts.profile);
  if (opts.transport !== undefined) {
    validateTransport(opts.transport);
    if (opts.daemon || (actionCommand.name() === 'watch' && actionCommand.parent?.name() === 'message')) {
      throw new TgError('Choose --transport when starting the daemon; commands use its existing connection', ErrorCode.INVALID_OPTIONS);
    }
  }
  const isHuman = opts.human === true || opts.json === false;

  // --toon mutual exclusion checks
  if (opts.toon && isHuman) {
    throw new TgError('--toon and --human are mutually exclusive', ErrorCode.INVALID_OPTIONS);
  }
  if (opts.toon && opts.jsonl) {
    throw new TgError('--toon and --jsonl are mutually exclusive', ErrorCode.INVALID_OPTIONS);
  }

  // --jsonl and --human are mutually exclusive
  if (opts.jsonl && isHuman) {
    throw new TgError('--jsonl and --human are mutually exclusive', ErrorCode.INVALID_OPTIONS);
  }

  if (await routeThroughDaemon(actionCommand)) throw new DaemonCommandHandled();

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

const completionCmd = createCompletionCommand();
completionCmd.helpGroup('Utility');
program.addCommand(completionCmd);

// Groups are constructed separately, so install the exit hook on every level.
// Commander parse errors must use the same output contract as async actions.
function configureCommandErrors(command: Command): void {
  command.exitOverride();
  command.configureOutput({ outputError: () => {} });
  for (const child of command.commands) configureCommandErrors(child);
}
configureCommandErrors(program);

try {
  await program.parseAsync();
} catch (err: unknown) {
  if (err instanceof DaemonCommandHandled) {
    // The daemon result has already been rendered, including its exit status.
  } else if (err instanceof CommanderError && err.exitCode === 0) {
    // Explicit --help and --version have already rendered their normal output.
    process.exitCode = 0;
  } else {
    configureOutput();
    const { message, code } = formatError(err);
    outputError(message, err instanceof CommanderError ? ErrorCode.INVALID_OPTIONS : code ?? ErrorCode.UNKNOWN_ERROR);
  }
}
