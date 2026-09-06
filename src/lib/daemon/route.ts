import type { Command } from 'commander';
import { createConfig } from '../config.js';
import { outputError, outputSuccess } from '../output.js';
import { ErrorCode } from '../error-codes.js';
import { TgError, formatError } from '../errors.js';
import { DaemonPaths } from './pid.js';
import { DaemonClient, DaemonRpcError } from './client.js';
import { daemonPidAlive } from './guard.js';
import { isDaemonCommand, type DaemonCommandRequest } from './command-protocol.js';
import { MAX_FRAME_BYTES } from './frames.js';

/** Stop Commander before the local action once its remote result is rendered. */
export class DaemonCommandHandled extends Error {}

export function commandPath(command: Command): string[] {
  const path: string[] = [];
  for (let current: Command | null = command; current?.parent; current = current.parent) path.unshift(current.name());
  return path;
}

/** Re-encode parsed values as argv, preserving positional dashes and repeated options. */
export function daemonRequestForCommand(command: Command): DaemonCommandRequest {
  const argv = commandPath(command);
  const opts = command.opts();
  for (const option of command.options) {
    const value = opts[option.attributeName()];
    if (value === undefined || !option.long) continue;
    if (option.negate) {
      if (value === false) argv.push(option.long);
    } else if (option.required || option.optional) {
      for (const entry of Array.isArray(value) ? value : [value]) argv.push(`${option.long}=${String(entry)}`);
    } else if (value === true) argv.push(option.long);
  }
  const args = command.processedArgs.flatMap(arg => Array.isArray(arg) ? arg : [arg])
    .filter(arg => arg !== undefined).map(String);
  if (args.length) argv.push('--', ...args);
  return { argv, cwd: process.cwd() };
}

async function readRequestStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new TgError('"-" requires piped message input', ErrorCode.STDIN_REQUIRED);
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_FRAME_BYTES - 4096) throw new TgError('Piped message exceeds the daemon frame limit', ErrorCode.MESSAGE_TOO_LONG);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Route supported --daemon actions once; never fall back to a direct session. */
export async function routeThroughDaemon(command: Command): Promise<boolean> {
  const opts = command.optsWithGlobals();
  const path = commandPath(command);
  if (!opts.daemon || !isDaemonCommand(path)) return false;
  let daemon: DaemonClient | undefined;
  try {
    const config = createConfig(opts.config);
    const configDir = config.path.replace(/[/\\][^/\\]+$/, '');
    const paths = new DaemonPaths(configDir, opts.profile);
    if (!paths.socketExists()) {
      throw new TgError(daemonPidAlive(paths) ? 'Daemon is starting or not responding' : 'Daemon is not running. Start one with: tg daemon start',
        daemonPidAlive(paths) ? ErrorCode.DAEMON_CONNECTION_FAILED : ErrorCode.DAEMON_NOT_RUNNING);
    }
    const request = daemonRequestForCommand(command);
    const textIndex = path[0] === 'message' ? path[1] === 'send' ? 1 : path[1] === 'edit' ? 2 : -1 : -1;
    if (textIndex >= 0 && command.processedArgs[textIndex] === '-') request.stdin = await readRequestStdin();
    daemon = new DaemonClient(paths.socketPath);
    const result = await daemon.execute(request.argv, request);
    if (result.output.ok) outputSuccess(result.output.data);
    else outputError(result.output.error, result.output.code);
    if (result.exitCode !== 0) process.exitCode = result.exitCode;
  } catch (error) {
    if (error instanceof DaemonRpcError) {
      if (error.code === -32601) {
        outputError('Running daemon does not support execute. Restart it with the current tg binary.', ErrorCode.DAEMON_PROXY_UNAVAILABLE);
      } else {
        const data = error.data as { tgCode?: unknown } | undefined;
        outputError(error.message, typeof data?.tgCode === 'string' ? data.tgCode : ErrorCode.DAEMON_CONNECTION_FAILED);
      }
    } else {
      const { message, code } = formatError(error);
      outputError(message, code ?? ErrorCode.DAEMON_CONNECTION_FAILED);
    }
  } finally {
    daemon?.close();
  }
  return true;
}
