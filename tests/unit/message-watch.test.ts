// tests/unit/message-watch.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOutputError = vi.fn();
const mockOutputSuccess = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
}));

vi.mock('../../src/lib/config.js', () => ({
  createConfig: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    path: '/tmp/mock-config.json',
  })),
}));

const mockSocketExists = vi.fn(() => false);
vi.mock('../../src/lib/daemon/pid.js', () => ({
  DaemonPaths: vi.fn().mockImplementation(() => ({
    socketExists: mockSocketExists,
    socketPath: '/tmp/test.sock',
  })),
}));

const mockWatch = vi.fn();
const mockClose = vi.fn();
vi.mock('../../src/lib/daemon/client.js', () => ({
  DaemonClient: vi.fn().mockImplementation(() => ({
    watch: mockWatch,
    close: mockClose,
    call: vi.fn(),
  })),
}));

import { messageWatchAction } from '../../src/commands/message/watch.js';
import { ErrorCode } from '../../src/lib/error-codes.js';

describe('message watch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('errors when daemon is not running', async () => {
    mockSocketExists.mockReturnValue(false);
    const cmd = {
      optsWithGlobals: () => ({ profile: 'default', config: undefined }),
    };
    await messageWatchAction.call(cmd as any, '@channel');
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('daemon'),
      ErrorCode.DAEMON_NOT_RUNNING,
    );
    expect(mockWatch).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric --topic', async () => {
    mockSocketExists.mockReturnValue(true);
    const cmd = {
      optsWithGlobals: () => ({ profile: 'default', topic: 'nope' }),
    };
    await messageWatchAction.call(cmd as any, '@channel');
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('topic'),
      ErrorCode.INVALID_TOPIC_ID,
    );
    expect(mockWatch).not.toHaveBeenCalled();
  });

  it('rejects truncated topic ids like 12x', async () => {
    mockSocketExists.mockReturnValue(true);
    const cmd = {
      optsWithGlobals: () => ({ profile: 'default', topic: '12x' }),
    };
    await messageWatchAction.call(cmd as any, '@channel');
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('topic'),
      ErrorCode.INVALID_TOPIC_ID,
    );
    expect(mockWatch).not.toHaveBeenCalled();
  });

  it('rejects an explicitly empty topic without connecting', async () => {
    const cmd = { optsWithGlobals: () => ({ profile: 'default', topic: '' }) };
    await messageWatchAction.call(cmd as any, '@channel');
    expect(mockOutputError).toHaveBeenCalledWith(expect.any(String), ErrorCode.INVALID_TOPIC_ID);
    expect(mockWatch).not.toHaveBeenCalled();
  });

  it('reports unexpected daemon disconnect and removes signal listeners', async () => {
    mockSocketExists.mockReturnValue(true);
    const sigint = process.listenerCount('SIGINT');
    const sigterm = process.listenerCount('SIGTERM');
    mockWatch.mockRejectedValueOnce(new Error('Daemon disconnected while watching'));
    const cmd = { optsWithGlobals: () => ({ profile: 'default' }) };
    await messageWatchAction.call(cmd as any, '@channel');
    expect(mockOutputError).toHaveBeenCalledWith(expect.stringContaining('disconnected'), ErrorCode.DAEMON_CONNECTION_FAILED);
    expect(mockClose).toHaveBeenCalledOnce();
    expect(process.listenerCount('SIGINT')).toBe(sigint);
    expect(process.listenerCount('SIGTERM')).toBe(sigterm);
  });

  it('streams each daemon notification through outputSuccess', async () => {
    mockSocketExists.mockReturnValue(true);
    mockWatch.mockImplementation(async (_params: unknown, onMessage: (p: unknown) => void) => {
      onMessage({ id: 5, text: 'hello', date: '2026-01-01T00:00:00.000Z' });
    });
    const cmd = {
      optsWithGlobals: () => ({ profile: 'default', quiet: true }),
    };
    await messageWatchAction.call(cmd as any, '@channel');
    expect(mockWatch).toHaveBeenCalledWith(
      { chat: '@channel', topic: undefined },
      expect.any(Function),
    );
    expect(mockOutputSuccess).toHaveBeenCalledWith({
      id: 5,
      text: 'hello',
      date: '2026-01-01T00:00:00.000Z',
    });
    expect(mockOutputError).not.toHaveBeenCalled();
  });
});
