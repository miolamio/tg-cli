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
      AddContact: vi.fn(),
      ImportContacts: vi.fn(),
      DeleteContacts: vi.fn(),
    },
    InputPhoneContact: vi.fn(),
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

import { contactAddAction } from '../../src/commands/contact/add.js';

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

describe('contactAddAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
  });

  it('adds by username successfully via resolveEntity + AddContact + GetFullUser', async () => {
    const user = createMockUserEntity();
    mockResolveEntity.mockResolvedValueOnce(user);

    // AddContact returns updates
    mockInvoke.mockResolvedValueOnce({ updates: [] });
    // GetFullUser returns full profile
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user));
    // GetUserPhotos returns count
    mockInvoke.mockResolvedValueOnce({ count: 2, photos: [] });

    const ctx = createMockCommandContext();
    await contactAddAction.call(ctx as any, '@alice');

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, '@alice');
    expect(mockOutputSuccess).toHaveBeenCalledOnce();

    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result.id).toBe('100');
    expect(result.firstName).toBe('Alice');
    expect(result.lastName).toBe('Smith');
    expect(result.username).toBe('alice');
    expect(result.bio).toBe('Hello world');
    expect(result.photoCount).toBe(2);
  });

  it('adds by phone (+1234567890) with --first-name via ImportContacts', async () => {
    const importedUser = createMockUserEntity({ id: BigInt(200), username: 'bob', firstName: 'Bob' });

    // ImportContacts returns the imported user
    mockInvoke.mockResolvedValueOnce({
      users: [importedUser],
      imported: [{ userId: BigInt(200) }],
      retryContacts: [],
    });
    // GetFullUser returns full profile
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(importedUser, { about: 'Hi' }));
    // GetUserPhotos
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext({ firstName: 'Bob' });
    await contactAddAction.call(ctx as any, '+1234567890');

    // Should NOT call resolveEntity for phone input
    expect(mockResolveEntity).not.toHaveBeenCalled();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();

    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result.id).toBe('200');
    expect(result.firstName).toBe('Bob');
  });

  it('phone without --first-name produces MISSING_FIRST_NAME error', async () => {
    const ctx = createMockCommandContext(); // no firstName
    await contactAddAction.call(ctx as any, '+1234567890');

    expect(mockOutputError).toHaveBeenCalledWith(
      '--first-name is required when adding by phone number',
      'MISSING_FIRST_NAME',
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('phone not on Telegram (empty users) produces PHONE_NOT_FOUND error', async () => {
    // ImportContacts returns empty users
    mockInvoke.mockResolvedValueOnce({
      users: [],
      imported: [],
      retryContacts: [BigInt(123)],
    });

    const ctx = createMockCommandContext({ firstName: 'Unknown' });
    await contactAddAction.call(ctx as any, '+9999999999');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Phone number not found on Telegram',
      'PHONE_NOT_FOUND',
    );
  });

  it('non-user entity produces NOT_A_USER error', async () => {
    const channel = new MockChannel({});
    Object.assign(channel, { id: BigInt(300) });

    mockResolveEntity.mockResolvedValueOnce(channel);

    const ctx = createMockCommandContext();
    await contactAddAction.call(ctx as any, '@somechannel');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Not a user: this is a group/channel',
      'NOT_A_USER',
    );
  });

  it('all-digit input treated as phone (ImportContacts route)', async () => {
    const importedUser = createMockUserEntity({ id: BigInt(300), firstName: 'Charlie' });

    // ImportContacts
    mockInvoke.mockResolvedValueOnce({
      users: [importedUser],
      imported: [{ userId: BigInt(300) }],
      retryContacts: [],
    });
    // GetFullUser
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(importedUser));
    // GetUserPhotos
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext({ firstName: 'Charlie' });
    await contactAddAction.call(ctx as any, '1234567890');

    // Should NOT call resolveEntity — all-digit input is treated as phone
    expect(mockResolveEntity).not.toHaveBeenCalled();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
  });

  it('handles RPCError via translateTelegramError', async () => {
    const user = createMockUserEntity();
    mockResolveEntity.mockResolvedValueOnce(user);

    // AddContact throws RPCError
    mockInvoke.mockRejectedValueOnce({ errorMessage: 'CONTACT_ID_INVALID' });

    const ctx = createMockCommandContext();
    await contactAddAction.call(ctx as any, '@alice');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Contact not found',
      'CONTACT_ID_INVALID',
    );
  });
});
