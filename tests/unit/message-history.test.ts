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
    date: 1710150900, // 2024-03-11T09:55:00Z
    senderId: BigInt(456),
    entities: [],
    media: null,
    action: null,
    replyTo: null,
    fwdFrom: null,
  };
  return { ...defaults, ...overrides };
}

// Import after mocks
import { messageHistoryAction } from '../../src/commands/message/history.js';

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

describe('messageHistoryAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns messages array and total count for a chat', async () => {
    const messages = [
      createMockMessage({ id: 10, message: 'Message 10' }),
      createMockMessage({ id: 9, message: 'Message 9' }),
    ];
    (messages as any).total = 50;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext();
    await messageHistoryAction.call(ctx as any, 'testchat');

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, 'testchat');
    expect(mockGetMessages).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages).toHaveLength(2);
    expect(data.total).toBe(50);
    expect(data.messages[0].id).toBe(10);
    expect(data.messages[1].id).toBe(9);
  });

  it('passes --limit and --offset as pagination params', async () => {
    const messages: any[] = [];
    (messages as any).total = 100;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({ limit: '10', offset: '5' });
    await messageHistoryAction.call(ctx as any, 'testchat');

    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: 10,
        addOffset: 5,
      }),
    );
  });

  it('filters messages by --since date (post-filter)', async () => {
    const messages = [
      createMockMessage({ id: 3, date: 1710300000 }), // 2024-03-13
      createMockMessage({ id: 2, date: 1710200000 }), // 2024-03-12
      createMockMessage({ id: 1, date: 1710100000 }), // 2024-03-11
    ];
    (messages as any).total = 3;
    mockGetMessages.mockResolvedValueOnce(messages);

    // Filter: only messages after March 12 midnight
    const ctx = createMockCommandContext({ since: '2024-03-12T00:00:00Z' });
    await messageHistoryAction.call(ctx as any, 'testchat');

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    // Should include only messages on or after March 12
    expect(data.messages.every((m: any) => new Date(m.date).getTime() >= new Date('2024-03-12T00:00:00Z').getTime())).toBe(true);
  });

  it('sets offsetDate when --until is provided', async () => {
    const messages: any[] = [];
    (messages as any).total = 0;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({ until: '2024-03-10T00:00:00Z' });
    await messageHistoryAction.call(ctx as any, 'testchat');

    const expectedTimestamp = Math.floor(new Date('2024-03-10T00:00:00Z').getTime() / 1000);
    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        offsetDate: expectedTimestamp,
      }),
    );
  });

  it('applies both --since and --until together', async () => {
    const messages = [
      createMockMessage({ id: 3, date: 1710300000 }), // 2024-03-13
      createMockMessage({ id: 2, date: 1710200000 }), // 2024-03-12
    ];
    (messages as any).total = 2;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({
      since: '2024-03-12T00:00:00Z',
      until: '2024-03-14T00:00:00Z',
    });
    await messageHistoryAction.call(ctx as any, 'testchat');

    // --until should set offsetDate
    const untilTimestamp = Math.floor(new Date('2024-03-14T00:00:00Z').getTime() / 1000);
    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        offsetDate: untilTimestamp,
      }),
    );

    // --since should post-filter
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty chat (no messages)', async () => {
    const messages: any[] = [];
    (messages as any).total = 0;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext();
    await messageHistoryAction.call(ctx as any, 'emptychat');

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages).toHaveLength(0);
    expect(data.total).toBe(0);
  });

  it('outputs error when not logged in', async () => {
    mockStoreWithLock.mockImplementationOnce(async (_profile: string, fn: (s: string) => Promise<any>) => {
      return fn('');
    });

    const ctx = createMockCommandContext();
    await messageHistoryAction.call(ctx as any, 'testchat');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in'),
      'NOT_AUTHENTICATED',
    );
  });

  // ---- Topic tests (Phase 5, Plan 03) ----

  it('passes replyTo to getMessages when --topic is provided', async () => {
    const messages: any[] = [];
    (messages as any).total = 0;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext({ topic: '42' });
    await messageHistoryAction.call(ctx as any, 'testchat');

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

  it('does not pass replyTo when --topic is not provided', async () => {
    const messages: any[] = [];
    (messages as any).total = 0;
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext();
    await messageHistoryAction.call(ctx as any, 'testchat');

    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ replyTo: expect.anything() }),
    );
  });

  it('outputs error for non-forum entity when --topic is used', async () => {
    const { TgError } = await import('../../src/lib/errors.js');
    mockAssertForum.mockRejectedValueOnce(
      new TgError('Chat is not a forum-enabled supergroup', 'NOT_A_FORUM'),
    );

    const ctx = createMockCommandContext({ topic: '42' });
    await messageHistoryAction.call(ctx as any, 'testchat');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Chat is not a forum-enabled supergroup',
      'NOT_A_FORUM',
    );
  });

  it('outputs error for invalid topic ID', async () => {
    const ctx = createMockCommandContext({ topic: 'abc' });
    await messageHistoryAction.call(ctx as any, 'testchat');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Invalid topic ID: must be a number',
      'INVALID_TOPIC_ID',
    );
    expect(mockGetMessages).not.toHaveBeenCalled();
  });
});
