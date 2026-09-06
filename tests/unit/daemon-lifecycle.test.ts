import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isProcessAlive,
  daemonChildEnv,
  installDaemonSignals,
  waitWhile,
} from '../../src/lib/daemon/lifecycle.js';

describe('isProcessAlive', () => {
  it('returns true for the current process', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('returns false for an unused pid', () => {
    expect(isProcessAlive(2_147_483_647)).toBe(false);
  });

  it('treats EPERM as alive', () => {
    const spy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('EPERM') as NodeJS.ErrnoException;
      err.code = 'EPERM';
      throw err;
    });
    try {
      expect(isProcessAlive(1)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('daemonChildEnv', () => {
  it('does not pass session string or api hash', () => {
    const prevSession = process.env.TG_DAEMON_SESSION;
    process.env.TG_DAEMON_SESSION = 'should-not-leak';
    process.env.TG_DAEMON_API_HASH = 'hash-leak';
    const env = daemonChildEnv({
      configDir: '/tmp/cfg',
      profile: 'default',
      idleTimeout: 300_000,
    });
    expect(env.TG_DAEMON_SESSION).toBeUndefined();
    expect(env.TG_DAEMON_API_HASH).toBeUndefined();
    expect(env.TG_DAEMON_API_ID).toBeUndefined();
    expect(env.TG_DAEMON_CONFIG_DIR).toBe('/tmp/cfg');
    expect(env.TG_DAEMON_PROFILE).toBe('default');
    expect(env.TG_DAEMON_IDLE_TIMEOUT).toBe('300000');
    expect(env.TG_DAEMON_PID_PRECLAIMED).toBe('1');
    if (prevSession === undefined) delete process.env.TG_DAEMON_SESSION;
    else process.env.TG_DAEMON_SESSION = prevSession;
    delete process.env.TG_DAEMON_API_HASH;
  });
});

describe('installDaemonSignals', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls stop then process.exit(0) on SIGTERM', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const uninstall = installDaemonSignals(stop);
    process.emit('SIGTERM');
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0));
    uninstall();
  });

  it('calls stop then process.exit(0) on SIGINT', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const uninstall = installDaemonSignals(stop);
    process.emit('SIGINT');
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0));
    uninstall();
  });
});

describe('waitWhile', () => {
  it('returns true when predicate becomes false', async () => {
    let n = 2;
    const ok = await waitWhile(() => n-- > 0, 1000, 1);
    expect(ok).toBe(true);
  });

  it('returns false when the predicate stays true until timeout', async () => {
    const ok = await waitWhile(() => true, 20, 5);
    expect(ok).toBe(false);
  });
});
