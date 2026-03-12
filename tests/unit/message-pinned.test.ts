import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

// Mock output
const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
const mockLogStatus = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: (...args: any[]) => mockLogStatus(...args),
}));

// Hoisted mock state for telegram client
const {
  mockConnect,
  mockDestroy,
  mockGetMessages,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockGetMessages: vi.fn().mockResolvedValue([]),
}));

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  getMessages: mockGetMessages,
};

// Hoisted mock for InputMessagesFilterPinned
const { MockInputMessagesFilterPinned } = vi.hoisted(() => {
  class MockInputMessagesFilterPinned {}
  return { MockInputMessagesFilterPinned };
});

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: {
    StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
  },
  Api: {
    InputMessagesFilterPinned: MockInputMessagesFilterPinned,
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
const mockResolveEntity = vi.fn().mockResolvedValue({ id: BigInt(123), className: 'Channel' });
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
}));

// Mock serialize
const mockSerializeMessage = vi.fn().mockImplementation((msg: any, _sender?: any) => ({
  id: msg.id,
  text: msg.message ?? '',
  date: '2026-03-12T12:00:00.000Z',
  senderId: msg.senderId?.toString() ?? null,
  senderName: 'Test User',
  replyToMsgId: null,
  forwardFrom: null,
  mediaType: null,
  type: 'message',
}));
vi.mock('../../src/lib/serialize.js', () => ({
  serializeMessage: (...args: any[]) => mockSerializeMessage(...args),
}));

// Import after mocks
import { messagePinnedAction } from '../../src/commands/message/pinned.js';

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

// Helper to create mock message objects
function createMockMessage(overrides: Record<string, any> = {}) {
  const defaults = {
    id: 1,
    message: 'Hello world',
    date: 1710150900,
    senderId: BigInt(456),
    entities: [],
    media: null,
    action: null,
    replyTo: null,
    fwdFrom: null,
    _sender: { id: BigInt(456), firstName: 'Test', lastName: 'User' },
  };
  return { ...defaults, ...overrides };
}

describe('messagePinnedAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns pinned messages', async () => {
    const messages = [
      createMockMessage({ id: 10 }),
      createMockMessage({ id: 20 }),
    ];
    (messages as any).total = 5;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext();
    await messagePinnedAction.call(ctx as any, 'mychat');

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, 'mychat');
    expect(mockOutputSuccess).toHaveBeenCalledOnce();

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages).toHaveLength(2);
    expect(data.total).toBe(5);
  });

  it('empty chat returns empty result', async () => {
    const messages: any[] = [];
    (messages as any).total = 0;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext();
    await messagePinnedAction.call(ctx as any, 'mychat');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('pagination passes limit and addOffset', async () => {
    const messages: any[] = [];
    (messages as any).total = 0;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({ limit: '10', offset: '5' });
    await messagePinnedAction.call(ctx as any, 'mychat');

    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: 10,
        addOffset: 5,
      }),
    );
  });

  it('passes search empty string for pinned filter', async () => {
    const messages: any[] = [];
    (messages as any).total = 0;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext();
    await messagePinnedAction.call(ctx as any, 'mychat');

    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        search: '',
        filter: expect.any(MockInputMessagesFilterPinned),
      }),
    );
  });

  it('unauthenticated returns NOT_AUTHENTICATED', async () => {
    mockStoreWithLock.mockImplementationOnce(async (_profile: string, fn: (s: string | null) => Promise<any>) => {
      return fn(null);
    });

    const ctx = createMockCommandContext();
    await messagePinnedAction.call(ctx as any, 'mychat');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in'),
      'NOT_AUTHENTICATED',
    );
  });
});
