import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
}));

const { mockInvoke, mockGetMessages, mockGetInputEntity } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockGetMessages: vi.fn(),
  mockGetInputEntity: vi.fn(async (entity: unknown) => entity),
}));

const mockClientInstance = {
  connect: vi.fn(),
  destroy: vi.fn(),
  invoke: mockInvoke,
  getMessages: mockGetMessages,
  getInputEntity: mockGetInputEntity,
};

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: { StringSession: vi.fn() },
  Api: {
    InputPeerEmpty: class InputPeerEmpty {
      className = 'InputPeerEmpty';
    },
    channels: {
      SearchPosts: class SearchPosts {
        className = 'channels.SearchPosts';
        hashtag: string;
        offsetRate: number;
        offsetPeer: unknown;
        offsetId: number;
        limit: number;
        constructor(args: any) {
          this.hashtag = args.hashtag;
          this.offsetRate = args.offsetRate;
          this.offsetPeer = args.offsetPeer;
          this.offsetId = args.offsetId;
          this.limit = args.limit;
        }
      },
    },
    InputMessagesFilterPhotos: class {},
    InputMessagesFilterVideo: class {},
    InputMessagesFilterPhotoVideo: class {},
    InputMessagesFilterDocument: class {},
    InputMessagesFilterUrl: class {},
    InputMessagesFilterGif: class {},
    InputMessagesFilterVoice: class {},
    InputMessagesFilterMusic: class {},
    InputMessagesFilterRoundVideo: class {},
    InputMessagesFilterRoundVoice: class {},
    InputMessagesFilterChatPhotos: class {},
    InputMessagesFilterPhoneCalls: class {},
    InputMessagesFilterMyMentions: class {},
    InputMessagesFilterGeo: class {},
    InputMessagesFilterContacts: class {},
    InputMessagesFilterPinned: class {},
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

vi.mock('../../src/lib/session-store.js', () => ({
  SessionStore: vi.fn().mockImplementation(() => ({
    withLock: vi.fn(async (_p: string, fn: (s: string) => Promise<any>) => fn('test-session')),
  })),
}));

vi.mock('../../src/lib/client.js', () => ({
  withClient: vi.fn(async (_opts: any, fn: any) => fn(mockClientInstance)),
}));

const mockResolveEntity = vi.fn();
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
  assertForum: vi.fn(),
}));

import { messageSearchAction } from '../../src/commands/message/search.js';
import { ErrorCode } from '../../src/lib/error-codes.js';

function ctx(opts: Record<string, unknown> = {}) {
  return {
    optsWithGlobals: () => ({
      profile: 'default',
      quiet: true,
      json: true,
      human: false,
      verbose: false,
      query: undefined,
      chat: undefined,
      limit: '50',
      offset: '0',
      ...opts,
    }),
  };
}

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    message: 'hello #bitcoin',
    date: 1_700_000_000,
    senderId: BigInt(1),
    entities: [],
    media: null,
    action: null,
    replyTo: null,
    fwdFrom: null,
    peerId: { channelId: BigInt(999) },
    ...overrides,
  };
}

describe('message search --public', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ messages: [], chats: [], count: 0 });
  });

  it('requires --query', async () => {
    await messageSearchAction.call(ctx({ public: true }) as any);
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('--query'),
      ErrorCode.MISSING_QUERY,
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('rejects --public with --chat', async () => {
    await messageSearchAction.call(ctx({ public: true, query: 'btc', chat: '@x' }) as any);
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('--chat'),
      ErrorCode.INVALID_OPTIONS,
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('rejects --public with --filter', async () => {
    await messageSearchAction.call(ctx({ public: true, query: 'btc', filter: 'photos' }) as any);
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('--filter'),
      ErrorCode.INVALID_OPTIONS,
    );
  });

  it('rejects a multi-word query', async () => {
    await messageSearchAction.call(ctx({ public: true, query: 'meeting notes' }) as any);
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('hashtag'),
      ErrorCode.INVALID_OPTIONS,
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('invokes channels.SearchPosts with a stripped hashtag', async () => {
    const channel = { id: BigInt(999), className: 'Channel', title: 'Coin News', username: 'coinnews' };
    mockInvoke.mockResolvedValueOnce({
      messages: [post()],
      chats: [channel],
      count: 1,
      nextRate: 42,
    });

    await messageSearchAction.call(ctx({ public: true, query: '#bitcoin', limit: '20' }) as any);

    expect(mockGetMessages).not.toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledOnce();
    const req = mockInvoke.mock.calls[0][0];
    expect(req.className).toBe('channels.SearchPosts');
    expect(req.hashtag).toBe('bitcoin');
    expect(req.offsetRate).toBe(0);
    expect(req.offsetId).toBe(0);
    expect(req.limit).toBe(20);
    expect(req.offsetPeer.className).toBe('InputPeerEmpty');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].chatId).toBe('-100999');
    expect(data.messages[0].chatTitle).toBe('Coin News');
    expect(data.total).toBe(1);
    expect(data.hasMore).toBe(true);
    expect(data.nextRate).toBe(42);
    expect(data.nextOffsetId).toBe(10);
    expect(data.nextOffsetPeer).toBe('-100999');
  });

  it('passes pagination cursor --offset/--peer/--after', async () => {
    mockResolveEntity.mockResolvedValueOnce({ id: BigInt(999), className: 'Channel' });
    mockGetInputEntity.mockResolvedValueOnce({ className: 'InputPeerChannel', channelId: BigInt(999) });
    mockInvoke.mockResolvedValueOnce({ messages: [], chats: [], count: 0 });

    await messageSearchAction.call(ctx({
      public: true,
      query: 'bitcoin',
      offset: '77',
      peer: '-100999',
      after: '10',
    }) as any);

    const req = mockInvoke.mock.calls[0][0];
    expect(req.offsetRate).toBe(77);
    expect(req.offsetId).toBe(10);
    expect(req.offsetPeer).toEqual({ className: 'InputPeerChannel', channelId: BigInt(999) });
    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, '-100999');
  });

  it('hasMore is false on a short last page', async () => {
    mockInvoke.mockResolvedValueOnce({
      messages: [post({ id: 3 })],
      chats: [{ id: BigInt(999), className: 'Channel', title: 'X' }],
      count: 1,
    });

    await messageSearchAction.call(ctx({ public: true, query: 'btc', limit: '50' }) as any);
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.hasMore).toBe(false);
    expect(data.nextRate).toBeNull();
    expect(data.nextOffsetId).toBeNull();
    expect(data.nextOffsetPeer).toBeNull();
  });

  it('includes search_flood when the API returns it', async () => {
    mockInvoke.mockResolvedValueOnce({
      messages: [],
      chats: [],
      count: 0,
      searchFlood: {
        remains: 2,
        totalDaily: 10,
        waitTill: 1_700_000_100,
        starsAmount: BigInt(30),
        queryIsFree: true,
      },
    });

    await messageSearchAction.call(ctx({ public: true, query: 'btc' }) as any);
    expect(mockOutputSuccess.mock.calls[0][0].flood).toEqual({
      remains: 2,
      totalDaily: 10,
      waitTill: 1_700_000_100,
      starsAmount: '30',
      queryIsFree: true,
    });
  });

  it('rejects --peer without --public', async () => {
    await messageSearchAction.call(ctx({ query: 'hi', peer: '@x' }) as any);
    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('--public'),
      ErrorCode.INVALID_OPTIONS,
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
