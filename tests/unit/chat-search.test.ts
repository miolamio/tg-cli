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
    contacts: {
      Search: vi.fn().mockImplementation((opts: any) => opts),
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

vi.mock('../../src/lib/serialize.js', () => ({
  bigIntToString: (val: any) => val?.toString() ?? '',
}));

import { chatSearchAction } from '../../src/commands/chat/search.js';

function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default',
      quiet: false,
      config: undefined,
      limit: '20',
      ...opts,
    })),
  };
}

describe('chatSearchAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns channels and groups from contacts.Search', async () => {
    mockInvoke.mockResolvedValueOnce({
      chats: [
        { className: 'Channel', id: { toString: () => '100' }, title: 'AI News', username: 'ainews', megagroup: false, participantsCount: 5000 },
        { className: 'Channel', id: { toString: () => '200' }, title: 'ML Community', username: 'mlchat', megagroup: true, participantsCount: 1200 },
        { className: 'Chat', id: { toString: () => '300' }, title: 'Dev Group', username: null, participantsCount: 50 },
      ],
      users: [],
    });

    const ctx = createMockCommandContext();
    await chatSearchAction.call(ctx as any, 'AI');

    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.chats).toHaveLength(3);
    expect(data.chats[0]).toEqual({
      id: '100', title: 'AI News', type: 'channel', username: 'ainews', membersCount: 5000,
    });
    expect(data.chats[1].type).toBe('supergroup');
    expect(data.chats[2].type).toBe('group');
    expect(data.total).toBe(3);
  });

  it('filters out non-Chat/Channel entities', async () => {
    mockInvoke.mockResolvedValueOnce({
      chats: [
        { className: 'Channel', id: { toString: () => '100' }, title: 'Good', username: 'good', megagroup: false, participantsCount: 100 },
        { className: 'ChatEmpty', id: { toString: () => '999' } },
      ],
      users: [],
    });

    const ctx = createMockCommandContext();
    await chatSearchAction.call(ctx as any, 'test');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.chats).toHaveLength(1);
    expect(data.chats[0].title).toBe('Good');
  });

  it('returns empty results when no chats found', async () => {
    mockInvoke.mockResolvedValueOnce({ chats: [], users: [] });

    const ctx = createMockCommandContext();
    await chatSearchAction.call(ctx as any, 'nonexistent');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.chats).toHaveLength(0);
    expect(data.total).toBe(0);
  });

  it('passes limit to API call', async () => {
    mockInvoke.mockResolvedValueOnce({ chats: [], users: [] });

    const ctx = createMockCommandContext({ limit: '10' });
    await chatSearchAction.call(ctx as any, 'query');

    const invokeArg = mockInvoke.mock.calls[0][0];
    expect(invokeArg.limit).toBe(10);
  });

  it('outputs error when not logged in', async () => {
    mockStoreWithLock.mockImplementationOnce(async (_profile: string, fn: (s: string) => Promise<any>) => {
      return fn('');
    });

    const ctx = createMockCommandContext();
    await chatSearchAction.call(ctx as any, 'AI');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in'),
      'NOT_AUTHENTICATED',
    );
  });
});
