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
const { mockConnect, mockDestroy, mockInvoke, MockUser, MockChannel } = vi.hoisted(() => {
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
  return {
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockDestroy: vi.fn().mockResolvedValue(undefined),
    mockInvoke: vi.fn().mockResolvedValue(undefined),
    MockUser,
    MockChannel,
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
    UserStatusOnline: class { className = 'UserStatusOnline'; },
    UserStatusOffline: class {
      className = 'UserStatusOffline';
      wasOnline: number;
      constructor(data: any) { this.wasOnline = data?.wasOnline ?? 0; }
    },
    UserStatusRecently: class { className = 'UserStatusRecently'; },
    UserStatusLastWeek: class { className = 'UserStatusLastWeek'; },
    UserStatusLastMonth: class { className = 'UserStatusLastMonth'; },
    UserStatusEmpty: class { className = 'UserStatusEmpty'; },
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

// Mock errors
vi.mock('../../src/lib/errors.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/errors.js')>();
  return {
    ...actual,
    translateTelegramError: actual.translateTelegramError,
  };
});

import { userProfileAction } from '../../src/commands/user/profile.js';

// Create a mock Command context
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

// Helper to create a mock user entity returned by resolveEntity
function createMockUserEntity(overrides: Record<string, any> = {}) {
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

describe('userProfileAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a single user profile successfully', async () => {
    const user = createMockUserEntity();
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user));
    mockInvoke.mockResolvedValueOnce({ count: 5, photos: [] });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@alice');

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result.profiles).toHaveLength(1);
    expect(result.notFound).toEqual([]);

    const profile = result.profiles[0];
    expect(profile.id).toBe('100');
    expect(profile.firstName).toBe('Alice');
    expect(profile.lastName).toBe('Smith');
    expect(profile.username).toBe('alice');
    expect(profile.phone).toBe('+1234567890');
    expect(profile.bio).toBe('Hello world');
    expect(profile.photoCount).toBe(5);
    expect(profile.isBot).toBe(false);
    expect(profile.blocked).toBe(false);
    expect(profile.commonChatsCount).toBe(3);
    expect(profile.premium).toBe(false);
    expect(profile.verified).toBe(false);
    expect(profile.mutualContact).toBe(true);
    expect(profile.langCode).toBe('en');
  });

  it('handles comma-separated multi-user input', async () => {
    const user1 = createMockUserEntity({ id: BigInt(100), firstName: 'Alice', username: 'alice' });
    const user2 = createMockUserEntity({ id: BigInt(200), firstName: 'Bob', username: 'bob' });

    mockResolveEntity.mockResolvedValueOnce(user1);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user1));
    mockInvoke.mockResolvedValueOnce({ count: 2, photos: [] });

    mockResolveEntity.mockResolvedValueOnce(user2);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user2, { about: 'Hi' }));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@alice,@bob');

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result.profiles).toHaveLength(2);
    expect(result.notFound).toEqual([]);
  });

  it('adds unresolvable users to notFound array', async () => {
    const user1 = createMockUserEntity();
    mockResolveEntity.mockResolvedValueOnce(user1);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user1));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    mockResolveEntity.mockRejectedValueOnce(new Error('Peer not found'));

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@alice,@nonexistent');

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result.profiles).toHaveLength(1);
    expect(result.notFound).toEqual(['@nonexistent']);
  });

  it('rejects non-User entities (channels) as notFound', async () => {
    const channel = new MockChannel({});
    Object.assign(channel, { id: BigInt(300) });

    mockResolveEntity.mockResolvedValueOnce(channel);

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@somechannel');

    expect(mockOutputError).toHaveBeenCalledWith('No users found', 'NO_USERS_FOUND');
  });

  it('outputs NO_USERS_FOUND error when all inputs fail', async () => {
    mockResolveEntity.mockRejectedValueOnce(new Error('Peer not found'));
    mockResolveEntity.mockRejectedValueOnce(new Error('Peer not found'));

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@bad1,@bad2');

    expect(mockOutputError).toHaveBeenCalledWith('No users found', 'NO_USERS_FOUND');
    expect(mockOutputSuccess).not.toHaveBeenCalled();
  });

  it('maps UserStatusOnline to "online"', async () => {
    const user = createMockUserEntity({ status: { className: 'UserStatusOnline' } });
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@alice');

    const profile = mockOutputSuccess.mock.calls[0][0].profiles[0];
    expect(profile.lastSeen).toBe('online');
  });

  it('maps UserStatusOffline to ISO timestamp', async () => {
    const wasOnline = Math.floor(Date.now() / 1000);
    const user = createMockUserEntity({ status: { className: 'UserStatusOffline', wasOnline } });
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@alice');

    const profile = mockOutputSuccess.mock.calls[0][0].profiles[0];
    expect(profile.lastSeen).toBe(new Date(wasOnline * 1000).toISOString());
  });

  it('maps UserStatusRecently to "recently"', async () => {
    const user = createMockUserEntity({ status: { className: 'UserStatusRecently' } });
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@alice');

    const profile = mockOutputSuccess.mock.calls[0][0].profiles[0];
    expect(profile.lastSeen).toBe('recently');
  });

  it('maps UserStatusLastWeek to "within_week"', async () => {
    const user = createMockUserEntity({ status: { className: 'UserStatusLastWeek' } });
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@alice');

    const profile = mockOutputSuccess.mock.calls[0][0].profiles[0];
    expect(profile.lastSeen).toBe('within_week');
  });

  it('maps UserStatusLastMonth to "within_month"', async () => {
    const user = createMockUserEntity({ status: { className: 'UserStatusLastMonth' } });
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@alice');

    const profile = mockOutputSuccess.mock.calls[0][0].profiles[0];
    expect(profile.lastSeen).toBe('within_month');
  });

  it('maps UserStatusEmpty to "long_time_ago"', async () => {
    const user = createMockUserEntity({ status: { className: 'UserStatusEmpty' } });
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@alice');

    const profile = mockOutputSuccess.mock.calls[0][0].profiles[0];
    expect(profile.lastSeen).toBe('long_time_ago');
  });

  it('sets lastSeen to null for bots', async () => {
    const user = createMockUserEntity({
      bot: true,
      status: { className: 'UserStatusRecently' },
    });
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user, {
      botInfo: { placeholder: 'Search...', inlinePlaceholder: 'Search...' },
    }));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@botuser');

    const profile = mockOutputSuccess.mock.calls[0][0].profiles[0];
    expect(profile.lastSeen).toBeNull();
    expect(profile.isBot).toBe(true);
  });

  it('includes bot-specific fields when isBot is true', async () => {
    const user = createMockUserEntity({
      bot: true,
      botInlinePlaceholder: 'Search...',
    });
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user, {
      botInfo: { placeholder: 'Type to search' },
    }));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@botuser');

    const profile = mockOutputSuccess.mock.calls[0][0].profiles[0];
    expect(profile.isBot).toBe(true);
    expect(profile.botInlinePlaceholder).toBe('Search...');
    expect(profile.supportsInline).toBe(true);
  });

  it('does not include bot fields when isBot is false', async () => {
    const user = createMockUserEntity({ bot: false });
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@alice');

    const profile = mockOutputSuccess.mock.calls[0][0].profiles[0];
    expect(profile.isBot).toBe(false);
    expect(profile).not.toHaveProperty('botInlinePlaceholder');
    expect(profile).not.toHaveProperty('supportsInline');
  });

  it('sets phone to "[restricted]" for non-bot users with missing phone', async () => {
    const user = createMockUserEntity({ phone: undefined, bot: false });
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@alice');

    const profile = mockOutputSuccess.mock.calls[0][0].profiles[0];
    expect(profile.phone).toBe('[restricted]');
  });

  it('sets phone to null for bots with missing phone', async () => {
    const user = createMockUserEntity({ phone: undefined, bot: true });
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user, { botInfo: null }));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@botuser');

    const profile = mockOutputSuccess.mock.calls[0][0].profiles[0];
    expect(profile.phone).toBeNull();
  });

  it('falls back to photo count from photos array length', async () => {
    const user = createMockUserEntity();
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user));
    // No .count property, but has photos array
    mockInvoke.mockResolvedValueOnce({ photos: [{}, {}, {}] });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@alice');

    const profile = mockOutputSuccess.mock.calls[0][0].profiles[0];
    expect(profile.photoCount).toBe(3);
  });

  it('handles photo count error gracefully', async () => {
    const user = createMockUserEntity({ photo: { className: 'UserProfilePhoto' } });
    mockResolveEntity.mockResolvedValueOnce(user);
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user));
    // GetUserPhotos throws
    mockInvoke.mockRejectedValueOnce(new Error('Photos API error'));

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@alice');

    const profile = mockOutputSuccess.mock.calls[0][0].profiles[0];
    // Should fall back to 1 because user.photo is not empty
    expect(profile.photoCount).toBe(1);
  });

  it('handles NOT_AUTHENTICATED when no session', async () => {
    mockStoreWithLock.mockImplementationOnce(async (_profile: string, fn: (s: string | null) => Promise<any>) => {
      return fn(null as any);
    });

    const ctx = createMockCommandContext();
    await userProfileAction.call(ctx as any, '@alice');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Not logged in. Run: tg auth login',
      'NOT_AUTHENTICATED',
    );
  });
});
