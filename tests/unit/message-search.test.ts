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

// Hoisted mock classes for telegram Api
const {
  MockInputMessagesFilterPhotos,
  MockMediaPhoto,
  MockMediaDocument,
  MockMediaPoll,
  MockAttrSticker,
  MockAttrVideo,
  MockAttrAudio,
  MockAttrFilename,
  MockAttrImageSize,
  MockActionChatCreate,
} = vi.hoisted(() => ({
  MockInputMessagesFilterPhotos: class {},
  MockMediaPhoto: class {},
  MockMediaDocument: class {},
  MockMediaPoll: class {},
  MockAttrSticker: class { alt = ''; },
  MockAttrVideo: class {},
  MockAttrAudio: class { voice = false; },
  MockAttrFilename: class { fileName = ''; },
  MockAttrImageSize: class { w = 0; h = 0; },
  MockActionChatCreate: class {},
}));

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: {
    StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
  },
  Api: {
    InputMessagesFilterPhotos: MockInputMessagesFilterPhotos,
    InputMessagesFilterVideo: class {},
    InputMessagesFilterDocument: class {},
    InputMessagesFilterUrl: class {},
    InputMessagesFilterVoice: class {},
    InputMessagesFilterMusic: class {},
    InputMessagesFilterGif: class {},
    InputMessagesFilterRoundVideo: class {},
    MessageMediaPhoto: MockMediaPhoto,
    MessageMediaDocument: MockMediaDocument,
    MessageMediaPoll: MockMediaPoll,
    DocumentAttributeSticker: MockAttrSticker,
    DocumentAttributeVideo: MockAttrVideo,
    DocumentAttributeAudio: MockAttrAudio,
    DocumentAttributeFilename: MockAttrFilename,
    DocumentAttributeImageSize: MockAttrImageSize,
    MessageActionChatCreate: MockActionChatCreate,
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
const mockAssertForum = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
  assertForum: (...args: any[]) => mockAssertForum(...args),
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

  // ---- Filter tests (Phase 4) ----

  it('succeeds with --filter and no --query', async () => {
    const messages: any[] = [];
    (messages as any).total = 0;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({ filter: 'photos', chat: 'mychat' });
    await messageSearchAction.call(ctx as any);

    expect(mockOutputError).not.toHaveBeenCalled();
    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        search: '',
        filter: expect.any(MockInputMessagesFilterPhotos),
      }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
  });

  it('works with both --filter and --query together', async () => {
    const messages: any[] = [];
    (messages as any).total = 0;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({ filter: 'photos', query: 'landscape', chat: 'mychat' });
    await messageSearchAction.call(ctx as any);

    expect(mockOutputError).not.toHaveBeenCalled();
    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        search: 'landscape',
        filter: expect.any(MockInputMessagesFilterPhotos),
      }),
    );
  });

  it('errors when neither --query nor --filter provided', async () => {
    const ctx = createMockCommandContext({ query: undefined, filter: undefined });
    await messageSearchAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('--query'),
      'MISSING_QUERY',
    );
    expect(mockGetMessages).not.toHaveBeenCalled();
  });

  it('errors with invalid filter name', async () => {
    const ctx = createMockCommandContext({ filter: 'invalid_filter', chat: 'mychat' });
    await messageSearchAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Unknown filter'),
      'INVALID_FILTER',
    );
    expect(mockGetMessages).not.toHaveBeenCalled();
  });

  it('backward compatible: query-only search still works', async () => {
    const messages = [
      createMockMessage({ id: 50, message: 'old style search' }),
    ];
    (messages as any).total = 1;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({ query: 'old', chat: 'mychat' });
    await messageSearchAction.call(ctx as any);

    expect(mockOutputError).not.toHaveBeenCalled();
    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        search: 'old',
      }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
  });

  // ---- Multi-chat search tests (Phase 5, Plan 03, READ-06) ----

  it('multi-chat search resolves each chat and merges results', async () => {
    // Chat A results
    const msgsA = [
      createMockMessage({
        id: 10, message: 'A result', date: 1710300000,
        peerId: { channelId: BigInt(100), chatId: null, userId: null },
        chat: { title: 'Chat A' },
      }),
    ];
    (msgsA as any).total = 1;

    // Chat B results
    const msgsB = [
      createMockMessage({
        id: 20, message: 'B result', date: 1710400000,
        peerId: { channelId: BigInt(200), chatId: null, userId: null },
        chat: { title: 'Chat B' },
      }),
    ];
    (msgsB as any).total = 1;

    mockResolveEntity
      .mockResolvedValueOnce({ id: BigInt(100), className: 'Channel' })
      .mockResolvedValueOnce({ id: BigInt(200), className: 'Channel' });
    mockGetMessages
      .mockResolvedValueOnce(msgsA)
      .mockResolvedValueOnce(msgsB);

    const ctx = createMockCommandContext({ chat: '@chatA,@chatB', query: 'test' });
    await messageSearchAction.call(ctx as any);

    expect(mockResolveEntity).toHaveBeenCalledTimes(2);
    expect(mockGetMessages).toHaveBeenCalledTimes(2);
    expect(mockOutputSuccess).toHaveBeenCalledOnce();

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages).toHaveLength(2);
    // Sorted newest first (B has later date)
    expect(data.messages[0].chatTitle).toBe('Chat B');
    expect(data.messages[1].chatTitle).toBe('Chat A');
    // Each has chatId and chatTitle
    expect(data.messages[0]).toHaveProperty('chatId');
    expect(data.messages[0]).toHaveProperty('chatTitle');
  });

  it('multi-chat search truncates to --limit total', async () => {
    const msgsA = [
      createMockMessage({ id: 1, date: 1710100000, peerId: { channelId: BigInt(100), chatId: null, userId: null }, chat: { title: 'A' } }),
      createMockMessage({ id: 2, date: 1710200000, peerId: { channelId: BigInt(100), chatId: null, userId: null }, chat: { title: 'A' } }),
    ];
    (msgsA as any).total = 2;

    const msgsB = [
      createMockMessage({ id: 3, date: 1710300000, peerId: { channelId: BigInt(200), chatId: null, userId: null }, chat: { title: 'B' } }),
    ];
    (msgsB as any).total = 1;

    mockResolveEntity
      .mockResolvedValueOnce({ id: BigInt(100), className: 'Channel' })
      .mockResolvedValueOnce({ id: BigInt(200), className: 'Channel' });
    mockGetMessages
      .mockResolvedValueOnce(msgsA)
      .mockResolvedValueOnce(msgsB);

    const ctx = createMockCommandContext({ chat: '@chatA,@chatB', query: 'test', limit: '2' });
    await messageSearchAction.call(ctx as any);

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages).toHaveLength(2);
    expect(data.total).toBe(2);
  });

  it('multi-chat search logs warning on individual chat failure and continues', async () => {
    const msgsB = [
      createMockMessage({
        id: 5, date: 1710100000,
        peerId: { channelId: BigInt(200), chatId: null, userId: null },
        chat: { title: 'Chat B' },
      }),
    ];
    (msgsB as any).total = 1;

    mockResolveEntity
      .mockRejectedValueOnce(new Error('Chat A not found'))
      .mockResolvedValueOnce({ id: BigInt(200), className: 'Channel' });
    mockGetMessages.mockResolvedValueOnce(msgsB);

    const ctx = createMockCommandContext({ chat: '@chatA,@chatB', query: 'test' });
    await messageSearchAction.call(ctx as any);

    // Warning logged to stderr
    expect(mockLogStatus).toHaveBeenCalledWith(
      expect.stringContaining('Warning'),
      expect.anything(),
    );
    // Results from chat B still returned
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].chatTitle).toBe('Chat B');
  });

  it('single-chat search with --topic passes replyTo to getMessages', async () => {
    const messages: any[] = [];
    (messages as any).total = 0;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({ chat: 'mychat', query: 'test', topic: '42' });
    await messageSearchAction.call(ctx as any);

    expect(mockAssertForum).toHaveBeenCalledWith(
      expect.objectContaining({ className: 'Channel' }),
      42,
    );
    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ replyTo: 42 }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
  });

  it('--topic with multi-chat search returns INVALID_OPTIONS error', async () => {
    const ctx = createMockCommandContext({ chat: '@a,@b', query: 'test', topic: '42' });
    await messageSearchAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      '--topic cannot be used with multi-chat search',
      'INVALID_OPTIONS',
    );
    expect(mockGetMessages).not.toHaveBeenCalled();
  });

  it('multi-chat search applies --offset after merge, not per-chat', async () => {
    // 3 results per chat, request offset=2 limit=2 — should skip first 2 merged results
    const msgsA = [
      createMockMessage({ id: 1, date: 1710100000, peerId: { channelId: BigInt(100), chatId: null, userId: null }, chat: { title: 'A' } }),
      createMockMessage({ id: 2, date: 1710200000, peerId: { channelId: BigInt(100), chatId: null, userId: null }, chat: { title: 'A' } }),
      createMockMessage({ id: 3, date: 1710500000, peerId: { channelId: BigInt(100), chatId: null, userId: null }, chat: { title: 'A' } }),
    ];
    (msgsA as any).total = 3;

    const msgsB = [
      createMockMessage({ id: 4, date: 1710300000, peerId: { channelId: BigInt(200), chatId: null, userId: null }, chat: { title: 'B' } }),
      createMockMessage({ id: 5, date: 1710400000, peerId: { channelId: BigInt(200), chatId: null, userId: null }, chat: { title: 'B' } }),
    ];
    (msgsB as any).total = 2;

    mockResolveEntity
      .mockResolvedValueOnce({ id: BigInt(100), className: 'Channel' })
      .mockResolvedValueOnce({ id: BigInt(200), className: 'Channel' });
    mockGetMessages
      .mockResolvedValueOnce(msgsA)
      .mockResolvedValueOnce(msgsB);

    const ctx = createMockCommandContext({ chat: '@chatA,@chatB', query: 'test', limit: '2', offset: '2' });
    await messageSearchAction.call(ctx as any);

    const data = mockOutputSuccess.mock.calls[0][0];
    // Merged sorted: id3(500k), id5(400k), id4(300k), id2(200k), id1(100k)
    // After offset=2: id4(300k), id2(200k) — then limit=2
    expect(data.messages).toHaveLength(2);
    expect(data.total).toBe(2);
  });

  it('all flags compose: multi-chat + filter + query + limit', async () => {
    const msgs = [
      createMockMessage({
        id: 1, date: 1710100000,
        peerId: { channelId: BigInt(100), chatId: null, userId: null },
        chat: { title: 'Chat A' },
      }),
    ];
    (msgs as any).total = 1;

    mockResolveEntity.mockResolvedValueOnce({ id: BigInt(100), className: 'Channel' });
    mockGetMessages.mockResolvedValueOnce(msgs);

    const ctx = createMockCommandContext({ chat: '@chatA', query: 'sunset', filter: 'photos', limit: '20' });
    await messageSearchAction.call(ctx as any);

    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        search: 'sunset',
        limit: 20,
        filter: expect.any(MockInputMessagesFilterPhotos),
      }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
  });
});
