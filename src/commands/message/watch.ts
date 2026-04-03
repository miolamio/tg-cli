import type { Command } from 'commander';
import { createConfig } from '../../lib/config.js';
import { outputError, logStatus } from '../../lib/output.js';
import { DaemonPaths } from '../../lib/daemon/pid.js';
import { DaemonClient } from '../../lib/daemon/client.js';
import { ErrorCode } from '../../lib/error-codes.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Action handler for `tg message watch <chat>`.
 *
 * Watches for new messages in a chat via the daemon's persistent connection.
 * Requires a running daemon — errors if daemon is not started.
 */
export async function messageWatchAction(this: Command, chatInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { topic?: string };
  const { profile, quiet } = opts;

  const config = createConfig(opts.config);
  const configDir = config.path.replace(/[/\\][^/\\]+$/, '');
  const paths = new DaemonPaths(configDir, profile);

  if (!paths.socketExists()) {
    outputError(
      'message watch requires a running daemon. Start one with: tg daemon start',
      ErrorCode.DAEMON_NOT_RUNNING,
    );
    return;
  }

  logStatus(`Watching ${chatInput} for new messages... (Ctrl+C to stop)`, quiet);

  const client = new DaemonClient(paths.socketPath);

  try {
    const result = await client.call('subscribe', {
      chat: chatInput,
      topic: opts.topic ? parseInt(opts.topic, 10) : undefined,
    });

    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (err: unknown) {
    outputError(
      `Watch failed: ${(err as Error).message}`,
      ErrorCode.DAEMON_CONNECTION_FAILED,
    );
  } finally {
    client.close();
  }
}
