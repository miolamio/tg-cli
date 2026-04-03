import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
}));

const mockResolveEntity = vi.fn();
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
}));

// Hoisted mock state
const {
  mockConnect,
  mockDestroy,
  mockInvoke,
  MockChannel,
  MockChat,
  MockUser,
  MockEditBanned,
  MockChatBannedRights,
  MockDeleteChatUser,
} = vi.hoisted(() => {
  const _MockChannel = class Channel {
    id: any; title: string;
    constructor(args: any = {}) { this.id = args.id ?? BigInt(100); this.title = args.title ?? 'Test Channel'; }
  };
  const _MockChat = class Chat {
    id: any; title: string;
    constructor(args: any = {}) { this.id = args.id ?? BigInt(200); this.title = args.title ?? 'Test Group'; }
  };
  const _MockUser = class User {
    id: any; username: string | null;
    constructor(args: any = {}) { this.id = args.id ?? BigInt(1); this.username = args.username ?? null; }
  };
  return {
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockDestroy: vi.fn().mockResolvedValue(undefined),
    mockInvoke: vi.fn().mockResolvedValue({}),
    MockChannel: _MockChannel,
    MockChat: _MockChat,
    MockUser: _MockUser,
    MockEditBanned: vi.fn().mockImplementation((args: any) => ({ className: 'channels.EditBanned', ...args })),
    MockChatBannedRights: vi.fn().mockImplementation((args: any) => ({ className: 'ChatBannedRights', ...args })),
    MockDeleteChatUser: vi.fn().mockImplementation((args: any) => ({ className: 'messages.DeleteChatUser', ...args })),
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
    ChatBannedRights: MockChatBannedRights,
    channels: {
      EditBanned: MockEditBanned,
    },
    messages: {
      DeleteChatUser: MockDeleteChatUser,
    },
  },
}));

vi.mock('../../src/lib/config.js', () => ({
  createConfig: vi.fn(() => ({
    get: vi.fn(), set: vi.fn(), path: '/tmp/mock-config.json',
  })),
  getCredentialsOrThrow: vi.fn(() => ({ apiId: 12345, apiHash: 'testhash' })),
}));

vi.mock('../../src/lib/session-store.js', () => ({
  SessionStore: vi.fn().mockImplementation(() => ({
    withLock: vi.fn().mockImplementation(async (_profile: string, fn: (s: string) => Promise<any>) => fn('test-session')),
    filePath: (p: string) => `/mock/sessions/${p}.session`,
  })),
}));

vi.mock('../../src/lib/client.js', () => ({
  withClient: vi.fn(async (_opts: any, fn: any) => fn(mockClientInstance)),
}));

// Import after mocks
import { chatKickAction } from '../../src/commands/chat/kick.js';

function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default', quiet: false, config: undefined,
      json: true, human: false, verbose: false,
      ...opts,
    })),
  };
}

describe('chatKickAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({});
  });

  it('calls EditBanned for Channel entity with viewMessages=true', async () => {
    const chatEntity = new MockChannel({ id: BigInt(100), title: 'My Channel' });
    const userEntity = new MockUser({ id: BigInt(42), username: 'target_user' });
    mockResolveEntity
      .mockResolvedValueOnce(chatEntity)
      .mockResolvedValueOnce(userEntity);

    const ctx = createMockCommandContext();
    await chatKickAction.call(ctx as any, '@mychannel', '@target_user');

    expect(mockResolveEntity).toHaveBeenCalledTimes(2);
    expect(mockResolveEntity).toHaveBeenNthCalledWith(1, mockClientInstance, '@mychannel');
    expect(mockResolveEntity).toHaveBeenNthCalledWith(2, mockClientInstance, '@target_user');

    expect(MockChatBannedRights).toHaveBeenCalledWith(
      expect.objectContaining({ viewMessages: true }),
    );
    expect(MockEditBanned).toHaveBeenCalledWith(
      expect.objectContaining({ channel: chatEntity, participant: userEntity }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.kicked).toBe(true);
    expect(data.chatId).toBe('100');
    expect(data.userId).toBe('42');
  });

  it('calls DeleteChatUser for basic Chat entity', async () => {
    const chatEntity = new MockChat({ id: BigInt(200), title: 'My Group' });
    const userEntity = new MockUser({ id: BigInt(55) });
    mockResolveEntity
      .mockResolvedValueOnce(chatEntity)
      .mockResolvedValueOnce(userEntity);

    const ctx = createMockCommandContext();
    await chatKickAction.call(ctx as any, '200', '55');

    expect(MockDeleteChatUser).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: chatEntity.id, userId: userEntity }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.kicked).toBe(true);
    expect(data.chatId).toBe('200');
  });

  it('errors when target entity is not a User', async () => {
    const chatEntity = new MockChannel({ id: BigInt(100) });
    // Return a Channel as the "user" — not a User instance
    const notAUser = new MockChannel({ id: BigInt(999) });
    mockResolveEntity
      .mockResolvedValueOnce(chatEntity)
      .mockResolvedValueOnce(notAUser);

    const ctx = createMockCommandContext();
    await chatKickAction.call(ctx as any, '@mychannel', '@notauser');

    expect(mockOutputError).toHaveBeenCalledOnce();
    expect(mockOutputError.mock.calls[0][1]).toBe('NOT_A_USER');
    expect(mockOutputSuccess).not.toHaveBeenCalled();
  });

  it('errors when chat entity is not a Channel or Chat', async () => {
    // Return a User as the chat entity
    const notAChat = new MockUser({ id: BigInt(1) });
    const userEntity = new MockUser({ id: BigInt(2) });
    mockResolveEntity
      .mockResolvedValueOnce(notAChat)
      .mockResolvedValueOnce(userEntity);

    const ctx = createMockCommandContext();
    await chatKickAction.call(ctx as any, 'someuser', '@target');

    expect(mockOutputError).toHaveBeenCalledOnce();
    expect(mockOutputError.mock.calls[0][1]).toBe('INVALID_CHAT_TYPE');
    expect(mockOutputSuccess).not.toHaveBeenCalled();
  });
});
