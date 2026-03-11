import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

// Mock output
const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
}));

// Mock peer resolution
const mockResolveEntity = vi.fn();
const mockExtractInviteHash = vi.fn();
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
  extractInviteHash: (...args: any[]) => mockExtractInviteHash(...args),
}));

// Hoisted mock state
const {
  mockConnect,
  mockDestroy,
  mockInvoke,
  mockGetInputEntity,
  MockChannel,
} = vi.hoisted(() => {
  const _MockChannel = class Channel {
    id: any; title: string; username: string | null;
    constructor(args: any = {}) {
      this.id = args.id ?? BigInt(100); this.title = args.title ?? 'Test Channel';
      this.username = args.username ?? null;
    }
  };
  return {
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockDestroy: vi.fn().mockResolvedValue(undefined),
    mockInvoke: vi.fn().mockResolvedValue({}),
    mockGetInputEntity: vi.fn().mockResolvedValue({ className: 'InputPeerChannel' }),
    MockChannel: _MockChannel,
  };
});

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  invoke: mockInvoke,
  getInputEntity: mockGetInputEntity,
};

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: {
    StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
  },
  Api: {
    Channel: MockChannel,
    channels: {
      JoinChannel: vi.fn().mockImplementation((args: any) => ({ className: 'channels.JoinChannel', ...args })),
    },
    messages: {
      ImportChatInvite: vi.fn().mockImplementation((args: any) => ({ className: 'messages.ImportChatInvite', ...args })),
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
import { chatJoinAction } from '../../src/commands/chat/join.js';

function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default', quiet: false, config: undefined,
      json: true, human: false, verbose: false,
      ...opts,
    })),
  };
}

describe('chatJoinAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('joins by username via JoinChannel', async () => {
    const entity = new MockChannel({ id: BigInt(100), title: 'My Group', username: 'mygroup' });
    mockResolveEntity.mockResolvedValueOnce(entity);
    mockInvoke.mockResolvedValueOnce({});

    const ctx = createMockCommandContext();
    await chatJoinAction.call(ctx as any, '@mygroup');

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, '@mygroup');
    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.joined).toBe(true);
    expect(data.chat.title).toBe('My Group');
  });

  it('joins by invite link via ImportChatInvite', async () => {
    mockExtractInviteHash.mockReturnValueOnce('abc123hash');
    mockInvoke.mockResolvedValueOnce({
      chats: [{ id: BigInt(200), title: 'Invite Group' }],
    });

    const ctx = createMockCommandContext();
    await chatJoinAction.call(ctx as any, 'https://t.me/+abc123hash');

    expect(mockExtractInviteHash).toHaveBeenCalledWith('https://t.me/+abc123hash');
    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.joined).toBe(true);
  });

  it('handles USER_ALREADY_PARTICIPANT error', async () => {
    const entity = new MockChannel({ id: BigInt(100), title: 'Group' });
    mockResolveEntity.mockResolvedValueOnce(entity);
    mockInvoke.mockRejectedValueOnce(new Error('USER_ALREADY_PARTICIPANT'));

    const ctx = createMockCommandContext();
    await chatJoinAction.call(ctx as any, '@group');

    expect(mockOutputError).toHaveBeenCalledOnce();
    expect(mockOutputError.mock.calls[0][0]).toContain('already');
  });

  it('handles CHANNELS_TOO_MUCH error', async () => {
    const entity = new MockChannel({ id: BigInt(100), title: 'Group' });
    mockResolveEntity.mockResolvedValueOnce(entity);
    mockInvoke.mockRejectedValueOnce(new Error('CHANNELS_TOO_MUCH'));

    const ctx = createMockCommandContext();
    await chatJoinAction.call(ctx as any, '@group');

    expect(mockOutputError).toHaveBeenCalledOnce();
    expect(mockOutputError.mock.calls[0][0]).toContain('limit');
  });
});
