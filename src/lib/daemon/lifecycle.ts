/**
 * Daemon process helpers: liveness, signals, child env without secrets.
 */

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: process exists but we cannot signal it (other uid). Not dead.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Env passed to a forked daemon. Never includes session string or apiHash. */
export function daemonChildEnv(opts: {
  configDir: string;
  profile: string;
  idleTimeout: number;
  configPath?: string;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.TG_DAEMON_SESSION;
  delete env.TG_DAEMON_API_HASH;
  delete env.TG_DAEMON_API_ID;
  env.TG_DAEMON_CONFIG_DIR = opts.configDir;
  env.TG_DAEMON_PROFILE = opts.profile;
  env.TG_DAEMON_IDLE_TIMEOUT = String(opts.idleTimeout);
  env.TG_DAEMON_PID_PRECLAIMED = '1';
  if (opts.configPath) env.TG_DAEMON_CONFIG = opts.configPath;
  return env;
}

/**
 * SIGTERM/SIGINT → await stop(), then process.exit.
 * Returns an uninstall function (for tests).
 */
export function installDaemonSignals(stop: () => Promise<void>): () => void {
  let stopping = false;
  const onSignal = () => {
    if (stopping) return;
    stopping = true;
    stop()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
  return () => {
    process.off('SIGTERM', onSignal);
    process.off('SIGINT', onSignal);
  };
}

export async function waitWhile(
  predicate: () => boolean,
  timeoutMs: number,
  stepMs = 50,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!predicate()) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return !predicate();
}
