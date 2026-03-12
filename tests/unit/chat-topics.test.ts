import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Serialization & Format Tests (Task 1) ----
// These use dynamic imports to avoid mock interference.

describe('serializeTopic', () => {
  let serializeTopic: typeof import('../../src/lib/serialize.js').serializeTopic;

  beforeEach(async () => {
    const mod = await import('../../src/lib/serialize.js');
    serializeTopic = mod.serializeTopic;
  });

  it('converts a full gramjs ForumTopic to TopicItem', () => {
    const topic = {
      id: 42,
      title: 'General Discussion',
      iconEmojiId: BigInt('12345678901234'),
      date: 1700000000, // Unix timestamp
      fromId: { userId: BigInt(999) },
      topMessage: 150,
      closed: false,
      pinned: true,
    };

    const result = serializeTopic(topic);

    expect(result.id).toBe(42);
    expect(result.title).toBe('General Discussion');
    expect(result.iconEmoji).toBe('12345678901234');
    expect(result.creationDate).toBe(new Date(1700000000 * 1000).toISOString());
    expect(result.creatorId).toBe('999');
    expect(result.messageCount).toBe(150);
    expect(result.isClosed).toBe(false);
    expect(result.isPinned).toBe(true);
  });

  it('handles null iconEmojiId gracefully', () => {
    const topic = {
      id: 10,
      title: 'No Icon',
      iconEmojiId: null,
      date: 1700000000,
      fromId: { userId: BigInt(1) },
      topMessage: 5,
      closed: false,
      pinned: false,
    };

    const result = serializeTopic(topic);
    expect(result.iconEmoji).toBeNull();
  });

  it('handles undefined iconEmojiId gracefully', () => {
    const topic = {
      id: 11,
      title: 'Undefined Icon',
      date: 1700000000,
      fromId: { userId: BigInt(1) },
      topMessage: 5,
      closed: false,
      pinned: false,
    };

    const result = serializeTopic(topic);
    expect(result.iconEmoji).toBeNull();
  });

  it('handles fromId with channelId', () => {
    const topic = {
      id: 20,
      title: 'Channel Topic',
      iconEmojiId: null,
      date: 1700000000,
      fromId: { channelId: BigInt(500) },
      topMessage: 10,
      closed: true,
      pinned: false,
    };

    const result = serializeTopic(topic);
    expect(result.creatorId).toBe('500');
    expect(result.isClosed).toBe(true);
  });

  it('handles fromId with chatId', () => {
    const topic = {
      id: 30,
      title: 'Chat Topic',
      iconEmojiId: null,
      date: 1700000000,
      fromId: { chatId: BigInt(300) },
      topMessage: 8,
      closed: false,
      pinned: true,
    };

    const result = serializeTopic(topic);
    expect(result.creatorId).toBe('300');
  });

  it('handles missing fromId', () => {
    const topic = {
      id: 40,
      title: 'No Creator',
      iconEmojiId: null,
      date: 1700000000,
      fromId: null,
      topMessage: 1,
      closed: false,
      pinned: false,
    };

    const result = serializeTopic(topic);
    expect(result.creatorId).toBe('');
  });
});

describe('formatTopics', () => {
  let formatTopics: typeof import('../../src/lib/format.js').formatTopics;

  beforeEach(async () => {
    const mod = await import('../../src/lib/format.js');
    formatTopics = mod.formatTopics;
  });

  it('renders topics with pinned and closed indicators', () => {
    const topics = [
      { id: 42, title: 'General', iconEmoji: null, creationDate: '2023-11-14T22:13:20.000Z', creatorId: '1', messageCount: 100, isClosed: false, isPinned: true },
      { id: 43, title: 'Off Topic', iconEmoji: null, creationDate: '2023-11-14T22:13:20.000Z', creatorId: '2', messageCount: 50, isClosed: true, isPinned: false },
      { id: 44, title: 'Normal Topic', iconEmoji: null, creationDate: '2023-11-14T22:13:20.000Z', creatorId: '3', messageCount: 10, isClosed: false, isPinned: false },
    ];

    const result = formatTopics(topics);

    expect(result).toContain('42');
    expect(result).toContain('General');
    expect(result).toContain('[pinned]');
    expect(result).toContain('43');
    expect(result).toContain('Off Topic');
    expect(result).toContain('[closed]');
    expect(result).toContain('44');
    expect(result).toContain('Normal Topic');
  });

  it('returns empty string for empty topics array', () => {
    const result = formatTopics([]);
    expect(result).toBe('');
  });
});

describe('formatData topics dispatch', () => {
  let formatData: typeof import('../../src/lib/format.js').formatData;

  beforeEach(async () => {
    const mod = await import('../../src/lib/format.js');
    formatData = mod.formatData;
  });

  it('dispatches topics[] array to formatTopics', () => {
    const data = {
      topics: [
        { id: 1, title: 'Topic 1', iconEmoji: null, creationDate: '2023-11-14T22:13:20.000Z', creatorId: '1', messageCount: 5, isClosed: false, isPinned: false },
      ],
      total: 1,
    };

    const result = formatData(data);
    // Should contain topic data, not JSON
    expect(result).toContain('Topic 1');
    expect(result).not.toContain('"ok"');
  });

  it('returns "No topics." for empty topics array', () => {
    const data = { topics: [], total: 0 };
    const result = formatData(data);
    expect(result).toBe('No topics.');
  });
});

// ---- Handler Tests (Task 2) ----
// These use vi.mock for full isolation of the command handler.

// Mock output
const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
const mockLogStatus = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: (...args: any[]) => mockLogStatus(...args),
}));

// Mock peer resolution
const mockResolveEntity = vi.fn();
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
}));

// Hoisted mock state for telegram client + Api classes
const {
  mockConnect,
  mockDestroy,
  mockInvoke,
  MockChannel,
  MockForumTopic,
  MockForumTopicDeleted,
} = vi.hoisted(() => {
  const _MockChannel = class Channel {
    className = 'Channel';
    id: any;
    title: string;
    forum: boolean;
    constructor(args: any = {}) {
      this.id = args.id ?? BigInt(100);
      this.title = args.title ?? 'Test Forum';
      this.forum = args.forum ?? true;
    }
  };
  const _MockForumTopic = class ForumTopic {
    className = 'ForumTopic';
    id: number;
    title: string;
    iconEmojiId: any;
    date: number;
    fromId: any;
    topMessage: number;
    closed: boolean;
    pinned: boolean;
    constructor(args: any = {}) {
      this.id = args.id ?? 1;
      this.title = args.title ?? 'Test Topic';
      this.iconEmojiId = args.iconEmojiId ?? null;
      this.date = args.date ?? 1700000000;
      this.fromId = args.fromId ?? { userId: BigInt(1) };
      this.topMessage = args.topMessage ?? 10;
      this.closed = args.closed ?? false;
      this.pinned = args.pinned ?? false;
    }
  };
  const _MockForumTopicDeleted = class ForumTopicDeleted {
    className = 'ForumTopicDeleted';
    id: number;
    constructor(args: any = {}) {
      this.id = args.id ?? 99;
    }
  };
  return {
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockDestroy: vi.fn().mockResolvedValue(undefined),
    mockInvoke: vi.fn().mockResolvedValue({ topics: [], count: 0 }),
    MockChannel: _MockChannel,
    MockForumTopic: _MockForumTopic,
    MockForumTopicDeleted: _MockForumTopicDeleted,
  };
});

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
    channels: {
      GetForumTopics: vi.fn().mockImplementation((args: any) => args),
    },
    ForumTopic: MockForumTopic,
    ForumTopicDeleted: MockForumTopicDeleted,
    Channel: MockChannel,
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
vi.mock('../../src/lib/session-store.js', () => ({
  SessionStore: vi.fn().mockImplementation(() => ({
    withLock: vi.fn().mockImplementation(async (_profile: string, fn: (s: string) => Promise<any>) => fn('test-session')),
    filePath: (p: string) => `/mock/sessions/${p}.session`,
  })),
}));

// Mock client module
vi.mock('../../src/lib/client.js', () => ({
  withClient: vi.fn(async (_opts: any, fn: any) => fn(mockClientInstance)),
}));

// Import after mocks
import { chatTopicsAction } from '../../src/commands/chat/topics.js';

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

describe('chatTopicsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_A_FORUM for non-Channel entity', async () => {
    const userEntity = { className: 'User', id: BigInt(1) };
    mockResolveEntity.mockResolvedValueOnce(userEntity);

    const ctx = createMockCommandContext();
    await chatTopicsAction.call(ctx as any, 'someuser');

    expect(mockOutputError).toHaveBeenCalledOnce();
    expect(mockOutputError.mock.calls[0][0]).toContain('forum');
    expect(mockOutputError.mock.calls[0][1]).toBe('NOT_A_FORUM');
  });

  it('throws NOT_A_FORUM for Channel with forum=false', async () => {
    const entity = new MockChannel({ forum: false });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext();
    await chatTopicsAction.call(ctx as any, 'nonforum');

    expect(mockOutputError).toHaveBeenCalledOnce();
    expect(mockOutputError.mock.calls[0][1]).toBe('NOT_A_FORUM');
  });

  it('filters ForumTopicDeleted items from results', async () => {
    const entity = new MockChannel({ forum: true });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const forumTopic = new MockForumTopic({ id: 1, title: 'Keep Me' });
    const deletedTopic = new MockForumTopicDeleted({ id: 2 });

    mockInvoke.mockResolvedValueOnce({
      topics: [forumTopic, deletedTopic],
      count: 2,
    });

    const ctx = createMockCommandContext();
    await chatTopicsAction.call(ctx as any, 'testforum');

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.topics).toHaveLength(1);
    expect(data.topics[0].title).toBe('Keep Me');
  });

  it('applies client-side offset slicing', async () => {
    const entity = new MockChannel({ forum: true });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const topics = Array.from({ length: 5 }, (_, i) =>
      new MockForumTopic({ id: i + 1, title: `Topic ${i + 1}` }),
    );

    mockInvoke.mockResolvedValueOnce({
      topics,
      count: 5,
    });

    const ctx = createMockCommandContext({ offset: '2' });
    await chatTopicsAction.call(ctx as any, 'testforum');

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.topics).toHaveLength(3);
    expect(data.topics[0].title).toBe('Topic 3');
  });

  it('lists topics with serialized output', async () => {
    const entity = new MockChannel({ forum: true });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const forumTopic = new MockForumTopic({
      id: 42,
      title: 'General',
      topMessage: 100,
      pinned: true,
      closed: false,
      fromId: { userId: BigInt(999) },
    });

    mockInvoke.mockResolvedValueOnce({
      topics: [forumTopic],
      count: 1,
    });

    const ctx = createMockCommandContext();
    await chatTopicsAction.call(ctx as any, 'testforum');

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.topics).toHaveLength(1);
    expect(data.topics[0].id).toBe(42);
    expect(data.topics[0].title).toBe('General');
    expect(data.topics[0].messageCount).toBe(100);
    expect(data.topics[0].isPinned).toBe(true);
    expect(data.topics[0].creatorId).toBe('999');
    expect(data.total).toBe(1);
  });
});
