import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
const mockLogVerbose = vi.fn();
const mockIsVerboseMode = vi.fn(() => false);
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
  logVerbose: (...args: any[]) => mockLogVerbose(...args),
}));
vi.mock('../../src/lib/cli-mode.js', () => ({
  isVerboseMode: () => mockIsVerboseMode(),
  isQuietMode: () => false,
  setQuietMode: vi.fn(),
  setVerboseMode: vi.fn(),
}));

const { mockConnect, mockDestroy } = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
}));

const mockClientInstance = { connect: mockConnect, destroy: mockDestroy };

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: { StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })) },
}));

vi.mock('../../src/lib/config.js', () => ({
  createConfig: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), path: '/tmp/mock-config.json' })),
  getCredentialsOrThrow: vi.fn(() => ({ apiId: 12345, apiHash: 'testhash' })),
}));

const mockStoreWithLock = vi.fn();
vi.mock('../../src/lib/session-store.js', () => ({
  SessionStore: vi.fn().mockImplementation(() => ({
    withLock: mockStoreWithLock,
  })),
}));

const mockSocketExists = vi.fn(() => false);
const mockCleanup = vi.fn();
const mockReadPid = vi.fn(() => null);
vi.mock('../../src/lib/daemon/pid.js', () => ({
  DaemonPaths: vi.fn().mockImplementation(() => ({
    socketExists: mockSocketExists,
    cleanup: mockCleanup,
    readPid: mockReadPid,
    socketPath: '/tmp/mock.sock',
  })),
}));

const mockIsProcessAlive = vi.fn(() => false);
vi.mock('../../src/lib/daemon/lifecycle.js', () => ({
  isProcessAlive: (...args: any[]) => mockIsProcessAlive(...args),
  waitWhile: vi.fn(),
  daemonChildEnv: vi.fn(),
  installDaemonSignals: vi.fn(),
}));

const mockDaemonCall = vi.fn();
const mockDaemonClose = vi.fn();
vi.mock('../../src/lib/daemon/client.js', () => ({
  DaemonClient: vi.fn().mockImplementation(() => ({
    call: mockDaemonCall,
    close: mockDaemonClose,
  })),
}));

const { MockDaemonServer, mockServerStart } = vi.hoisted(() => {
  const mockServerStart = vi.fn();
  const MockDaemonServer = vi.fn().mockImplementation(() => ({
    start: mockServerStart,
    getClient: vi.fn(),
    stop: vi.fn(),
  }));
  return { MockDaemonServer, mockServerStart };
});
vi.mock('../../src/lib/daemon/server.js', () => ({
  DaemonServer: MockDaemonServer,
}));

import { withAuth } from '../../src/lib/with-auth.js';
import { ErrorCode } from '../../src/lib/error-codes.js';

describe('withAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsVerboseMode.mockReturnValue(false);
    mockStoreWithLock.mockImplementation(async (_p: string, fn: (s: string) => Promise<any>) => fn('test-session'));
  });

  it('calls the callback with a connected client', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await withAuth({ profile: 'default', json: true, human: false, verbose: false, quiet: false }, fn);
    expect(fn).toHaveBeenCalledWith(mockClientInstance);
  });

  it('outputs NOT_AUTHENTICATED when no session', async () => {
    mockStoreWithLock.mockImplementation(async (_p: string, fn: (s: string) => Promise<any>) => fn(''));
    const fn = vi.fn();
    await withAuth({ profile: 'default', json: true, human: false, verbose: false, quiet: false }, fn);
    expect(fn).not.toHaveBeenCalled();
    expect(mockOutputError).toHaveBeenCalledWith('Not logged in. Run: tg auth login', 'NOT_AUTHENTICATED');
  });

  it('catches errors and outputs formatted error with UNKNOWN_ERROR', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await withAuth({ profile: 'default', json: true, human: false, verbose: false, quiet: false }, fn);
    expect(mockOutputError).toHaveBeenCalledWith('boom', 'UNKNOWN_ERROR');
  });

  it('translates gramjs RPC errors to a stable code', async () => {
    const fn = vi.fn().mockRejectedValue({ errorMessage: 'PEER_ID_INVALID' });
    await withAuth({ profile: 'default', json: true, human: false, verbose: false, quiet: false }, fn);
    expect(mockOutputError).toHaveBeenCalledWith('Peer not found', 'PEER_ID_INVALID');
  });

  it('logs the raw error body when verbose mode is on', async () => {
    mockIsVerboseMode.mockReturnValueOnce(true);
    const fn = vi.fn().mockRejectedValue({ errorMessage: 'PEER_ID_INVALID' });
    await withAuth({ profile: 'default', json: true, human: false, verbose: true, quiet: false }, fn);
    expect(mockLogVerbose).toHaveBeenCalledWith('PEER_ID_INVALID');
    expect(mockOutputError).toHaveBeenCalledWith('Peer not found', 'PEER_ID_INVALID');
  });

  it('validates profile name and rejects invalid ones', async () => {
    const fn = vi.fn();
    await withAuth({ profile: '../hack', json: true, human: false, verbose: false, quiet: false }, fn);
    expect(fn).not.toHaveBeenCalled();
    expect(mockOutputError).toHaveBeenCalled();
  });
});

const daemonOpts = {
  profile: 'default',
  json: true,
  human: false,
  verbose: false,
  quiet: false,
  daemon: true,
};

describe('withAuth --daemon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreWithLock.mockImplementation(async (_p: string, fn: (s: string) => Promise<any>) => fn('test-session'));
    mockSocketExists.mockReturnValue(false);
    mockReadPid.mockReturnValue(null);
    mockIsProcessAlive.mockReturnValue(false);
  });

  it('errors CONNECTION_FAILED for --daemon when pid is alive but socket is gone', async () => {
    mockSocketExists.mockReturnValue(false);
    mockReadPid.mockReturnValue(4242);
    mockIsProcessAlive.mockReturnValue(true);
    const fn = vi.fn();
    await withAuth(daemonOpts, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('not responding'),
      ErrorCode.DAEMON_CONNECTION_FAILED,
    );
  });

  it('errors DAEMON_NOT_RUNNING when no socket; does not start an in-process server', async () => {
    const fn = vi.fn();
    await withAuth(daemonOpts, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(MockDaemonServer).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockOutputError).toHaveBeenCalledWith(
      'Daemon is not running. Start one with: tg daemon start',
      ErrorCode.DAEMON_NOT_RUNNING,
    );
  });

  it('refuses a direct client when a daemon is already up (no --daemon flag)', async () => {
    mockSocketExists.mockReturnValue(true);
    mockDaemonCall.mockResolvedValueOnce('pong');
    const fn = vi.fn();
    await withAuth({ ...daemonOpts, daemon: false }, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
    expect(MockDaemonServer).not.toHaveBeenCalled();
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('daemon is running'),
      ErrorCode.DAEMON_ALREADY_RUNNING,
    );
  });

  it('does not open a second MTProto client when the daemon is already up', async () => {
    mockSocketExists.mockReturnValue(true);
    mockDaemonCall.mockResolvedValueOnce('pong');
    const fn = vi.fn();
    await withAuth(daemonOpts, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
    expect(MockDaemonServer).not.toHaveBeenCalled();
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('--daemon'),
      ErrorCode.DAEMON_PROXY_UNAVAILABLE,
    );
  });

  it('treats a stale socket as not running and does not fall through to withClient', async () => {
    mockSocketExists.mockReturnValue(true);
    mockReadPid.mockReturnValue(null);
    mockDaemonCall.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const fn = vi.fn();
    await withAuth(daemonOpts, fn);

    expect(mockCleanup).toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockOutputError).toHaveBeenCalledWith(
      'Daemon is not running. Start one with: tg daemon start',
      ErrorCode.DAEMON_NOT_RUNNING,
    );
  });

  it('does not unlink a live daemon socket when ping fails', async () => {
    mockSocketExists.mockReturnValue(true);
    mockReadPid.mockReturnValue(4242);
    mockIsProcessAlive.mockReturnValue(true);
    mockDaemonCall.mockRejectedValueOnce(new Error('timeout'));
    const fn = vi.fn();
    await withAuth(daemonOpts, fn);

    expect(mockCleanup).not.toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('not responding'),
      ErrorCode.DAEMON_CONNECTION_FAILED,
    );
  });
});
