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
  mockGetMe,
  MockChannel,
  MockChat,
} = vi.hoisted(() => {
  const _MockChannel = class Channel {
    id: any; title: string;
    constructor(args: any = {}) { this.id = args.id ?? BigInt(100); this.title = args.title ?? 'Test Channel'; }
  };
  const _MockChat = class Chat {
    id: any; title: string;
    constructor(args: any = {}) { this.id = args.id ?? BigInt(200); this.title = args.title ?? 'Test Group'; }
  };
  return {
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockDestroy: vi.fn().mockResolvedValue(undefined),
    mockInvoke: vi.fn().mockResolvedValue({}),
    mockGetMe: vi.fn().mockResolvedValue({ id: BigInt(999) }),
    MockChannel: _MockChannel,
    MockChat: _MockChat,
  };
});

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  invoke: mockInvoke,
  getMe: mockGetMe,
};

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: {
    StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
  },
  Api: {
    Channel: MockChannel,
    Chat: MockChat,
    channels: {
      LeaveChannel: vi.fn().mockImplementation((args: any) => ({ className: 'channels.LeaveChannel', ...args })),
    },
    messages: {
      DeleteChatUser: vi.fn().mockImplementation((args: any) => ({ className: 'messages.DeleteChatUser', ...args })),
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

import { chatLeaveAction } from '../../src/commands/chat/leave.js';

function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default', quiet: false, config: undefined,
      json: true, human: false, verbose: false,
      ...opts,
    })),
  };
}

describe('chatLeaveAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('leaves a channel via LeaveChannel', async () => {
    const entity = new MockChannel({ id: BigInt(100), title: 'My Channel' });
    mockResolveEntity.mockResolvedValueOnce(entity);
    mockInvoke.mockResolvedValueOnce({});

    const ctx = createMockCommandContext();
    await chatLeaveAction.call(ctx as any, '@mychannel');

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, '@mychannel');
    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.left).toBe(true);
    expect(data.chat.title).toBe('My Channel');
  });

  it('leaves a basic group via DeleteChatUser', async () => {
    const entity = new MockChat({ id: BigInt(200), title: 'My Group' });
    mockResolveEntity.mockResolvedValueOnce(entity);
    mockInvoke.mockResolvedValueOnce({});

    const ctx = createMockCommandContext();
    await chatLeaveAction.call(ctx as any, '200');

    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockGetMe).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.left).toBe(true);
    expect(data.chat.title).toBe('My Group');
  });

  it('outputs error on failure', async () => {
    mockResolveEntity.mockRejectedValueOnce(new Error('Peer not found'));

    const ctx = createMockCommandContext();
    await chatLeaveAction.call(ctx as any, 'unknown');

    expect(mockOutputError).toHaveBeenCalledOnce();
  });
});
