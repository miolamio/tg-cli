import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
const mockLogStatus = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: (...args: any[]) => mockLogStatus(...args),
}));

vi.mock('../../src/lib/config.js', () => ({
  createConfig: vi.fn(() => ({ path: '/tmp/mock-config.json' })),
}));

const mockCall = vi.fn();
const mockClose = vi.fn();
vi.mock('../../src/lib/daemon/client.js', () => ({
  DaemonClient: vi.fn().mockImplementation(() => ({
    call: mockCall,
    close: mockClose,
  })),
}));

const mockReadPid = vi.fn();
const mockSocketExists = vi.fn();
const mockCleanup = vi.fn();
vi.mock('../../src/lib/daemon/pid.js', () => ({
  DaemonPaths: vi.fn().mockImplementation(() => ({
    readPid: mockReadPid,
    socketExists: mockSocketExists,
    cleanup: mockCleanup,
    socketPath: '/tmp/mock.sock',
  })),
}));

const mockIsProcessAlive = vi.fn();
const mockWaitWhile = vi.fn().mockResolvedValue(true);
vi.mock('../../src/lib/daemon/lifecycle.js', () => ({
  isProcessAlive: (...args: any[]) => mockIsProcessAlive(...args),
  waitWhile: (...args: any[]) => mockWaitWhile(...args),
}));

import { daemonStopAction } from '../../src/commands/daemon/stop.js';
import { ErrorCode } from '../../src/lib/error-codes.js';

function ctx() {
  return {
    optsWithGlobals: () => ({ profile: 'default', quiet: true, config: undefined }),
  };
}

describe('daemonStopAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWaitWhile.mockResolvedValue(true);
  });

  it('errors when daemon is not running', async () => {
    mockReadPid.mockReturnValue(null);
    mockSocketExists.mockReturnValue(false);

    await daemonStopAction.call(ctx() as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      'Daemon is not running',
      ErrorCode.DAEMON_NOT_RUNNING,
    );
    expect(mockCleanup).not.toHaveBeenCalled();
  });

  it('waits for the socket after shutdown and does not SIGTERM if it is already gone', async () => {
    mockReadPid.mockReturnValue(12345);
    mockCall.mockResolvedValue({ shuttingDown: true });
    mockIsProcessAlive.mockReturnValue(false);
    mockSocketExists
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any);
    try {
      await daemonStopAction.call(ctx() as any);
      expect(mockCall).toHaveBeenCalledWith('shutdown', {});
      expect(mockWaitWhile).toHaveBeenCalled();
      expect(killSpy).not.toHaveBeenCalled();
      expect(mockCleanup).toHaveBeenCalled();
      expect(mockOutputSuccess).toHaveBeenCalledWith({ stopped: true, profile: 'default' });
    } finally {
      killSpy.mockRestore();
    }
  });

  it('sends SIGTERM when the process is alive even if the socket is gone', async () => {
    mockReadPid.mockReturnValue(12345);
    mockSocketExists.mockReturnValue(false);
    mockIsProcessAlive.mockReturnValue(true);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any);
    try {
      await daemonStopAction.call(ctx() as any);
      expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');
      expect(mockOutputError).toHaveBeenCalledWith(
        'Daemon did not stop (process still running)',
        ErrorCode.DAEMON_STOP_FAILED,
      );
      expect(mockCleanup).not.toHaveBeenCalled();
    } finally {
      killSpy.mockRestore();
    }
  });

  it('does not unlink a socket that still answers ping when pid file is missing', async () => {
    mockReadPid.mockReturnValue(null);
    mockSocketExists.mockReturnValue(true);
    mockIsProcessAlive.mockReturnValue(false);
    mockCall
      .mockRejectedValueOnce(new Error('shutdown failed'))
      .mockResolvedValueOnce('pong');

    await daemonStopAction.call(ctx() as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('still accepting'),
      ErrorCode.DAEMON_STOP_FAILED,
    );
    expect(mockCleanup).not.toHaveBeenCalled();
  });

  it('does not cleanup when a successor already rewrote the pid file', async () => {
    mockReadPid
      .mockReturnValueOnce(12345)
      .mockReturnValue(99999);
    mockSocketExists.mockReturnValue(false);
    mockIsProcessAlive
      .mockReturnValueOnce(true)
      .mockReturnValue(false);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any);
    try {
      await daemonStopAction.call(ctx() as any);
      expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');
      expect(mockCleanup).not.toHaveBeenCalled();
      expect(mockOutputSuccess).toHaveBeenCalledWith({ stopped: true, profile: 'default' });
    } finally {
      killSpy.mockRestore();
    }
  });

  it('does not unlink the socket while the process is still alive', async () => {
    mockReadPid.mockReturnValue(12345);
    mockSocketExists.mockReturnValue(true);
    mockCall.mockRejectedValue(new Error('unresponsive'));
    mockIsProcessAlive.mockReturnValue(true);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any);
    try {
      await daemonStopAction.call(ctx() as any);
      expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');
      expect(mockOutputError).toHaveBeenCalledWith(
        'Daemon did not stop (process still running)',
        ErrorCode.DAEMON_STOP_FAILED,
      );
      expect(mockCleanup).not.toHaveBeenCalled();
    } finally {
      killSpy.mockRestore();
    }
  });
});
