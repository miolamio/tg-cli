import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
}));

const { mockConnect, mockDestroy, MockUser, MockChat, MockChannel } = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  MockUser: class User { static className = 'User'; },
  MockChat: class Chat { static className = 'Chat'; },
  MockChannel: class Channel { static className = 'Channel'; },
}));

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
};

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: {
    StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
  },
  Api: {
    User: MockUser,
    Chat: MockChat,
    Channel: MockChannel,
  },
}));

vi.mock('../../src/lib/config.js', () => ({
  createConfig: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    path: '/tmp/mock-config.json',
  })),
  getCredentialsOrThrow: vi.fn(() => ({ apiId: 12345, apiHash: 'testhash' })),
}));

const mockStoreWithLock = vi.fn().mockImplementation(async (_profile: string, fn: (s: string) => Promise<any>) => {
  return fn('test-session');
});

vi.mock('../../src/lib/session-store.js', () => ({
  SessionStore: vi.fn().mockImplementation(() => ({
    withLock: mockStoreWithLock,
    filePath: (p: string) => `/mock/sessions/${p}.session`,
  })),
}));

vi.mock('../../src/lib/client.js', () => ({
  withClient: vi.fn(async (_opts: any, fn: any) => fn(mockClientInstance)),
}));

const mockResolveEntity = vi.fn();
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
}));

const mockBigIntToString = vi.fn((val: any) => val?.toString() ?? '');
vi.mock('../../src/lib/serialize.js', () => ({
  bigIntToString: (val: any) => mockBigIntToString(val),
}));

import { chatResolveAction } from '../../src/commands/chat/resolve.js';

function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default',
      quiet: false,
      config: undefined,
      ...opts,
    })),
  };
}

describe('chatResolveAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a username and outputs id, type, title, username', async () => {
    const entity = Object.create(MockUser.prototype);
    Object.assign(entity, {
      id: { toString: () => '123' },
      firstName: 'Alice',
      lastName: 'Smith',
      username: 'alice',
    });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext();
    await chatResolveAction.call(ctx as any, '@alice');

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, '@alice');
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.id).toBe('123');
    expect(data.type).toBe('user');
    expect(data.title).toBe('Alice Smith');
    expect(data.username).toBe('alice');
  });

  it('resolves a Channel as channel type', async () => {
    const entity = Object.create(MockChannel.prototype);
    Object.assign(entity, {
      id: { toString: () => '456' },
      title: 'My Channel',
      username: 'mychan',
      megagroup: false,
    });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext();
    await chatResolveAction.call(ctx as any, '@mychan');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.type).toBe('channel');
    expect(data.title).toBe('My Channel');
  });

  it('resolves a Channel with megagroup as supergroup type', async () => {
    const entity = Object.create(MockChannel.prototype);
    Object.assign(entity, {
      id: { toString: () => '789' },
      title: 'Supergroup',
      username: 'sg',
      megagroup: true,
    });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext();
    await chatResolveAction.call(ctx as any, '@sg');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.type).toBe('supergroup');
  });

  it('resolves a Chat as group type', async () => {
    const entity = Object.create(MockChat.prototype);
    Object.assign(entity, {
      id: { toString: () => '111' },
      title: 'Old Group',
      username: null,
    });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext();
    await chatResolveAction.call(ctx as any, '111');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.type).toBe('group');
    expect(data.title).toBe('Old Group');
    expect(data.username).toBeNull();
  });

  it('outputs user title as firstName + lastName', async () => {
    const entity = Object.create(MockUser.prototype);
    Object.assign(entity, {
      id: { toString: () => '1' },
      firstName: 'John',
      lastName: undefined,
      username: 'john',
    });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext();
    await chatResolveAction.call(ctx as any, 'john');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.title).toBe('John');
  });

  it('outputs error when not logged in', async () => {
    mockStoreWithLock.mockImplementationOnce(async (_profile: string, fn: (s: string) => Promise<any>) => {
      return fn('');
    });

    const ctx = createMockCommandContext();
    await chatResolveAction.call(ctx as any, '@test');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in'),
      'NOT_AUTHENTICATED',
    );
  });

  it('outputs error when resolveEntity throws', async () => {
    const { TgError } = await import('../../src/lib/errors.js');
    mockResolveEntity.mockRejectedValueOnce(new TgError('Peer not found: test', 'PEER_NOT_FOUND'));

    const ctx = createMockCommandContext();
    await chatResolveAction.call(ctx as any, 'nonexistent');

    expect(mockOutputError).toHaveBeenCalledWith('Peer not found: test', 'PEER_NOT_FOUND');
  });
});
