import type { Command } from 'commander';
import { createConfig } from '../../lib/config.js';
import { outputSuccess } from '../../lib/output.js';
import { DaemonPaths } from '../../lib/daemon/pid.js';
import { DaemonClient } from '../../lib/daemon/client.js';
import type { GlobalOptions } from '../../lib/types.js';

export async function daemonStatusAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile } = opts;

  const config = createConfig(opts.config);
  const configDir = config.path.replace(/[/\\][^/\\]+$/, '');
  const paths = new DaemonPaths(configDir, profile);

  if (!paths.socketExists()) {
    outputSuccess({ running: false, profile });
    return;
  }

  try {
    const client = new DaemonClient(paths.socketPath);
    const status = await client.call('status', {}) as Record<string, unknown>;
    client.close();
    outputSuccess({ ...status, profile });
  } catch {
    outputSuccess({ running: false, profile, stale: true });
  }
}
