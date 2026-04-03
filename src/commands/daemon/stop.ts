import type { Command } from 'commander';
import { createConfig } from '../../lib/config.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { DaemonPaths } from '../../lib/daemon/pid.js';
import { DaemonClient } from '../../lib/daemon/client.js';
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

  // Try graceful shutdown via socket
  if (paths.socketExists()) {
    try {
      const client = new DaemonClient(paths.socketPath);
      await client.call('shutdown', {});
      client.close();
    } catch {
      // Socket unresponsive, fall through to SIGTERM
    }
  }

  // Send SIGTERM if PID exists
  if (pid) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process already dead
    }
  }

  // Wait for socket removal
  const maxWait = 5_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (!paths.socketExists()) break;
    await new Promise(r => setTimeout(r, 100));
  }

  // Force cleanup if still there
  paths.cleanup();

  logStatus('Daemon stopped.', quiet);
  outputSuccess({ stopped: true, profile });
}
