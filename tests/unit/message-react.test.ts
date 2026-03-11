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

// Hoisted mock state for telegram client and Api types
const {
  mockConnect,
  mockDestroy,
  mockInvoke,
  mockSendReactionConstructor,
  mockReactionEmojiConstructor,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockInvoke: vi.fn().mockResolvedValue({}),
  mockSendReactionConstructor: vi.fn().mockImplementation((args: any) => ({
    _type: 'SendReaction',
    ...args,
  })),
  mockReactionEmojiConstructor: vi.fn().mockImplementation((args: any) => ({
    _type: 'ReactionEmoji',
    ...args,
  })),
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
    messages: {
      SendReaction: mockSendReactionConstructor,
    },
    ReactionEmoji: mockReactionEmojiConstructor,
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

// Import after mocks
import { messageReactAction } from '../../src/commands/message/react.js';

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

describe('messageReactAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a reaction using Api.ReactionEmoji wrapper', async () => {
    const ctx = createMockCommandContext();
    await messageReactAction.call(ctx as any, 'testchat', '42', '👍');

    // Verify ReactionEmoji was constructed with the emoji
    expect(mockReactionEmojiConstructor).toHaveBeenCalledWith({ emoticon: '👍' });

    // Verify SendReaction was constructed with correct params
    expect(mockSendReactionConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        peer: expect.anything(),
        msgId: 42,
        reaction: expect.arrayContaining([
          expect.objectContaining({ _type: 'ReactionEmoji', emoticon: '👍' }),
        ]),
      }),
    );

    // Verify invoke was called
    expect(mockInvoke).toHaveBeenCalledOnce();

    // Verify output
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messageId).toBe(42);
    expect(data.emoji).toBe('👍');
    expect(data.action).toBe('added');
    expect(data.chatId).toBeDefined();
  });

  it('removes a reaction with --remove flag (empty reaction array)', async () => {
    const ctx = createMockCommandContext({ remove: true });
    await messageReactAction.call(ctx as any, 'testchat', '42', '👍');

    // Verify SendReaction was constructed with empty reaction array
    expect(mockSendReactionConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        peer: expect.anything(),
        msgId: 42,
        reaction: [],
      }),
    );

    // ReactionEmoji should NOT be constructed for remove
    expect(mockReactionEmojiConstructor).not.toHaveBeenCalled();

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.action).toBe('removed');
  });

  it('outputs error when not logged in', async () => {
    mockStoreWithLock.mockImplementationOnce(async (_profile: string, fn: (s: string) => Promise<any>) => {
      return fn('');
    });

    const ctx = createMockCommandContext();
    await messageReactAction.call(ctx as any, 'testchat', '42', '👍');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in'),
      'NOT_AUTHENTICATED',
    );
  });

  it('parses message ID as integer', async () => {
    const ctx = createMockCommandContext();
    await messageReactAction.call(ctx as any, 'testchat', '999', '❤️');

    expect(mockSendReactionConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        msgId: 999,
      }),
    );
  });

  it('rejects invalid message ID with INVALID_MESSAGE_ID error', async () => {
    const ctx = createMockCommandContext();
    await messageReactAction.call(ctx as any, 'testchat', 'abc', '👍');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message ID'),
      'INVALID_MESSAGE_ID',
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
