import type { Command } from 'commander';
import { createConfig } from '../../lib/config.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { DaemonPaths } from '../../lib/daemon/pid.js';
import { DaemonClient } from '../../lib/daemon/client.js';
import { ErrorCode } from '../../lib/error-codes.js';
import { parseTopicId } from '../../lib/validate.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Stream new messages in a chat via the daemon. Stays up until Ctrl+C.
 * Each message is written through outputSuccess (JSON envelope / --human / --toon).
 */
export async function messageWatchAction(this: Command, chatInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { topic?: string };
  const { profile, quiet } = opts;

  let topicId: number | undefined;
  if (opts.topic !== undefined) {
    try {
      topicId = parseTopicId(opts.topic);
    } catch (err: unknown) {
      outputError(
        err instanceof Error ? err.message : 'Invalid topic ID: must be a number',
        ErrorCode.INVALID_TOPIC_ID,
      );
      return;
    }
  }

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

  const stop = () => client.close();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    await client.watch(
      { chat: chatInput, topic: topicId },
      (payload) => {
        outputSuccess(payload);
      },
    );
  } catch (err: unknown) {
    outputError(
      `Watch failed: ${(err as Error).message}`,
      ErrorCode.DAEMON_CONNECTION_FAILED,
    );
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    client.close();
  }
}
