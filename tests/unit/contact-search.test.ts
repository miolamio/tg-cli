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
    mockInvoke: vi.fn().mockResolvedValue(undefined),
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
      Search: vi.fn(),
    },
    users: {
      GetFullUser: vi.fn(),
    },
    photos: {
      GetUserPhotos: vi.fn(),
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

import { contactSearchAction } from '../../src/commands/contact/search.js';

function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default',
      quiet: false,
      config: undefined,
      json: true,
      human: false,
      verbose: false,
      limit: '20',
      global: false,
      ...opts,
    })),
  };
}

// Helper to create a mock user for search results
function createMockSearchUser(overrides: Record<string, any> = {}) {
  const user = new MockUser({});
  Object.assign(user, {
    id: BigInt(100),
    firstName: 'Alice',
    lastName: 'Smith',
    username: 'alice',
    phone: '+1234567890',
    bot: false,
    status: { className: 'UserStatusRecently' },
    premium: false,
    verified: false,
    mutualContact: true,
    langCode: 'en',
    photo: null,
    ...overrides,
  });
  return user;
}

// Helper to create a mock GetFullUser response
function createMockFullUserResult(user: any, overrides: Record<string, any> = {}) {
  return {
    fullUser: {
      about: 'Hello world',
      blocked: false,
      commonChatsCount: 3,
      botInfo: null,
      ...overrides,
    },
    users: [user],
  };
}

describe('contactSearchAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
  });

  it('searches contacts (default) using myResults only', async () => {
    const user1 = createMockSearchUser({ id: BigInt(100), firstName: 'Alice', username: 'alice' });

    // contacts.Search result
    mockInvoke.mockResolvedValueOnce({
      myResults: [{ className: 'PeerUser', userId: BigInt(100) }],
      results: [
        { className: 'PeerUser', userId: BigInt(100) },
        { className: 'PeerUser', userId: BigInt(200) },
      ],
      users: [
        user1,
        createMockSearchUser({ id: BigInt(200), firstName: 'Alicia', username: 'alicia' }),
      ],
      chats: [],
    });

    // GetFullUser for Alice (from myResults only)
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user1));
    // GetUserPhotos
    mockInvoke.mockResolvedValueOnce({ count: 1, photos: [] });

    const ctx = createMockCommandContext();
    await contactSearchAction.call(ctx as any, 'ali');

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const result = mockOutputSuccess.mock.calls[0][0];
    // Default mode: only myResults (1 user)
    expect(result.results).toHaveLength(1);
    expect(result.results[0].firstName).toBe('Alice');
    expect(result.results[0].isContact).toBe(true);
    expect(result.total).toBe(1);
  });

  it('searches with --global using myResults + results with isContact flag', async () => {
    const user1 = createMockSearchUser({ id: BigInt(100), firstName: 'Alice', username: 'alice' });
    const user2 = createMockSearchUser({ id: BigInt(200), firstName: 'Alicia', username: 'alicia', mutualContact: false });

    // contacts.Search result
    mockInvoke.mockResolvedValueOnce({
      myResults: [{ className: 'PeerUser', userId: BigInt(100) }],
      results: [
        { className: 'PeerUser', userId: BigInt(200) },
      ],
      users: [user1, user2],
      chats: [],
    });

    // Batch of 5: all GetFullUser calls first, then all GetUserPhotos calls
    // GetFullUser for Alice, then GetFullUser for Alicia, then GetUserPhotos for each
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user1));
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user2, { about: 'Hi' }));
    mockInvoke.mockResolvedValueOnce({ count: 1, photos: [] });
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext({ global: true });
    await contactSearchAction.call(ctx as any, 'ali');

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const result = mockOutputSuccess.mock.calls[0][0];
    // Global mode: myResults + results (2 users)
    expect(result.results).toHaveLength(2);
    // Alice is from myResults -> isContact: true
    expect(result.results[0].isContact).toBe(true);
    // Alicia is from results -> isContact: false
    expect(result.results[1].isContact).toBe(false);
    expect(result.total).toBe(2);
  });

  it('handles empty results', async () => {
    // contacts.Search with no matches
    mockInvoke.mockResolvedValueOnce({
      myResults: [],
      results: [],
      users: [],
      chats: [],
    });

    const ctx = createMockCommandContext();
    await contactSearchAction.call(ctx as any, 'nonexistent');

    expect(mockOutputSuccess).toHaveBeenCalledWith({ results: [], total: 0 });
  });

  it('handles not-logged-in with NOT_AUTHENTICATED', async () => {
    mockStoreWithLock.mockImplementationOnce(async (_profile: string, fn: (s: string | null) => Promise<any>) => {
      return fn(null as any);
    });

    const ctx = createMockCommandContext();
    await contactSearchAction.call(ctx as any, 'alice');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Not logged in. Run: tg auth login',
      'NOT_AUTHENTICATED',
    );
  });
});
