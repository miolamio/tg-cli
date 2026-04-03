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
  MockEditTitle,
  MockEditAbout,
  MockEditChatTitle,
  MockEditChatAbout,
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
    id: any;
    constructor(args: any = {}) { this.id = args.id ?? BigInt(1); }
  };
  return {
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockDestroy: vi.fn().mockResolvedValue(undefined),
    mockInvoke: vi.fn().mockResolvedValue({}),
    MockChannel: _MockChannel,
    MockChat: _MockChat,
    MockUser: _MockUser,
    MockEditTitle: vi.fn().mockImplementation((args: any) => ({ className: 'channels.EditTitle', ...args })),
    MockEditAbout: vi.fn().mockImplementation((args: any) => ({ className: 'channels.EditAbout', ...args })),
    MockEditChatTitle: vi.fn().mockImplementation((args: any) => ({ className: 'messages.EditChatTitle', ...args })),
    MockEditChatAbout: vi.fn().mockImplementation((args: any) => ({ className: 'messages.EditChatAbout', ...args })),
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
      EditTitle: MockEditTitle,
      EditAbout: MockEditAbout,
    },
    messages: {
      EditChatTitle: MockEditChatTitle,
      EditChatAbout: MockEditChatAbout,
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
import { chatEditAction } from '../../src/commands/chat/edit.js';

function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default', quiet: false, config: undefined,
      json: true, human: false, verbose: false,
      ...opts,
    })),
  };
}

describe('chatEditAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({});
  });

  it('errors when neither --title nor --description provided', async () => {
    const ctx = createMockCommandContext();
    await chatEditAction.call(ctx as any, '@mychat');

    expect(mockOutputError).toHaveBeenCalledOnce();
    expect(mockOutputError.mock.calls[0][1]).toBe('INVALID_INPUT');
    expect(mockResolveEntity).not.toHaveBeenCalled();
  });

  it('calls EditTitle for Channel entity when --title provided', async () => {
    const entity = new MockChannel({ id: BigInt(100), title: 'Old Title' });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext({ title: 'New Title' });
    await chatEditAction.call(ctx as any, '@mychannel');

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, '@mychannel');
    expect(MockEditTitle).toHaveBeenCalledWith(
      expect.objectContaining({ channel: entity, title: 'New Title' }),
    );
    expect(MockEditAbout).not.toHaveBeenCalled();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.updated).toBe(true);
    expect(data.title).toBe('New Title');
    expect(data.description).toBeNull();
  });

  it('calls EditAbout for Channel entity when --description provided', async () => {
    const entity = new MockChannel({ id: BigInt(100) });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext({ description: 'New about text' });
    await chatEditAction.call(ctx as any, '@mychannel');

    expect(MockEditAbout).toHaveBeenCalledWith(
      expect.objectContaining({ channel: entity, about: 'New about text' }),
    );
    expect(MockEditTitle).not.toHaveBeenCalled();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.description).toBe('New about text');
    expect(data.title).toBeNull();
  });

  it('calls both EditTitle and EditAbout for Channel when both options provided', async () => {
    const entity = new MockChannel({ id: BigInt(100) });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext({ title: 'New Title', description: 'New Desc' });
    await chatEditAction.call(ctx as any, '@mychannel');

    expect(MockEditTitle).toHaveBeenCalledOnce();
    expect(MockEditAbout).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
  });

  it('calls EditChatTitle for basic Chat entity', async () => {
    const entity = new MockChat({ id: BigInt(200), title: 'My Group' });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext({ title: 'Renamed Group' });
    await chatEditAction.call(ctx as any, '200');

    expect(MockEditChatTitle).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: entity.id, title: 'Renamed Group' }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.chatId).toBe('200');
  });

  it('calls EditChatAbout for basic Chat entity', async () => {
    const entity = new MockChat({ id: BigInt(200) });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext({ description: 'Group about' });
    await chatEditAction.call(ctx as any, '200');

    expect(MockEditChatAbout).toHaveBeenCalledWith(
      expect.objectContaining({ peer: entity, about: 'Group about' }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
  });

  it('errors when entity is a User (cannot edit user chat)', async () => {
    const entity = new MockUser({ id: BigInt(1) });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext({ title: 'New Title' });
    await chatEditAction.call(ctx as any, 'someuser');

    expect(mockOutputError).toHaveBeenCalledOnce();
    expect(mockOutputError.mock.calls[0][1]).toBe('INVALID_CHAT_TYPE');
    expect(mockOutputSuccess).not.toHaveBeenCalled();
  });
});
