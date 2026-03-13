import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

// Mock output
const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
}));

// Hoisted mock state for telegram client
const {
  mockConnect,
  mockDestroy,
  mockInvoke,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockInvoke: vi.fn().mockResolvedValue(undefined),
}));

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
    contacts: {
      GetBlocked: vi.fn().mockImplementation((opts: any) => ({ ...opts, _type: 'GetBlocked' })),
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

// Mock serialize (for bigIntToString)
vi.mock('../../src/lib/serialize.js', () => ({
  bigIntToString: (v: bigint) => String(v),
}));

// Mock errors (use actual translateTelegramError)
vi.mock('../../src/lib/errors.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/errors.js')>();
  return {
    ...actual,
    translateTelegramError: actual.translateTelegramError,
  };
});

// Import after mocks
import { userBlockedAction } from '../../src/commands/user/blocked.js';

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
      limit: '50',
      offset: '0',
      ...opts,
    })),
  };
}

describe('userBlockedAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns blocked users with correct structure', async () => {
    mockInvoke.mockResolvedValueOnce({
      blocked: [
        { peerId: { userId: BigInt(100) } },
        { peerId: { userId: BigInt(200) } },
      ],
      users: [
        { id: BigInt(100), firstName: 'Alice', lastName: 'Smith', username: 'alice', bot: false, className: 'User' },
        { id: BigInt(200), firstName: 'Bob', lastName: null, username: null, bot: true, className: 'User' },
      ],
      count: 5,
      className: 'contacts.BlockedSlice',
    });

    const ctx = createMockCommandContext();
    await userBlockedAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledWith({
      users: [
        { id: '100', firstName: 'Alice', lastName: 'Smith', username: 'alice', isBot: false },
        { id: '200', firstName: 'Bob', lastName: null, username: null, isBot: true },
      ],
      total: 5,
    });
  });

  it('returns empty list for no blocked users', async () => {
    mockInvoke.mockResolvedValueOnce({
      blocked: [],
      users: [],
      className: 'contacts.Blocked',
    });

    const ctx = createMockCommandContext();
    await userBlockedAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledWith({
      users: [],
      total: 0,
    });
  });

  it('uses .count for BlockedSlice response type', async () => {
    mockInvoke.mockResolvedValueOnce({
      blocked: [
        { peerId: { userId: BigInt(300) } },
      ],
      users: [
        { id: BigInt(300), firstName: 'Carol', lastName: null, username: 'carol', bot: false, className: 'User' },
      ],
      count: 42,
      className: 'contacts.BlockedSlice',
    });

    const ctx = createMockCommandContext({ limit: '10', offset: '5' });
    await userBlockedAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledWith({
      users: [
        { id: '300', firstName: 'Carol', lastName: null, username: 'carol', isBot: false },
      ],
      total: 42,
    });
  });

  it('uses blocked.length for Blocked response type (no .count)', async () => {
    mockInvoke.mockResolvedValueOnce({
      blocked: [
        { peerId: { userId: BigInt(400) } },
        { peerId: { userId: BigInt(500) } },
      ],
      users: [
        { id: BigInt(400), firstName: 'Dave', lastName: null, username: null, bot: false, className: 'User' },
        { id: BigInt(500), firstName: 'Eve', lastName: null, username: 'eve', bot: false, className: 'User' },
      ],
      className: 'contacts.Blocked',
    });

    const ctx = createMockCommandContext();
    await userBlockedAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledWith({
      users: [
        { id: '400', firstName: 'Dave', lastName: null, username: null, isBot: false },
        { id: '500', firstName: 'Eve', lastName: null, username: 'eve', isBot: false },
      ],
      total: 2,
    });
  });

  it('translates RPCError via translateTelegramError', async () => {
    mockInvoke.mockRejectedValueOnce({ errorMessage: 'PEER_ID_INVALID' });

    const ctx = createMockCommandContext();
    await userBlockedAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      'Peer not found',
      'PEER_ID_INVALID',
    );
  });
});
