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
  MockChat,
  MockUser,
} = vi.hoisted(() => {
  const _MockChannel = class Channel {
    id: any; title: string; username: string | null; megagroup: boolean; date: number; photo: any;
    constructor(args: any = {}) {
      this.id = args.id ?? BigInt(100); this.title = args.title ?? 'Test Channel';
      this.username = args.username ?? null; this.megagroup = args.megagroup ?? false;
      this.date = args.date ?? 1700000000; this.photo = args.photo ?? null;
    }
  };
  const _MockChat = class Chat {
    id: any; title: string; date: number; photo: any;
    constructor(args: any = {}) {
      this.id = args.id ?? BigInt(200); this.title = args.title ?? 'Test Group';
      this.date = args.date ?? 1700000000; this.photo = args.photo ?? null;
    }
  };
  const _MockUser = class User {
    id: any; firstName: string; lastName: string | null; username: string | null; phone: string | null;
    constructor(args: any = {}) {
      this.id = args.id ?? BigInt(300); this.firstName = args.firstName ?? 'Test';
      this.lastName = args.lastName ?? null; this.username = args.username ?? null;
      this.phone = args.phone ?? null;
    }
  };
  return {
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockDestroy: vi.fn().mockResolvedValue(undefined),
    mockInvoke: vi.fn().mockResolvedValue({}),
    MockChannel: _MockChannel,
    MockChat: _MockChat,
    MockUser: _MockUser,
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
    Channel: MockChannel,
    Chat: MockChat,
    User: MockUser,
    channels: {
      GetFullChannel: vi.fn().mockImplementation((args: any) => ({ className: 'channels.GetFullChannel', ...args })),
    },
    messages: {
      GetFullChat: vi.fn().mockImplementation((args: any) => ({ className: 'messages.GetFullChat', ...args })),
    },
    users: {
      GetFullUser: vi.fn().mockImplementation((args: any) => ({ className: 'users.GetFullUser', ...args })),
    },
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
import { chatInfoAction } from '../../src/commands/chat/info.js';

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

describe('chatInfoAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns channel info via GetFullChannel', async () => {
    const channelEntity = new MockChannel({
      id: BigInt(100), title: 'My Channel', username: 'mychan',
      megagroup: false, date: 1700000000,
    });
    mockResolveEntity.mockResolvedValueOnce(channelEntity);
    mockInvoke.mockResolvedValueOnce({
      fullChat: {
        about: 'Channel description',
        participantsCount: 5000,
        adminsCount: 10,
        linkedChatId: BigInt(999),
        slowmodeSeconds: 0,
        exportedInvite: { link: 'https://t.me/+abc123' },
        migratedFromChatId: null,
      },
    });

    const ctx = createMockCommandContext();
    await chatInfoAction.call(ctx as any, 'mychan');

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, 'mychan');
    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.id).toBe('100');
    expect(data.title).toBe('My Channel');
    expect(data.type).toBe('channel');
    expect(data.username).toBe('mychan');
    expect(data.description).toBe('Channel description');
    expect(data.memberCount).toBe(5000);
    expect(data.inviteLink).toBe('https://t.me/+abc123');
  });

  it('returns supergroup info with megagroup flag', async () => {
    const sgEntity = new MockChannel({
      id: BigInt(101), title: 'Supergroup', username: 'sg1',
      megagroup: true, date: 1700000000,
    });
    mockResolveEntity.mockResolvedValueOnce(sgEntity);
    mockInvoke.mockResolvedValueOnce({
      fullChat: {
        about: 'SG description',
        participantsCount: 200,
        adminsCount: 5,
        linkedChatId: null,
        slowmodeSeconds: 30,
        exportedInvite: null,
        migratedFromChatId: BigInt(50),
      },
    });

    const ctx = createMockCommandContext();
    await chatInfoAction.call(ctx as any, 'sg1');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.type).toBe('supergroup');
    expect(data.slowmodeSeconds).toBe(30);
    expect(data.migratedFrom).toBe('50');
  });

  it('returns basic group info via GetFullChat', async () => {
    const groupEntity = new MockChat({
      id: BigInt(200), title: 'My Group', date: 1700000000,
    });
    mockResolveEntity.mockResolvedValueOnce(groupEntity);
    mockInvoke.mockResolvedValueOnce({
      fullChat: {
        about: 'Group description',
        participants: { participants: [{}, {}, {}] },
        exportedInvite: { link: 'https://t.me/+grouphash' },
      },
    });

    const ctx = createMockCommandContext();
    await chatInfoAction.call(ctx as any, '200');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.id).toBe('200');
    expect(data.title).toBe('My Group');
    expect(data.type).toBe('group');
    expect(data.description).toBe('Group description');
    expect(data.memberCount).toBe(3);
    expect(data.inviteLink).toBe('https://t.me/+grouphash');
  });

  it('returns user info without GetFull call', async () => {
    const userEntity = new MockUser({
      id: BigInt(300), firstName: 'Alice', lastName: 'Smith', username: 'alice',
    });
    mockResolveEntity.mockResolvedValueOnce(userEntity);

    const ctx = createMockCommandContext();
    await chatInfoAction.call(ctx as any, 'alice');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.id).toBe('300');
    expect(data.title).toBe('Alice Smith');
    expect(data.type).toBe('user');
    expect(data.username).toBe('alice');
    // Users have null for group-specific fields
    expect(data.memberCount).toBeNull();
    expect(data.slowmodeSeconds).toBeNull();
  });

  it('handles null/missing fields gracefully', async () => {
    const channelEntity = new MockChannel({
      id: BigInt(105), title: 'Sparse Channel', username: null,
      megagroup: false, date: 1700000000, photo: null,
    });
    mockResolveEntity.mockResolvedValueOnce(channelEntity);
    mockInvoke.mockResolvedValueOnce({
      fullChat: {
        about: null,
        participantsCount: null,
        adminsCount: null,
        linkedChatId: null,
        slowmodeSeconds: null,
        exportedInvite: null,
        migratedFromChatId: null,
      },
    });

    const ctx = createMockCommandContext();
    await chatInfoAction.call(ctx as any, '105');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.description).toBeNull();
    expect(data.memberCount).toBeNull();
    expect(data.linkedChatId).toBeNull();
    expect(data.inviteLink).toBeNull();
  });

  it('outputs error on resolve failure', async () => {
    mockResolveEntity.mockRejectedValueOnce(new Error('Peer not found'));

    const ctx = createMockCommandContext();
    await chatInfoAction.call(ctx as any, 'nonexistent');

    expect(mockOutputError).toHaveBeenCalledOnce();
    expect(mockOutputError).toHaveBeenCalledWith('Peer not found', undefined);
  });
});
