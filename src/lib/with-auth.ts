import type { TelegramClient } from 'telegram';
import { createConfig, getCredentialsOrThrow } from './config.js';
import type { Transport } from './types.js';
import { resolveTransport } from './transport.js';
import { withClient } from './client.js';
import { SessionStore } from './session-store.js';
import { outputError, logVerbose } from './output.js';
import { isVerboseMode } from './cli-mode.js';
import { formatError, translateTelegramError, TgError } from './errors.js';
import { ErrorCode } from './error-codes.js';
import { validateProfile } from './validate.js';
import { DaemonPaths } from './daemon/pid.js';
import { DaemonClient } from './daemon/client.js';
import { blockIfDaemonRunning, cleanupStaleDaemon, daemonPidAlive, rejectDaemonProxy } from './daemon/guard.js';
import { getDaemonContext } from './daemon/execution-context.js';

/**
 * Minimal options required by withAuth.
 * Compatible with GlobalOptions but doesn't force the full interface.
 */
export interface WithAuthOptions {
  profile: string;
  config?: string;
  daemon?: boolean;
  transport?: Transport;
}

/**
 * Execute an authenticated Telegram operation with full boilerplate:
 * config → session store → lock → auth check → credentials → client → callback.
 *
 * Most authenticated commands. Excluded: auth/{login,logout,status},
 * session/{export,import}, daemon/*, message/watch, completion.
 *
 * @param opts - Must include `profile` and optional `config`
 * @param fn - Receives a connected TelegramClient
 */
export async function withAuth(
  opts: WithAuthOptions,
  fn: (client: TelegramClient) => Promise<void>,
): Promise<void> {
  const context = getDaemonContext();
  if (context) {
    try {
      validateProfile(opts.profile);
      if (opts.profile !== context.profile) {
        throw new TgError('Command profile does not match the daemon profile', ErrorCode.INVALID_OPTIONS);
      }
      context.signal.throwIfAborted();
      await fn(context.client);
      context.signal.throwIfAborted();
    } catch (err: unknown) {
      const { message, code } = translateTelegramError(err);
      outputError(message, code);
    }
    return;
  }

  try {
    validateProfile(opts.profile);
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
    return;
  }

  const config = createConfig(opts.config);
  const configDir = config.path.replace(/[/\\][^/\\]+$/, '');
  const paths = new DaemonPaths(configDir, opts.profile);

  // CLI command routing happens before its action. An arbitrary library callback
  // cannot be serialized: reject it rather than opening a second MTProto client.
  if (opts.daemon) {

    if (paths.socketExists()) {
      try {
        const daemon = new DaemonClient(paths.socketPath);
        const pong = await daemon.call('ping', {});
        daemon.close();
        if (pong === 'pong') {
          rejectDaemonProxy({ daemon: true });
          return;
        }
      } catch {
        if (!cleanupStaleDaemon(paths)) {
          outputError(
            'Daemon is not responding. Try: tg daemon stop && tg daemon start',
            ErrorCode.DAEMON_CONNECTION_FAILED,
          );
          return;
        }
      }
    }

    if (daemonPidAlive(paths)) {
      outputError(
        'Daemon is not responding. Try: tg daemon stop && tg daemon start',
        ErrorCode.DAEMON_CONNECTION_FAILED,
      );
      return;
    }

    outputError('Daemon is not running. Start one with: tg daemon start', ErrorCode.DAEMON_NOT_RUNNING);
    return;
  }

  if (await blockIfDaemonRunning(paths)) return;

  // Direct connection (current behavior)
  const store = new SessionStore(configDir);

  try {
    await store.withLock(opts.profile, async (sessionString, holdUntil) => {
      if (!sessionString) {
        outputError('Not logged in. Run: tg auth login', ErrorCode.NOT_AUTHENTICATED);
        return;
      }

      const { apiId, apiHash } = await getCredentialsOrThrow(config, undefined, opts.profile);

      await withClient({ apiId, apiHash, sessionString, transport: resolveTransport(config, opts.profile, opts.transport) }, async (client) => {
        await fn(client);
      }, { holdUntil });
    });
  } catch (err: unknown) {
    if (isVerboseMode()) {
      const raw = err instanceof Error
        ? (err.stack ?? err.message)
        : typeof err === 'object' && err && 'errorMessage' in err
          ? String((err as { errorMessage: unknown }).errorMessage)
          : String(err);
      logVerbose(raw);
    }
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
