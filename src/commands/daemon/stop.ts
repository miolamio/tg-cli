import type { Command } from 'commander';
import { createConfig } from '../../lib/config.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { DaemonPaths } from '../../lib/daemon/pid.js';
import { DaemonClient } from '../../lib/daemon/client.js';
import { isProcessAlive, waitWhile } from '../../lib/daemon/lifecycle.js';
import { ErrorCode } from '../../lib/error-codes.js';
import type { GlobalOptions } from '../../lib/types.js';

export async function daemonStopAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile, quiet } = opts;

  const config = createConfig(opts.config);
  const configDir = config.path.replace(/[/\\][^/\\]+$/, '');
  const paths = new DaemonPaths(configDir, profile);

  const pid = paths.readPid();

  if (!pid && !paths.socketExists()) {
    outputError('Daemon is not running', ErrorCode.DAEMON_NOT_RUNNING);
    return;
  }

  if (paths.socketExists()) {
    try {
      const client = new DaemonClient(paths.socketPath);
      await client.call('shutdown', {});
      client.close();
    } catch {
      // Socket unresponsive
    }
    await waitWhile(() => paths.socketExists(), 5_000);
  }

  if (pid && isProcessAlive(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process already dead
    }
    await waitWhile(() => isProcessAlive(pid), 5_000);
  }

  if (pid && isProcessAlive(pid)) {
    outputError('Daemon did not stop (process still running)', ErrorCode.DAEMON_STOP_FAILED);
    return;
  }

  const now = paths.readPid();
  if (now !== null && now !== pid) {
    // Successor already claimed the pid file. Do not unlink its files.
    logStatus('Daemon stopped.', quiet);
    outputSuccess({ stopped: true, profile });
    return;
  }

  if (paths.socketExists()) {
    try {
      const client = new DaemonClient(paths.socketPath);
      const pong = await client.call('ping', {});
      client.close();
      if (pong === 'pong') {
        outputError('Daemon did not stop (socket still accepting connections)', ErrorCode.DAEMON_STOP_FAILED);
        return;
      }
    } catch {
      // Unresponsive and no live pid: stale socket
    }
  }

  paths.cleanup();
  logStatus('Daemon stopped.', quiet);
  outputSuccess({ stopped: true, profile });
}
