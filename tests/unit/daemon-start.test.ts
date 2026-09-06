import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOutputError = vi.fn();
const mockOutputSuccess = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
}));

vi.mock('../../src/lib/config.js', () => ({
  createConfig: vi.fn(() => ({ path: '/tmp/mock-config.json' })),
  getCredentialsOrThrow: vi.fn(() => ({ apiId: 1, apiHash: 'h' })),
}));

vi.mock('../../src/lib/session-store.js', () => ({
  SessionStore: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue('session'),
  })),
}));

const mockCall = vi.fn();
vi.mock('../../src/lib/daemon/client.js', () => ({
  DaemonClient: vi.fn().mockImplementation(() => ({
    call: mockCall,
    close: vi.fn(),
  })),
}));

const mockReadPid = vi.fn();
const mockSocketExists = vi.fn();
const mockCleanup = vi.fn();
const mockWritePidExclusive = vi.fn(() => true);
const mockCleanupOwned = vi.fn();
vi.mock('../../src/lib/daemon/pid.js', () => ({
  DaemonPaths: vi.fn().mockImplementation(() => ({
    readPid: mockReadPid,
    socketExists: mockSocketExists,
    cleanup: mockCleanup,
    writePidExclusive: mockWritePidExclusive,
    cleanupOwned: mockCleanupOwned,
    socketPath: '/tmp/mock.sock',
  })),
}));

const mockIsProcessAlive = vi.fn();
const mockWaitWhile = vi.fn().mockResolvedValue(true);
vi.mock('../../src/lib/daemon/lifecycle.js', () => ({
  isProcessAlive: (...args: any[]) => mockIsProcessAlive(...args),
  waitWhile: (...args: any[]) => mockWaitWhile(...args),
  daemonChildEnv: vi.fn(),
  installDaemonSignals: vi.fn(),
}));

vi.mock('../../src/lib/daemon/entry-path.js', () => ({
  resolveDaemonEntry: vi.fn(() => '/tmp/entry.js'),
}));

const mockFork = vi.fn();
vi.mock('node:child_process', () => ({
  fork: (...args: any[]) => mockFork(...args),
}));

import { daemonStartAction } from '../../src/commands/daemon/start.js';
import { ErrorCode } from '../../src/lib/error-codes.js';

function ctx(extra: Record<string, unknown> = {}) {
  return {
    optsWithGlobals: () => ({ profile: 'default', quiet: true, config: undefined, ...extra }),
  };
}

describe('daemonStartAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocketExists.mockReturnValue(false);
    mockReadPid.mockReturnValue(null);
    mockIsProcessAlive.mockReturnValue(false);
  });

  it('aborts when ping fails but the pid is still alive', async () => {
    mockSocketExists.mockReturnValue(true);
    mockCall.mockRejectedValue(new Error('timeout'));
    mockReadPid.mockReturnValue(4242);
    mockIsProcessAlive.mockReturnValue(true);

    await daemonStartAction.call(ctx() as any);

    expect(mockCleanup).not.toHaveBeenCalled();
    expect(mockFork).not.toHaveBeenCalled();
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('not responding'),
      ErrorCode.DAEMON_CONNECTION_FAILED,
    );
  });

  it('reports success only after the child answers ping', async () => {
    mockSocketExists
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    mockCall.mockResolvedValue('pong');
    mockReadPid.mockReturnValue(77);
    const child = { pid: 99, connected: true, disconnect: vi.fn(), unref: vi.fn() };
    mockFork.mockReturnValue(child);

    await daemonStartAction.call(ctx() as any);

    expect(mockWritePidExclusive).toHaveBeenCalledWith(99);
    expect(child.disconnect).toHaveBeenCalledOnce();
    expect(child.disconnect.mock.invocationCallOrder[0]).toBeLessThan(child.unref.mock.invocationCallOrder[0]);
    expect(mockCall).toHaveBeenCalledWith('ping', {}, { timeoutMs: 1000 });
    expect(mockOutputSuccess).toHaveBeenCalledWith({
      pid: 77,
      socket: '/tmp/mock.sock',
      profile: 'default',
    });
  });

  it('claims the pid file before waiting for pong', async () => {
    const order: string[] = [];
    mockWritePidExclusive.mockImplementation(() => {
      order.push('pid');
      return true;
    });
    let socketChecks = 0;
    mockSocketExists.mockImplementation(() => {
      socketChecks++;
      if (socketChecks === 1) return false;
      order.push('socket');
      return true;
    });
    mockCall.mockImplementation(async () => {
      order.push('ping');
      return 'pong';
    });
    mockReadPid.mockReturnValue(42);
    mockFork.mockReturnValue({ pid: 42, unref: vi.fn() });

    await daemonStartAction.call(ctx() as any);

    expect(order[0]).toBe('pid');
    expect(order).toContain('ping');
  });

  it('kills the child and cleans owned files when ping never arrives', async () => {
    vi.useFakeTimers();
    mockSocketExists.mockReturnValue(false);
    mockFork.mockReturnValue({ pid: 88, unref: vi.fn() });
    mockWritePidExclusive.mockReturnValue(true);
    mockIsProcessAlive.mockReturnValue(false);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any);

    try {
      const pending = daemonStartAction.call(ctx() as any);
      await vi.advanceTimersByTimeAsync(10_500);
      await pending;
      expect(killSpy).toHaveBeenCalledWith(88, 'SIGTERM');
      expect(mockCleanupOwned).toHaveBeenCalledWith(88);
      expect(mockOutputError).toHaveBeenCalledWith(
        'Daemon failed to start within 10 seconds',
        ErrorCode.DAEMON_START_FAILED,
      );
    } finally {
      killSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('errors DAEMON_ALREADY_RUNNING when the socket already pongs', async () => {
    mockSocketExists.mockReturnValue(true);
    mockCall.mockResolvedValue('pong');

    await daemonStartAction.call(ctx() as any);

    expect(mockFork).not.toHaveBeenCalled();
    expect(mockOutputError).toHaveBeenCalledWith(
      'Daemon is already running',
      ErrorCode.DAEMON_ALREADY_RUNNING,
    );
  });
});
