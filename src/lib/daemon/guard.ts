import { outputError } from '../output.js';
import { ErrorCode } from '../error-codes.js';
import { createConfig } from '../config.js';
import { DaemonPaths } from './pid.js';
import { DaemonClient } from './client.js';
import { isProcessAlive } from './lifecycle.js';

const PROXY_MSG =
  'This operation cannot be proxied. Use CLI --daemon or DaemonClient.execute for supported commands; auth/session operations require stopping the daemon.';

const RUNNING_MSG =
  'A daemon is running for this profile. Use --daemon for commands, or tg daemon stop before auth/session operations.';

/** Refuse --daemon on commands that open their own MTProto client. */
export function rejectDaemonProxy(opts: { daemon?: boolean }): boolean {
  if (!opts.daemon) return false;
  outputError(PROXY_MSG, ErrorCode.DAEMON_PROXY_UNAVAILABLE);
  return true;
}

export function daemonPidAlive(paths: DaemonPaths): boolean {
  const pid = paths.readPid();
  return pid != null && isProcessAlive(pid);
}

/** Unlink socket/pid only when no live process is holding them. */
export function cleanupStaleDaemon(paths: DaemonPaths): boolean {
  if (daemonPidAlive(paths)) return false;
  paths.cleanup();
  return true;
}

/** True if the unix socket answers JSON-RPC ping. Never unlinks. */
export async function pingDaemon(paths: DaemonPaths, timeoutMs = 1500): Promise<boolean> {
  if (!paths.socketExists()) return false;
  const daemon = new DaemonClient(paths.socketPath);
  try {
    const pong = await daemon.call('ping', {}, { timeoutMs });
    return pong === 'pong';
  } catch {
    return false;
  } finally {
    daemon.close();
  }
}

/**
 * True if a live daemon answered ping or a live PID still holds the files.
 * Prints an error when blocking.
 */
export async function blockIfDaemonRunning(paths: DaemonPaths): Promise<boolean> {
  if (paths.socketExists()) {
    if (await pingDaemon(paths)) {
      outputError(RUNNING_MSG, ErrorCode.DAEMON_ALREADY_RUNNING);
      return true;
    }
    if (!cleanupStaleDaemon(paths)) {
      outputError(
        'Daemon is not responding. Try: tg daemon stop && tg daemon start',
        ErrorCode.DAEMON_CONNECTION_FAILED,
      );
      return true;
    }
  }
  if (daemonPidAlive(paths)) {
    outputError(RUNNING_MSG, ErrorCode.DAEMON_ALREADY_RUNNING);
    return true;
  }
  return false;
}

/** --daemon refuse, or block a direct MTProto connect beside a live daemon. */
export async function refuseDirectConnectIfDaemon(opts: {
  profile: string;
  config?: string;
  daemon?: boolean;
}): Promise<boolean> {
  if (rejectDaemonProxy(opts)) return true;
  const config = createConfig(opts.config);
  const configDir = config.path.replace(/[/\\][^/\\]+$/, '');
  return blockIfDaemonRunning(new DaemonPaths(configDir, opts.profile));
}
