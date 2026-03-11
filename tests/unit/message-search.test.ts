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

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: {
    StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
  },
  Api: {},
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
    peerId: { channelId: BigInt(100), chatId: null, userId: null },
    chat: { title: 'Test Chat' },
  };
  return { ...defaults, ...overrides };
}

// Import after mocks
import { messageSearchAction } from '../../src/commands/message/search.js';

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
      query: undefined,
      chat: undefined,
      limit: '50',
      offset: '0',
      ...opts,
    })),
  };
}

describe('messageSearchAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches within a specific chat when --chat is provided', async () => {
    const messages = [
      createMockMessage({ id: 5, message: 'Found keyword here' }),
    ];
    (messages as any).total = 1;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({ chat: 'mychat', query: 'keyword' });
    await messageSearchAction.call(ctx as any);

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, 'mychat');
    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        search: 'keyword',
      }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages).toHaveLength(1);
    expect(data.total).toBe(1);
  });

  it('searches globally when --chat is not provided', async () => {
    const messages = [
      createMockMessage({
        id: 10,
        message: 'Global result',
        peerId: { channelId: BigInt(200), chatId: null, userId: null },
        chat: { title: 'Some Channel' },
      }),
    ];
    (messages as any).total = 1;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({ query: 'keyword' });
    await messageSearchAction.call(ctx as any);

    // Should NOT call resolveEntity for global search
    expect(mockResolveEntity).not.toHaveBeenCalled();
    // Should call getMessages with undefined entity
    expect(mockGetMessages).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        search: 'keyword',
      }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
  });

  it('global search results include chatId and chatTitle', async () => {
    const messages = [
      createMockMessage({
        id: 10,
        message: 'Result one',
        peerId: { channelId: BigInt(200), chatId: null, userId: null },
        chat: { title: 'Channel Alpha' },
      }),
      createMockMessage({
        id: 20,
        message: 'Result two',
        peerId: { channelId: null, chatId: BigInt(300), userId: null },
        chat: { title: 'Group Beta' },
      }),
    ];
    (messages as any).total = 2;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({ query: 'keyword' });
    await messageSearchAction.call(ctx as any);

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0]).toHaveProperty('chatId');
    expect(data.messages[0]).toHaveProperty('chatTitle');
    expect(data.messages[0].chatId).toBe('200');
    expect(data.messages[0].chatTitle).toBe('Channel Alpha');
    expect(data.messages[1].chatId).toBe('300');
    expect(data.messages[1].chatTitle).toBe('Group Beta');
  });

  it('outputs error when --query is missing', async () => {
    const ctx = createMockCommandContext({ query: undefined });
    await messageSearchAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('--query'),
      'MISSING_QUERY',
    );
    expect(mockGetMessages).not.toHaveBeenCalled();
  });

  it('applies --limit and --offset pagination', async () => {
    const messages: any[] = [];
    (messages as any).total = 100;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({ chat: 'mychat', query: 'test', limit: '10', offset: '5' });
    await messageSearchAction.call(ctx as any);

    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: 10,
        addOffset: 5,
        search: 'test',
      }),
    );
  });

  it('global search resolves DM chat names from firstName/lastName', async () => {
    const messages = [
      createMockMessage({
        id: 30,
        message: 'DM result',
        peerId: { channelId: null, chatId: null, userId: BigInt(400) },
        chat: { firstName: 'John', lastName: 'Doe', title: undefined },
      }),
    ];
    (messages as any).total = 1;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({ query: 'keyword' });
    await messageSearchAction.call(ctx as any);

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages[0].chatTitle).toBe('John Doe');
    expect(data.messages[0].chatId).toBe('400');
  });

  it('global search resolves DM chat names with firstName only', async () => {
    const messages = [
      createMockMessage({
        id: 31,
        message: 'DM result 2',
        peerId: { channelId: null, chatId: null, userId: BigInt(500) },
        chat: { firstName: 'Alice', lastName: undefined, title: undefined },
      }),
    ];
    (messages as any).total = 1;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({ query: 'keyword' });
    await messageSearchAction.call(ctx as any);

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages[0].chatTitle).toBe('Alice');
  });

  it('outputs error when not logged in', async () => {
    mockStoreWithLock.mockImplementationOnce(async (_profile: string, fn: (s: string) => Promise<any>) => {
      return fn('');
    });

    const ctx = createMockCommandContext({ query: 'keyword' });
    await messageSearchAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in'),
      'NOT_AUTHENTICATED',
    );
  });
});
