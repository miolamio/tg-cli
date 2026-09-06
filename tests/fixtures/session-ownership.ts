import { SessionStore } from '../../src/lib/session-store.js';
import { withAuth } from '../../src/lib/with-auth.js';
import { daemonStartAction } from '../../src/commands/daemon/start.js';
import { importAction } from '../../src/commands/session/import.js';
import { loginAction } from '../../src/commands/auth/login.js';
import { join } from 'node:path';

const [role, configDir, profile = 'test'] = process.argv.slice(2);
const messages: string[] = [];
const listeners = new Map<string, () => void>();
process.on('message', (message: unknown) => {
  const command = String(message);
  const listener = listeners.get(command);
  if (listener) { listeners.delete(command); listener(); }
  else messages.push(command);
});
function receive(command: string): Promise<void> {
  const index = messages.indexOf(command);
  if (index !== -1) { messages.splice(index, 1); return Promise.resolve(); }
  return new Promise((resolve) => listeners.set(command, resolve));
}
(globalThis as any).ownershipBarrier = async (event: string) => {
  process.send?.({ event });
  await receive(event);
};
const config = join(configDir, 'config.json');
const opts = { profile, quiet: true, json: true, config };
const context = { optsWithGlobals: () => ({ ...opts, foreground: true, idleTimeout: '0' }) } as any;

async function main() {
  process.send?.({ event: 'ready' });
  await receive('run');
  if (role === 'direct-timeout') {
    (globalThis as any).ownershipTimeoutRole = true;
    // Exercise the production withAuth timeout path without spending 120s.
    // Session heartbeat/retry timers retain their real durations.
    const originalTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((callback: any, ms?: number, ...args: any[]) =>
      originalTimeout(callback, ms === 120_000 ? 30 : ms, ...args)) as typeof setTimeout;
  }
  if (role === 'direct-race') {
    const acquire = SessionStore.prototype.acquireLock;
    SessionStore.prototype.acquireLock = async function (...args) {
      await (globalThis as any).ownershipBarrier('before-lock');
      return acquire.apply(this, args);
    };
  }
  if (role.startsWith('direct')) {
    await withAuth(opts, async () => {
      await (globalThis as any).ownershipBarrier('operation');
    });
    if (role === 'direct-timeout') {
      process.send?.({ event: 'timed-out' });
      await receive('finish');
    }
  } else if (role === 'foreground') {
    await daemonStartAction.call(context);
  } else if (role === 'background') {
    process.env.TG_DAEMON_CONFIG_DIR = configDir;
    process.env.TG_DAEMON_PROFILE = profile;
    process.env.TG_DAEMON_CONFIG = config;
    process.env.TG_DAEMON_IDLE_TIMEOUT = '0';
    process.env.TG_DAEMON_PID_PRECLAIMED = '1';
    await import('../../src/lib/daemon/entry.js');
    return;
  } else if (role === 'import') {
    await importAction.call(context, 'synthetic-imported-session');
  } else if (role === 'login') {
    Object.defineProperty(process.stdin, 'isTTY', { value: true });
    await loginAction.call(context);
  } else if (role === 'probe') {
    const store = new SessionStore(configDir);
    try {
      await store.withLock(profile, async () => { process.send?.({ event: 'acquired' }); });
    } catch (err) {
      process.send?.({ event: 'blocked', code: (err as any).code });
    }
  } else if (role === 'delete-recreate') {
    const store = new SessionStore(configDir);
    await store.withLock(profile, async () => {
      store.deleteUnlocked(profile);
      await (globalThis as any).ownershipBarrier('deleted');
      store.saveUnlocked(profile, 'synthetic-recreated-session');
      await (globalThis as any).ownershipBarrier('saved');
    });
  } else if (role === 'hold-reject') {
    await new SessionStore(configDir).withLock(profile, async (_session, holdUntil) => {
      holdUntil(Promise.reject(new Error('Synthetic cleanup failure')));
    });
    process.send?.({ event: 'cleanup-rejected' });
    await receive('finish');
  }
  process.send?.({ event: 'done' });
  process.disconnect();
}
main().catch((err) => {
  process.send?.({ event: 'failed', message: err.message, code: err.code });
  process.exitCode = 1;
  process.disconnect();
});
