import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
}));

// Hoisted mock state for telegram client and entity classes
const { mockConnect, mockDestroy, mockInvoke, MockUser, MockChannel, MockChat } = vi.hoisted(() => {
  class MockUser {
    className = 'User';
    constructor(data: any) { Object.assign(this, data); }
  }
  class MockChannel {
    className = 'Channel';
    constructor(data: any) { Object.assign(this, data); }
  }
  class MockChat {
    className = 'Chat';
    constructor(data: any) { Object.assign(this, data); }
  }
  return {
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockDestroy: vi.fn().mockResolvedValue(undefined),
    mockInvoke: vi.fn().mockResolvedValue(true),
    MockUser,
    MockChannel,
    MockChat,
  };
});

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  invoke: mockInvoke,
};

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: {
    StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
  },
  Api: {
    User: MockUser,
    Channel: MockChannel,
    Chat: MockChat,
    contacts: {
      Unblock: vi.fn(),
    },
  },
}));

// Mock config
vi.mock('../../src/lib/config.js', () => ({
  createConfig: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    path: '/tmp/mock-config.json',
  })),
  getCredentialsOrThrow: vi.fn(() => ({ apiId: 12345, apiHash: 'testhash' })),
}));

// Mock session store
const mockStoreWithLock = vi.fn().mockImplementation(async (_profile: string, fn: (s: string) => Promise<any>) => {
  return fn('test-session');
});

vi.mock('../../src/lib/session-store.js', () => ({
  SessionStore: vi.fn().mockImplementation(() => ({
    withLock: mockStoreWithLock,
    filePath: (p: string) => `/mock/sessions/${p}.session`,
  })),
}));

// Mock client module
vi.mock('../../src/lib/client.js', () => ({
  withClient: vi.fn(async (_opts: any, fn: any) => fn(mockClientInstance)),
}));

// Mock peer resolution
const mockResolveEntity = vi.fn();
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
}));

// Mock serialize
vi.mock('../../src/lib/serialize.js', () => ({
  bigIntToString: (v: any) => String(v),
}));

// Mock errors (use actual translateTelegramError)
vi.mock('../../src/lib/errors.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/errors.js')>();
  return {
    ...actual,
    translateTelegramError: actual.translateTelegramError,
  };
});

import { userUnblockAction } from '../../src/commands/user/unblock.js';

function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default',
      quiet: false,
      config: undefined,
      json: true,
      human: false,
      verbose: false,
      ...opts,
    })),
  };
}

describe('userUnblockAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(true);
  });

  it('unblocks a user successfully', async () => {
    const user = new MockUser({});
    Object.assign(user, {
      id: BigInt(100),
      firstName: 'Alice',
      username: 'alice',
    });

    mockResolveEntity.mockResolvedValueOnce(user);

    const ctx = createMockCommandContext();
    await userUnblockAction.call(ctx as any, '@alice');

    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledWith({
      userId: '100',
      username: 'alice',
      firstName: 'Alice',
      action: 'unblocked',
    });
  });

  it('errors with NOT_A_USER for channel entities', async () => {
    const channel = new MockChannel({});
    Object.assign(channel, { id: BigInt(300) });

    mockResolveEntity.mockResolvedValueOnce(channel);

    const ctx = createMockCommandContext();
    await userUnblockAction.call(ctx as any, '@somechannel');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Not a user: this is a group/channel',
      'NOT_A_USER',
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('translates RPCError via translateTelegramError', async () => {
    const user = new MockUser({});
    Object.assign(user, { id: BigInt(100), firstName: 'Alice', username: 'alice' });
    mockResolveEntity.mockResolvedValueOnce(user);

    mockInvoke.mockRejectedValueOnce({ errorMessage: 'INPUT_USER_DEACTIVATED' });

    const ctx = createMockCommandContext();
    await userUnblockAction.call(ctx as any, '@alice');

    expect(mockOutputError).toHaveBeenCalledWith(
      'User account deleted',
      'INPUT_USER_DEACTIVATED',
    );
  });

  it('handles idempotent unblocking (already unblocked succeeds)', async () => {
    const user = new MockUser({});
    Object.assign(user, { id: BigInt(100), firstName: 'Bob', username: 'bob' });
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(true);

    const ctx = createMockCommandContext();
    await userUnblockAction.call(ctx as any, '@bob');

    expect(mockOutputSuccess).toHaveBeenCalledWith({
      userId: '100',
      username: 'bob',
      firstName: 'Bob',
      action: 'unblocked',
    });
  });
});
