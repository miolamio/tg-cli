import type { OutputEnvelope } from '../types.js';
import { TgError } from '../errors.js';
import { ErrorCode } from '../error-codes.js';
import { MAX_FRAME_BYTES } from './frames.js';
import { isAbsolute } from 'node:path';

/** Named CLI operations exposed by execute; lifecycle/auth remain separate. */
export const DAEMON_COMMANDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  chat: Object.freeze(['list', 'info', 'join', 'leave', 'resolve', 'invite-info', 'members', 'topics', 'search', 'create', 'edit', 'kick']),
  message: Object.freeze(['history', 'search', 'get', 'pinned', 'send', 'forward', 'react', 'replies', 'edit', 'delete', 'pin', 'unpin', 'poll']),
  media: Object.freeze(['download', 'send']),
  user: Object.freeze(['profile', 'block', 'unblock', 'blocked', 'download-photo']),
  contact: Object.freeze(['list', 'add', 'delete', 'search', 'set-photo']),
});

export interface DaemonCommandOptions {
  /** Explicit stdin for commands accepting a dash as message text. */
  stdin?: string;
  /** Absolute caller working directory; required for media operations. */
  cwd?: string;
  /** Server deadline, 1–120000 ms. A timed-out send may already have happened. */
  timeoutMs?: number;
}

export interface DaemonCommandRequest extends DaemonCommandOptions {
  /** Command group, action and CLI arguments, without global output/auth flags. */
  argv: string[];
}

export interface DaemonExecutionResult {
  /** The usual CLI envelope, before fields/JSONL/TOON/human rendering. */
  output: OutputEnvelope<unknown>;
  /** Includes partial failures that still have a success envelope. */
  exitCode: number;
}

export function isDaemonCommand(path: readonly string[]): boolean {
  return path.length === 2 && Object.hasOwn(DAEMON_COMMANDS, path[0])
    && DAEMON_COMMANDS[path[0]].includes(path[1]);
}

/** Bound and validate the new API without interpreting any shell text. */
export function validateDaemonCommand(params: Record<string, unknown>): DaemonCommandRequest {
  const invalid = (message: string): never => { throw new TgError(message, ErrorCode.INVALID_OPTIONS); };
  if (!params || typeof params !== 'object' || Array.isArray(params)) invalid('execute params must be an object');
  if (Object.keys(params).some(key => !['argv', 'stdin', 'cwd', 'timeoutMs'].includes(key))) {
    invalid('execute accepts only argv, stdin, cwd and timeoutMs');
  }
  if (!Array.isArray(params.argv) || params.argv.length < 2 || params.argv.length > 1024
    || params.argv.some(arg => typeof arg !== 'string' || arg.includes('\0'))) {
    invalid('execute argv must contain 2–1024 strings without NUL characters');
  }
  const argv = params.argv as string[];
  if (!isDaemonCommand(argv.slice(0, 2))) {
    throw new TgError('This command cannot run through execute; auth/session/lifecycle and watch use their own commands', ErrorCode.DAEMON_PROXY_UNAVAILABLE);
  }
  if (params.stdin !== undefined && typeof params.stdin !== 'string') invalid('execute stdin must be a string');
  if (params.cwd !== undefined && (typeof params.cwd !== 'string' || !isAbsolute(params.cwd) || params.cwd.includes('\0'))) {
    invalid('execute cwd must be an absolute path');
  }
  if (argv[0] === 'media' && params.cwd === undefined) invalid('Media commands require an absolute cwd');
  const photoCommand = (argv[0] === 'user' && argv[1] === 'download-photo')
    || (argv[0] === 'contact' && argv[1] === 'set-photo');
  if (photoCommand && params.cwd === undefined) invalid('Photo commands require an absolute cwd');
  if (params.timeoutMs !== undefined && (!Number.isInteger(params.timeoutMs) || (params.timeoutMs as number) < 1 || (params.timeoutMs as number) > 120_000)) {
    invalid('execute timeoutMs must be an integer from 1 to 120000');
  }
  // Leave room for the JSON-RPC envelope and request ID.
  if (Buffer.byteLength(JSON.stringify(params), 'utf8') > MAX_FRAME_BYTES - 256) invalid('execute request exceeds the 1 MiB frame limit');
  return { argv: [...argv], ...(params.stdin !== undefined && { stdin: params.stdin as string }),
    ...(params.cwd !== undefined && { cwd: params.cwd as string }),
    ...(params.timeoutMs !== undefined && { timeoutMs: params.timeoutMs as number }) };
}

export function isDaemonExecutionResult(value: unknown): value is DaemonExecutionResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as DaemonExecutionResult;
  if (![0, 1].includes(result.exitCode) || !result.output || typeof result.output !== 'object') return false;
  return result.output.ok === true ? Object.hasOwn(result.output, 'data')
    : result.output.ok === false && typeof result.output.error === 'string'
      && (result.output.code === undefined || typeof result.output.code === 'string');
}
