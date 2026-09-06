import { Command, CommanderError } from 'commander';
import type { TelegramClient } from 'telegram';
import { createChatCommand } from '../../commands/chat/index.js';
import { createMessageCommand } from '../../commands/message/index.js';
import { createMediaCommand } from '../../commands/media/index.js';
import { createUserCommand } from '../../commands/user/index.js';
import { createContactCommand } from '../../commands/contact/index.js';
import { outputError } from '../output.js';
import { TgError, translateTelegramError } from '../errors.js';
import { ErrorCode } from '../error-codes.js';
import { isDaemonCommand, validateDaemonCommand, type DaemonExecutionResult } from './command-protocol.js';
import { runWithDaemonContext, type DaemonExecutionContext } from './execution-context.js';

export type { DaemonExecutionResult } from './command-protocol.js';

/** Fresh Commander instances isolate arguments/defaults across API requests. */
function createExecutionProgram(profile: string): Command {
  const program = new Command('tg');
  program.setOptionValue('profile', profile).setOptionValue('quiet', true)
    .setOptionValue('json', true).setOptionValue('daemon', false);
  for (const group of [createChatCommand(), createMessageCommand(), createMediaCommand(), createUserCommand(), createContactCommand()]) {
    program.addCommand(group);
  }
  program.hook('preAction', (_program, action) => {
    if (!isDaemonCommand([action.parent?.name() ?? '', action.name()])) {
      throw new TgError('This action is not available through execute', ErrorCode.DAEMON_PROXY_UNAVAILABLE);
    }
  });
  const configure = (command: Command) => {
    command.exitOverride().helpOption(false).addHelpCommand(false).allowExcessArguments(false);
    command.configureOutput({ writeOut: () => {}, writeErr: () => {}, outputError: () => {} });
    for (const child of command.commands) configure(child);
  };
  configure(program);
  return program;
}

/** Run known handlers on the daemon's client, capturing DTOs rather than stdout. */
export async function executeDaemonCommand(
  client: TelegramClient,
  profile: string,
  params: Record<string, unknown>,
  signal: AbortSignal,
): Promise<DaemonExecutionResult> {
  const context: DaemonExecutionContext = { client, profile, signal, exitCode: 0 };
  return runWithDaemonContext(context, async () => {
    try {
      signal.throwIfAborted();
      const request = validateDaemonCommand(params);
      context.stdin = request.stdin;
      context.cwd = request.cwd;
      await createExecutionProgram(profile).parseAsync(request.argv, { from: 'user' });
      signal.throwIfAborted();
      if (!context.output) outputError('Command completed without a result', ErrorCode.UNKNOWN_ERROR);
    } catch (error) {
      const formatted = translateTelegramError(error);
      outputError(formatted.message, error instanceof CommanderError ? ErrorCode.INVALID_OPTIONS : formatted.code);
    }
    if (signal.aborted) {
      const { message, code } = translateTelegramError(signal.reason);
      return { output: { ok: false, error: message, code }, exitCode: 1 };
    }
    return { output: context.output!, exitCode: context.exitCode };
  });
}
