import type { Command } from 'commander';
import { fork } from 'node:child_process';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { resolveTransport } from '../../lib/transport.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { DaemonPaths } from '../../lib/daemon/pid.js';
import { DaemonClient } from '../../lib/daemon/client.js';
import { DaemonServer } from '../../lib/daemon/server.js';
import { resolveDaemonEntry } from '../../lib/daemon/entry-path.js';
import { daemonChildEnv, installDaemonSignals, isProcessAlive, waitWhile } from '../../lib/daemon/lifecycle.js';
import { cleanupStaleDaemon, daemonPidAlive } from '../../lib/daemon/guard.js';
import { ErrorCode } from '../../lib/error-codes.js';
import type { GlobalOptions } from '../../lib/types.js';
import { parseIntegerOption, validateProfile } from '../../lib/validate.js';

export async function daemonStartAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { idleTimeout?: string; foreground?: boolean };
  const { profile, quiet } = opts;
  validateProfile(profile);
  const idleTimeout = parseIntegerOption(opts.idleTimeout ?? '300', '--idle-timeout', {
    max: 2_147_483,
  }) * 1000;

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
      if (!cleanupStaleDaemon(paths)) {
        outputError(
          'Daemon is not responding. Try: tg daemon stop && tg daemon start',
          ErrorCode.DAEMON_CONNECTION_FAILED,
        );
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
    outputError('Daemon is already running', ErrorCode.DAEMON_ALREADY_RUNNING);
    return;
  }

  // Load session
  const store = new SessionStore(configDir);
  const sessionString = await store.load(profile);
  if (!sessionString) {
    outputError('Not logged in. Run: tg auth login', ErrorCode.NOT_AUTHENTICATED);
    return;
  }

  const { apiId, apiHash } = await getCredentialsOrThrow(config, undefined, profile);

  const transport = resolveTransport(config, profile, opts.transport);

  if (opts.foreground) {
    logStatus('Starting daemon in foreground...', quiet);
    const server = new DaemonServer(
      paths,
      { apiId, apiHash, transport },
      { idleTimeout, onIdle: () => process.exit(0) },
    );
    const uninstallSignals = installDaemonSignals(() => server.stop());
    try {
      await server.start();
    } catch (err: unknown) {
      uninstallSignals();
      outputError(
        `Daemon failed to start: ${(err as Error).message}`,
        ErrorCode.DAEMON_START_FAILED,
      );
      return;
    }
    logStatus(`Daemon running on ${paths.socketPath} (PID ${process.pid})`, quiet);
    outputSuccess({ pid: process.pid, socket: paths.socketPath, profile });
    await new Promise(() => {});
  } else {
    const daemonEntry = resolveDaemonEntry(import.meta.url);

    const child = fork(daemonEntry, [], {
      detached: true,
      stdio: 'ignore',
      env: daemonChildEnv({
        configDir,
        profile,
        idleTimeout,
        configPath: opts.config,
        transport,
      }),
    });

    // fork() creates an IPC channel even with ignored stdio. Readiness uses the
    // Unix socket, so close unused IPC before unref or it keeps this CLI alive.
    if (child.connected) child.disconnect();
    child.unref();

    const childPid = child.pid;
    if (childPid == null) {
      outputError('Daemon failed to start (fork returned no pid)', ErrorCode.DAEMON_START_FAILED);
      return;
    }

    if (!paths.writePidExclusive(childPid)) {
      try { process.kill(childPid, 'SIGTERM'); } catch { /* already gone */ }
      outputError('Daemon is already running', ErrorCode.DAEMON_ALREADY_RUNNING);
      return;
    }

    const maxWait = 10_000;
    const started = Date.now();
    while (Date.now() - started < maxWait) {
      if (paths.socketExists()) {
        try {
          const ready = new DaemonClient(paths.socketPath);
          const pong = await ready.call('ping', {}, { timeoutMs: 1000 });
          ready.close();
          if (pong === 'pong') {
            outputSuccess({
              pid: paths.readPid() ?? childPid,
              socket: paths.socketPath,
              profile,
            });
            return;
          }
        } catch {
          // Socket exists but not accepting yet
        }
      }
      await new Promise(r => setTimeout(r, 100));
    }

    try { process.kill(childPid, 'SIGTERM'); } catch { /* already gone */ }
    await waitWhile(() => isProcessAlive(childPid), 5_000);
    if (isProcessAlive(childPid)) {
      try { process.kill(childPid, 'SIGKILL'); } catch { /* already gone */ }
    }
    paths.cleanupOwned(childPid);
    outputError('Daemon failed to start within 10 seconds', ErrorCode.DAEMON_START_FAILED);
  }
}
