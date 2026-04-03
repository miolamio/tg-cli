import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
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

import { withAuth } from '../../src/lib/with-auth.js';

describe('withAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('catches errors and outputs formatted error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await withAuth({ profile: 'default', json: true, human: false, verbose: false, quiet: false }, fn);
    expect(mockOutputError).toHaveBeenCalledWith('boom', undefined);
  });

  it('validates profile name and rejects invalid ones', async () => {
    const fn = vi.fn();
    await withAuth({ profile: '../hack', json: true, human: false, verbose: false, quiet: false }, fn);
    expect(fn).not.toHaveBeenCalled();
    expect(mockOutputError).toHaveBeenCalled();
  });
});
