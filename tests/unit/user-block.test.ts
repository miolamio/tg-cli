import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
}));

// Hoisted mock state for telegram client
const { mockConnect, mockDestroy, mockInvoke } = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockInvoke: vi.fn().mockResolvedValue(true),
}));

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  invoke: mockInvoke,
};

vi.mock('telegram', () => {
  class MockUser {
    className = 'User';
    constructor(data: any) {
      Object.assign(this, data);
    }
  }
  class MockChannel {
    className = 'Channel';
    constructor(data: any) {
      Object.assign(this, data);
    }
  }
  class MockChat {
    className = 'Chat';
    constructor(data: any) {
      Object.assign(this, data);
    }
  }
  return {
    TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
    sessions: {
      StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
    },
    Api: {
      User: MockUser,
      Channel: MockChannel,
      Chat: MockChat,
      contacts: {
        Block: vi.fn(),
      },
    },
  };
});

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

import { userBlockAction } from '../../src/commands/user/block.js';

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

describe('userBlockAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(true);
  });

  it('blocks a user successfully', async () => {
    const { Api } = require('telegram');
    const user = new Api.User({});
    Object.assign(user, {
      id: BigInt(100),
      firstName: 'Alice',
      username: 'alice',
    });

    mockResolveEntity.mockResolvedValueOnce(user);

    const ctx = createMockCommandContext();
    await userBlockAction.call(ctx as any, '@alice');

    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledWith({
      userId: '100',
      username: 'alice',
      firstName: 'Alice',
      action: 'blocked',
    });
  });

  it('errors with NOT_A_USER for channel entities', async () => {
    const { Api } = require('telegram');
    const channel = new Api.Channel({});
    Object.assign(channel, { id: BigInt(300), className: 'Channel' });

    mockResolveEntity.mockResolvedValueOnce(channel);

    const ctx = createMockCommandContext();
    await userBlockAction.call(ctx as any, '@somechannel');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Not a user: this is a group/channel',
      'NOT_A_USER',
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('errors with NOT_A_USER for chat entities', async () => {
    const { Api } = require('telegram');
    const chat = new Api.Chat({});
    Object.assign(chat, { id: BigInt(400), className: 'Chat' });

    mockResolveEntity.mockResolvedValueOnce(chat);

    const ctx = createMockCommandContext();
    await userBlockAction.call(ctx as any, 'somechat');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Not a user: this is a group/channel',
      'NOT_A_USER',
    );
  });

  it('translates RPCError via translateTelegramError', async () => {
    const { Api } = require('telegram');
    const user = new Api.User({});
    Object.assign(user, { id: BigInt(100), firstName: 'Alice', username: 'alice' });
    mockResolveEntity.mockResolvedValueOnce(user);

    mockInvoke.mockRejectedValueOnce({ errorMessage: 'USER_BOT_INVALID' });

    const ctx = createMockCommandContext();
    await userBlockAction.call(ctx as any, '@alice');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Cannot block this bot',
      'USER_BOT_INVALID',
    );
  });

  it('handles idempotent blocking (already blocked succeeds)', async () => {
    const { Api } = require('telegram');
    const user = new Api.User({});
    Object.assign(user, { id: BigInt(100), firstName: 'Alice', username: 'alice' });
    mockResolveEntity.mockResolvedValueOnce(user);
    // Telegram returns true even if already blocked
    mockInvoke.mockResolvedValueOnce(true);

    const ctx = createMockCommandContext();
    await userBlockAction.call(ctx as any, '@alice');

    expect(mockOutputSuccess).toHaveBeenCalledWith({
      userId: '100',
      username: 'alice',
      firstName: 'Alice',
      action: 'blocked',
    });
  });
});
