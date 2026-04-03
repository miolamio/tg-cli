import type { Command } from 'commander';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { DaemonPaths } from '../../lib/daemon/pid.js';
import { DaemonClient } from '../../lib/daemon/client.js';
import { DaemonServer } from '../../lib/daemon/server.js';
import { ErrorCode } from '../../lib/error-codes.js';
import type { GlobalOptions } from '../../lib/types.js';

export async function daemonStartAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { idleTimeout?: string; foreground?: boolean };
  const { profile, quiet } = opts;
  const idleTimeout = (parseInt(opts.idleTimeout ?? '300', 10)) * 1000;

  const config = createConfig(opts.config);
  const configDir = config.path.replace(/[/\\][^/\\]+$/, '');
  const paths = new DaemonPaths(configDir, profile);

  // Check if already running
  if (paths.socketExists()) {
    try {
      const client = new DaemonClient(paths.socketPath);
      const status = await client.call('ping', {});
      client.close();
      if (status === 'pong') {
        outputError('Daemon is already running', ErrorCode.DAEMON_ALREADY_RUNNING);
        return;
      }
    } catch {
      // Stale socket, clean up
      paths.cleanup();
    }
  }

  // Load session
  const store = new SessionStore(configDir);
  const sessionString = await store.load(profile);
  if (!sessionString) {
    outputError('Not logged in. Run: tg auth login', ErrorCode.NOT_AUTHENTICATED);
    return;
  }

  const { apiId, apiHash } = getCredentialsOrThrow(config);

  if (opts.foreground) {
    logStatus('Starting daemon in foreground...', quiet);
    const server = new DaemonServer(paths, { apiId, apiHash, sessionString }, { idleTimeout });
    await server.start();
    logStatus(`Daemon running on ${paths.socketPath} (PID ${process.pid})`, quiet);
    outputSuccess({ pid: process.pid, socket: paths.socketPath, profile });
    // Keep running until signal
    await new Promise(() => {});
  } else {
    // Fork background process
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const daemonEntry = join(__dirname, '..', '..', 'lib', 'daemon', 'entry.js');

    const child = fork(daemonEntry, [], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        TG_DAEMON_CONFIG_DIR: configDir,
        TG_DAEMON_PROFILE: profile,
        TG_DAEMON_API_ID: String(apiId),
        TG_DAEMON_API_HASH: apiHash,
        TG_DAEMON_SESSION: sessionString,
        TG_DAEMON_IDLE_TIMEOUT: String(idleTimeout),
      },
    });

    child.unref();

    // Wait for socket to appear
    const maxWait = 10_000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      if (paths.socketExists()) {
        outputSuccess({ pid: child.pid, socket: paths.socketPath, profile });
        return;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    outputError('Daemon failed to start within 10 seconds', ErrorCode.DAEMON_START_FAILED);
  }
}
