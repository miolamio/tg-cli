// tests/unit/message-watch.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOutputError = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: vi.fn(),
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

vi.mock('../../src/lib/daemon/pid.js', () => ({
  DaemonPaths: vi.fn().mockImplementation(() => ({
    socketExists: vi.fn().mockReturnValue(false),
    socketPath: '/tmp/test.sock',
  })),
}));

import { messageWatchAction } from '../../src/commands/message/watch.js';

describe('message watch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('errors when daemon is not running', async () => {
    const cmd = {
      optsWithGlobals: () => ({ profile: 'default', config: undefined }),
    };
    await messageWatchAction.call(cmd as any, '@channel');
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('daemon'),
      expect.any(String),
    );
  });
});
