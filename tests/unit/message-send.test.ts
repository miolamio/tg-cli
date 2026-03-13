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
  mockSendMessage,
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
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockSendMessage: vi.fn().mockResolvedValue({}),
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

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  sendMessage: mockSendMessage,
};

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: {
    StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
  },
  Api: {
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
import { messageSendAction } from '../../src/commands/message/send.js';

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

describe('messageSendAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset sendMessage to return a valid message by default
    mockSendMessage.mockResolvedValue(createMockMessage({ id: 100, message: 'Test message' }));
  });

  it('sends a text message and returns serialized MessageItem', async () => {
    const ctx = createMockCommandContext();
    await messageSendAction.call(ctx as any, 'testchat', 'Hello world');

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, 'testchat');
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'Hello world' }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('text');
    expect(data).toHaveProperty('date');
  });

  it('sends a reply when --reply-to is provided', async () => {
    const ctx = createMockCommandContext({ replyTo: '42' });
    await messageSendAction.call(ctx as any, 'testchat', 'Reply text');

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'Reply text', replyTo: 42 }),
    );
  });

  it('parses replyTo as integer', async () => {
    const ctx = createMockCommandContext({ replyTo: '999' });
    await messageSendAction.call(ctx as any, 'testchat', 'Reply');

    const callArgs = mockSendMessage.mock.calls[0][1];
    expect(callArgs.replyTo).toBe(999);
    expect(typeof callArgs.replyTo).toBe('number');
  });

  it('outputs error for empty text', async () => {
    const ctx = createMockCommandContext();
    await messageSendAction.call(ctx as any, 'testchat', '');

    expect(mockOutputError).toHaveBeenCalledWith('Message text is required', 'EMPTY_MESSAGE');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('outputs error when not logged in', async () => {
    mockStoreWithLock.mockImplementationOnce(async (_profile: string, fn: (s: string) => Promise<any>) => {
      return fn('');
    });

    const ctx = createMockCommandContext();
    await messageSendAction.call(ctx as any, 'testchat', 'Hello');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in'),
      'NOT_AUTHENTICATED',
    );
  });

  it('outputs STDIN_REQUIRED error when text is "-" and stdin is TTY', async () => {
    // Save original
    const origIsTTY = process.stdin.isTTY;
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      const ctx = createMockCommandContext();
      await messageSendAction.call(ctx as any, 'testchat', '-');

      expect(mockOutputError).toHaveBeenCalledWith(
        expect.stringContaining('requires piped input'),
        'STDIN_REQUIRED',
      );
      expect(mockSendMessage).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true });
    }
  });

  it('reads from stdin when text is "-" and stdin is piped', async () => {
    // Save original
    const origIsTTY = process.stdin.isTTY;
    const origStdin = process.stdin[Symbol.asyncIterator];
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });

      // Mock stdin as async iterable
      const stdinContent = Buffer.from('piped message content\n');
      (process.stdin as any)[Symbol.asyncIterator] = async function* () {
        yield stdinContent;
      };

      const ctx = createMockCommandContext();
      await messageSendAction.call(ctx as any, 'testchat', '-');

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ message: 'piped message content' }),
      );
      expect(mockOutputSuccess).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true });
      (process.stdin as any)[Symbol.asyncIterator] = origStdin;
    }
  });

  // ---- Topic tests (Phase 5, Plan 03) ----

  it('passes replyTo with topicId to sendMessage when --topic is provided', async () => {
    const ctx = createMockCommandContext({ topic: '7' });
    await messageSendAction.call(ctx as any, 'testchat', 'Hello topic');

    expect(mockAssertForum).toHaveBeenCalledWith(
      expect.objectContaining({ className: 'Channel' }),
      7,
    );
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'Hello topic', replyTo: 7 }),
    );
  });

  it('--topic overrides --reply-to for replyTo value', async () => {
    const ctx = createMockCommandContext({ topic: '7', replyTo: '99' });
    await messageSendAction.call(ctx as any, 'testchat', 'Topic wins');

    // topicId should win as the replyTo value
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ replyTo: 7 }),
    );
  });

  it('outputs NOT_A_FORUM error when --topic is used on non-forum entity', async () => {
    const { TgError } = await import('../../src/lib/errors.js');
    mockAssertForum.mockRejectedValueOnce(
      new TgError('Chat is not a forum-enabled supergroup', 'NOT_A_FORUM'),
    );

    const ctx = createMockCommandContext({ topic: '7' });
    await messageSendAction.call(ctx as any, 'testchat', 'Hello');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Chat is not a forum-enabled supergroup',
      'NOT_A_FORUM',
    );
  });

  it('outputs error for invalid topic ID on send', async () => {
    const ctx = createMockCommandContext({ topic: 'notanumber' });
    await messageSendAction.call(ctx as any, 'testchat', 'Hello');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Invalid topic ID: must be a number',
      'INVALID_TOPIC_ID',
    );
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
