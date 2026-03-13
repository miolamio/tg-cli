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
      GetContacts: vi.fn(),
      DeleteContacts: vi.fn(),
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

import { contactListAction } from '../../src/commands/contact/list.js';

function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default',
      quiet: false,
      config: undefined,
      json: true,
      human: false,
      verbose: false,
      limit: '50',
      offset: '0',
      ...opts,
    })),
  };
}

// Helper to create a mock user for GetContacts result
function createMockContactUser(overrides: Record<string, any> = {}) {
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

describe('contactListAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
  });

  it('lists contacts successfully with GetContacts + GetFullUser enrichment', async () => {
    const user1 = createMockContactUser({ id: BigInt(100), firstName: 'Alice', lastName: 'Smith', username: 'alice' });
    const user2 = createMockContactUser({ id: BigInt(200), firstName: 'Bob', lastName: 'Jones', username: 'bob' });

    // GetContacts result
    mockInvoke.mockResolvedValueOnce({
      className: 'contacts.Contacts',
      contacts: [
        { userId: BigInt(100), mutual: true },
        { userId: BigInt(200), mutual: false },
      ],
      users: [user1, user2],
    });

    // In batch of 5, both GetFullUser calls happen concurrently (map starts both),
    // then both GetUserPhotos calls happen after each GetFullUser resolves.
    // Mock order: GetFullUser(Alice), GetFullUser(Bob), GetUserPhotos(Alice), GetUserPhotos(Bob)
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user1));
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(user2, { about: 'Hi there' }));
    mockInvoke.mockResolvedValueOnce({ count: 2, photos: [] });
    mockInvoke.mockResolvedValueOnce({ count: 1, photos: [] });

    const ctx = createMockCommandContext();
    await contactListAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result.contacts).toHaveLength(2);
    expect(result.total).toBe(2);
    // Sorted alphabetically: Alice before Bob
    expect(result.contacts[0].firstName).toBe('Alice');
    expect(result.contacts[1].firstName).toBe('Bob');
  });

  it('handles ContactsNotModified with empty contacts', async () => {
    // ContactsNotModified response
    mockInvoke.mockResolvedValueOnce({
      className: 'contacts.ContactsNotModified',
    });

    const ctx = createMockCommandContext();
    await contactListAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledWith({ contacts: [], total: 0 });
  });

  it('applies limit/offset pagination correctly', async () => {
    const users = [];
    const contacts = [];
    for (let i = 0; i < 5; i++) {
      const user = createMockContactUser({
        id: BigInt(100 + i),
        firstName: `User${String.fromCharCode(65 + i)}`, // UserA, UserB, UserC, UserD, UserE
        lastName: '',
        username: `user${i}`,
      });
      users.push(user);
      contacts.push({ userId: BigInt(100 + i), mutual: true });
    }

    // GetContacts
    mockInvoke.mockResolvedValueOnce({
      className: 'contacts.Contacts',
      contacts,
      users,
    });

    // Batch of 5: GetFullUser calls first, then GetUserPhotos calls
    // After sort: UserA(0), UserB(1), UserC(2), UserD(3), UserE(4) -> offset=1 limit=2 -> UserB, UserC
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(users[1]));
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(users[2]));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext({ limit: '2', offset: '1' });
    await contactListAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result.contacts).toHaveLength(2);
    expect(result.total).toBe(5); // Total before pagination
    expect(result.contacts[0].firstName).toBe('UserB');
    expect(result.contacts[1].firstName).toBe('UserC');
  });

  it('sorts contacts alphabetically by firstName + lastName', async () => {
    const charlie = createMockContactUser({ id: BigInt(100), firstName: 'Charlie', lastName: 'Z', username: 'charlie' });
    const alice = createMockContactUser({ id: BigInt(200), firstName: 'Alice', lastName: 'B', username: 'alice' });
    const bob = createMockContactUser({ id: BigInt(300), firstName: 'Bob', lastName: 'A', username: 'bob' });

    mockInvoke.mockResolvedValueOnce({
      className: 'contacts.Contacts',
      contacts: [
        { userId: BigInt(100), mutual: true },
        { userId: BigInt(200), mutual: true },
        { userId: BigInt(300), mutual: true },
      ],
      users: [charlie, alice, bob],
    });

    // Batch of 5: all GetFullUser calls first, then all GetUserPhotos calls (sorted: Alice, Bob, Charlie)
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(alice));
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(bob));
    mockInvoke.mockResolvedValueOnce(createMockFullUserResult(charlie));
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });
    mockInvoke.mockResolvedValueOnce({ count: 0, photos: [] });

    const ctx = createMockCommandContext();
    await contactListAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result.contacts[0].firstName).toBe('Alice');
    expect(result.contacts[1].firstName).toBe('Bob');
    expect(result.contacts[2].firstName).toBe('Charlie');
  });

  it('handles not-logged-in with NOT_AUTHENTICATED', async () => {
    mockStoreWithLock.mockImplementationOnce(async (_profile: string, fn: (s: string | null) => Promise<any>) => {
      return fn(null as any);
    });

    const ctx = createMockCommandContext();
    await contactListAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      'Not logged in. Run: tg auth login',
      'NOT_AUTHENTICATED',
    );
  });
});
