import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
}));

const { mockConnect, mockDestroy, mockInvoke } = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockInvoke: vi.fn(),
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
      GetReplies: vi.fn().mockImplementation((opts: any) => opts),
    },
  },
}));

vi.mock('../../src/lib/config.js', () => ({
  createConfig: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    path: '/tmp/mock-config.json',
  })),
  getCredentialsOrThrow: vi.fn(() => ({ apiId: 12345, apiHash: 'testhash' })),
}));

const mockStoreWithLock = vi.fn().mockImplementation(async (_profile: string, fn: (s: string) => Promise<any>) => {
  return fn('test-session');
});

vi.mock('../../src/lib/session-store.js', () => ({
  SessionStore: vi.fn().mockImplementation(() => ({
    withLock: mockStoreWithLock,
    filePath: (p: string) => `/mock/sessions/${p}.session`,
  })),
}));

vi.mock('../../src/lib/client.js', () => ({
  withClient: vi.fn(async (_opts: any, fn: any) => fn(mockClientInstance)),
}));

const mockResolveEntity = vi.fn().mockResolvedValue({ id: BigInt(123), className: 'Channel' });
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
}));

vi.mock('../../src/lib/serialize.js', () => ({
  serializeMessage: vi.fn((msg: any, sender?: any) => ({
    id: String(msg.id),
    text: msg.message ?? '',
    date: new Date(msg.date * 1000).toISOString(),
    senderId: sender ? String(sender.id) : null,
  })),
}));

vi.mock('../../src/lib/entity-map.js', () => ({
  buildEntityMap: vi.fn((result: any) => {
    const map = new Map<string, any>();
    for (const u of result.users ?? []) {
      map.set(u.id.toString(), u);
    }
    for (const c of result.chats ?? []) {
      map.set(c.id.toString(), c);
    }
    return map;
  }),
}));

import { messageRepliesAction } from '../../src/commands/message/replies.js';

function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default',
      quiet: false,
      config: undefined,
      limit: '50',
      offset: '0',
      ...opts,
    })),
  };
}

function createMockReplyResult(messages: any[], count = 0) {
  return {
    messages,
    users: [],
    chats: [],
    count,
  };
}

function createMockMessage(id: number, text = 'reply') {
  return {
    id,
    message: text,
    date: 1710150900,
    fromId: { userId: { toString: () => '456' } },
    entities: [],
    media: null,
    action: null,
    replyTo: null,
    fwdFrom: null,
  };
}

describe('messageRepliesAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('single post mode → outputs messages, total, postId', async () => {
    const result = createMockReplyResult([
      createMockMessage(1, 'first reply'),
      createMockMessage(2, 'second reply'),
    ], 10);
    mockInvoke.mockResolvedValueOnce(result);

    const ctx = createMockCommandContext();
    await messageRepliesAction.call(ctx as any, '@channel', '42');

    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.postId).toBe(42);
    expect(data.total).toBe(10);
    expect(data.messages).toHaveLength(2);
  });

  it('batch mode → outputs array of results', async () => {
    const result1 = createMockReplyResult([createMockMessage(1)], 5);
    const result2 = createMockReplyResult([createMockMessage(2)], 3);
    mockInvoke.mockResolvedValueOnce(result1).mockResolvedValueOnce(result2);

    const ctx = createMockCommandContext();
    await messageRepliesAction.call(ctx as any, '@channel', '10,20');

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.posts).toHaveLength(2);
    expect(data.posts[0].postId).toBe(10);
    expect(data.posts[0].total).toBe(5);
    expect(data.posts[1].postId).toBe(20);
    expect(data.posts[1].total).toBe(3);
  });

  it('batch with error on one post → partial results (empty messages)', async () => {
    const result1 = createMockReplyResult([createMockMessage(1)], 5);
    mockInvoke
      .mockResolvedValueOnce(result1)
      .mockRejectedValueOnce(new Error('MSG_ID_INVALID'));

    const ctx = createMockCommandContext();
    await messageRepliesAction.call(ctx as any, '@channel', '10,99');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.posts).toHaveLength(2);
    expect(data.posts[0].messages).toHaveLength(1);
    expect(data.posts[1].messages).toHaveLength(0);
    expect(data.posts[1].total).toBe(0);
  });

  it('invalid message ID (non-number) → error', async () => {
    const ctx = createMockCommandContext();
    await messageRepliesAction.call(ctx as any, '@channel', 'abc');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message IDs'),
      'INVALID_MSG_ID',
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('invalid message ID (zero) → error', async () => {
    const ctx = createMockCommandContext();
    await messageRepliesAction.call(ctx as any, '@channel', '0');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message IDs'),
      'INVALID_MSG_ID',
    );
  });

  it('invalid message ID (negative) → error', async () => {
    const ctx = createMockCommandContext();
    await messageRepliesAction.call(ctx as any, '@channel', '-5');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message IDs'),
      'INVALID_MSG_ID',
    );
  });

  it('respects --limit and --offset options', async () => {
    const result = createMockReplyResult([], 100);
    mockInvoke.mockResolvedValueOnce(result);

    const ctx = createMockCommandContext({ limit: '10', offset: '5' });
    await messageRepliesAction.call(ctx as any, '@channel', '42');

    const invokeArg = mockInvoke.mock.calls[0][0];
    expect(invokeArg.limit).toBe(10);
    expect(invokeArg.addOffset).toBe(5);
  });

  it('outputs error when not logged in', async () => {
    mockStoreWithLock.mockImplementationOnce(async (_profile: string, fn: (s: string) => Promise<any>) => {
      return fn('');
    });

    const ctx = createMockCommandContext();
    await messageRepliesAction.call(ctx as any, '@channel', '42');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in'),
      'NOT_AUTHENTICATED',
    );
  });

  it('empty message IDs string → error', async () => {
    const ctx = createMockCommandContext();
    await messageRepliesAction.call(ctx as any, '@channel', '');

    expect(mockOutputError).toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
