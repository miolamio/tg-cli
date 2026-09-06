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
  mockGetDialogs,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockGetDialogs: vi.fn().mockResolvedValue([]),
}));

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  getDialogs: mockGetDialogs,
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

// Helper to create mock dialog objects matching gramjs Dialog shape
function createMockDialog(overrides: Record<string, any> = {}) {
  const id = overrides.id ?? BigInt(123);
  const defaults = {
    id,
    title: 'Test Chat',
    name: 'Test Chat',
    isUser: false,
    isChannel: false,
    isGroup: true,
    unreadCount: 0,
    date: 1_700_000_000,
    message: { id: Number(id), date: 1_700_000_000 },
    inputEntity: { className: 'InputPeerChat', chatId: id },
    entity: { username: null, megagroup: false },
  };
  return { ...defaults, ...overrides };
}

// Import after mocks
import { chatListAction } from '../../src/commands/chat/list.js';

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

describe('chatListAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists dialogs and outputs serialized chats', async () => {
    const dialogs = [
      createMockDialog({ id: BigInt(1), title: 'Group One', isGroup: true }),
      createMockDialog({ id: BigInt(2), title: 'Channel Two', isChannel: true, isGroup: false, entity: { username: 'chan2', megagroup: false } }),
    ];
    (dialogs as any).total = 100;
    mockGetDialogs.mockResolvedValueOnce(dialogs);

    const ctx = createMockCommandContext();
    await chatListAction.call(ctx as any);

    expect(mockGetDialogs).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.chats).toHaveLength(2);
    expect(data.total).toBe(100);
    expect(data.chats[0].title).toBe('Group One');
    expect(data.chats[0].type).toBe('group');
    expect(data.chats[1].title).toBe('Channel Two');
    expect(data.chats[1].type).toBe('channel');
  });

  it('filters by --type group', async () => {
    const dialogs = [
      createMockDialog({ id: BigInt(1), title: 'Group One', isGroup: true }),
      createMockDialog({ id: BigInt(2), title: 'Channel Two', isChannel: true, isGroup: false }),
      createMockDialog({ id: BigInt(3), title: 'User Three', isUser: true, isGroup: false }),
    ];
    (dialogs as any).total = 50;
    mockGetDialogs.mockResolvedValueOnce(dialogs);

    const ctx = createMockCommandContext({ type: 'group' });
    await chatListAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.chats).toHaveLength(1);
    expect(data.chats[0].type).toBe('group');
    expect(data.chats[0].title).toBe('Group One');
    expect(data.total).toBe(1);
  });

  it('keeps fetching until --type page is full', async () => {
    const first = Array.from({ length: 100 }, (_, i) => {
      if (i === 0) {
        return createMockDialog({ id: BigInt(1), title: 'Group One', isGroup: true });
      }
      return createMockDialog({
        id: BigInt(i + 1),
        title: `User ${i + 1}`,
        isUser: true,
        isGroup: false,
      });
    });
    const second = [
      createMockDialog({ id: BigInt(201), title: 'Group Two', isGroup: true }),
      createMockDialog({ id: BigInt(202), title: 'Group Three', isGroup: true }),
      createMockDialog({ id: BigInt(203), title: 'User Extra', isUser: true, isGroup: false }),
    ];
    mockGetDialogs
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    const ctx = createMockCommandContext({ type: 'group', limit: '2' });
    await chatListAction.call(ctx as any);

    expect(mockGetDialogs).toHaveBeenCalledTimes(2);
    expect(mockGetDialogs).toHaveBeenNthCalledWith(1, expect.objectContaining({ limit: 100 }));
    expect(mockGetDialogs).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        limit: 100,
        offsetId: first[99].message.id,
        offsetPeer: first[99].inputEntity,
      }),
    );
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.hasMore).toBe(true);
    expect(data.chats).toHaveLength(2);
    expect(data.chats.map((c: { title: string }) => c.title)).toEqual(['Group One', 'Group Two']);
    expect(data.chats.every((c: { type: string }) => c.type === 'group')).toBe(true);
  });

  it('hasMore is false when MAX_DIALOGS is hit without filling the typed page', async () => {
    let n = 0;
    mockGetDialogs.mockImplementation(async () => {
      return Array.from({ length: 100 }, () => {
        n += 1;
        return createMockDialog({
          id: BigInt(n),
          title: `User ${n}`,
          isUser: true,
          isGroup: false,
        });
      });
    });

    const ctx = createMockCommandContext({ type: 'group', limit: '2' });
    await chatListAction.call(ctx as any);

    expect(mockGetDialogs).toHaveBeenCalledTimes(50);
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.chats).toEqual([]);
    expect(data.hasMore).toBe(false);
  });

  it('filters by --type channel', async () => {
    const dialogs = [
      createMockDialog({ id: BigInt(1), title: 'Group One', isGroup: true }),
      createMockDialog({ id: BigInt(2), title: 'Channel Two', isChannel: true, isGroup: false }),
    ];
    (dialogs as any).total = 50;
    mockGetDialogs.mockResolvedValueOnce(dialogs);

    const ctx = createMockCommandContext({ type: 'channel' });
    await chatListAction.call(ctx as any);

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.chats).toHaveLength(1);
    expect(data.chats[0].type).toBe('channel');
  });

  it('applies --limit and --offset pagination', async () => {
    const dialogs = Array.from({ length: 15 }, (_, i) =>
      createMockDialog({ id: BigInt(i + 1), title: `Chat ${i + 1}` }),
    );
    (dialogs as any).total = 100;
    mockGetDialogs.mockResolvedValueOnce(dialogs);

    const ctx = createMockCommandContext({ limit: '10', offset: '5' });
    await chatListAction.call(ctx as any);

    // Should fetch offset+limit=15 dialogs
    expect(mockGetDialogs).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 15 }),
    );

    const data = mockOutputSuccess.mock.calls[0][0];
    // Sliced from offset 5, take 10 items -> items 5-14 (indices 5 through 14)
    expect(data.chats).toHaveLength(10);
    expect(data.chats[0].title).toBe('Chat 6');
    expect(data.chats[9].title).toBe('Chat 15');
  });

  it('handles empty dialog list', async () => {
    const dialogs: any[] = [];
    (dialogs as any).total = 0;
    mockGetDialogs.mockResolvedValueOnce(dialogs);

    const ctx = createMockCommandContext();
    await chatListAction.call(ctx as any);

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.chats).toHaveLength(0);
    expect(data.total).toBe(0);
  });

  it('includes total count in output', async () => {
    const dialogs = [
      createMockDialog({ id: BigInt(1), title: 'One' }),
    ];
    (dialogs as any).total = 500;
    mockGetDialogs.mockResolvedValueOnce(dialogs);

    const ctx = createMockCommandContext({ limit: '1', offset: '0' });
    await chatListAction.call(ctx as any);

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.total).toBe(500);
  });

  it('detects supergroup type via megagroup flag', async () => {
    const dialogs = [
      createMockDialog({ id: BigInt(1), title: 'Supergroup', isChannel: true, isGroup: false, entity: { username: 'sg1', megagroup: true } }),
    ];
    (dialogs as any).total = 1;
    mockGetDialogs.mockResolvedValueOnce(dialogs);

    const ctx = createMockCommandContext();
    await chatListAction.call(ctx as any);

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.chats[0].type).toBe('supergroup');
  });
});
