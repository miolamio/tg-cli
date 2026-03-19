import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
}));

const {
  mockConnect,
  mockDestroy,
  mockInvoke,
  MockChatInviteAlready,
  MockChatInvitePeek,
  MockChatInvite,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockInvoke: vi.fn(),
  MockChatInviteAlready: class ChatInviteAlready {},
  MockChatInvitePeek: class ChatInvitePeek {},
  MockChatInvite: class ChatInvite {},
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
    ChatInviteAlready: MockChatInviteAlready,
    ChatInvitePeek: MockChatInvitePeek,
    ChatInvite: MockChatInvite,
    messages: {
      CheckChatInvite: vi.fn().mockImplementation((opts: any) => opts),
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

const mockExtractInviteHash = vi.fn().mockReturnValue('abc123');
vi.mock('../../src/lib/peer.js', () => ({
  extractInviteHash: (...args: any[]) => mockExtractInviteHash(...args),
}));

const mockBigIntToString = vi.fn((val: any) => val?.toString() ?? '');
vi.mock('../../src/lib/serialize.js', () => ({
  bigIntToString: (val: any) => mockBigIntToString(val),
}));

import { chatInviteInfoAction } from '../../src/commands/chat/invite-info.js';

function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default',
      quiet: false,
      config: undefined,
      ...opts,
    })),
  };
}

describe('chatInviteInfoAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ChatInviteAlready → alreadyMember: true with chat info', async () => {
    const result = Object.create(MockChatInviteAlready.prototype);
    result.chat = { id: { toString: () => '100' }, title: 'Existing Group' };
    mockInvoke.mockResolvedValueOnce(result);

    const ctx = createMockCommandContext();
    await chatInviteInfoAction.call(ctx as any, 'https://t.me/+abc123');

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.alreadyMember).toBe(true);
    expect(data.chat.id).toBe('100');
    expect(data.chat.title).toBe('Existing Group');
  });

  it('ChatInvitePeek → alreadyMember: false with chat and expires', async () => {
    const result = Object.create(MockChatInvitePeek.prototype);
    result.chat = { id: { toString: () => '200' }, title: 'Peek Group' };
    result.expires = 1710150900; // 2024-03-11T09:55:00Z
    mockInvoke.mockResolvedValueOnce(result);

    const ctx = createMockCommandContext();
    await chatInviteInfoAction.call(ctx as any, 'https://t.me/+xyz789');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.alreadyMember).toBe(false);
    expect(data.chat.id).toBe('200');
    expect(data.chat.title).toBe('Peek Group');
    expect(data.expires).toBe(new Date(1710150900 * 1000).toISOString());
  });

  it('ChatInvite → preview info with title, about, participantsCount', async () => {
    const result = Object.create(MockChatInvite.prototype);
    Object.assign(result, {
      title: 'New Group',
      about: 'A cool group',
      participantsCount: 42,
      channel: true,
      broadcast: false,
    });
    mockInvoke.mockResolvedValueOnce(result);

    const ctx = createMockCommandContext();
    await chatInviteInfoAction.call(ctx as any, 'https://t.me/+invite');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.alreadyMember).toBe(false);
    expect(data.title).toBe('New Group');
    expect(data.about).toBe('A cool group');
    expect(data.participantsCount).toBe(42);
    expect(data.channel).toBe(true);
    expect(data.broadcast).toBe(false);
  });

  it('unknown result type → outputs error', async () => {
    // Some unknown object that doesn't match any known class
    mockInvoke.mockResolvedValueOnce({ unknownField: true });

    const ctx = createMockCommandContext();
    await chatInviteInfoAction.call(ctx as any, 'https://t.me/+unknown');

    expect(mockOutputError).toHaveBeenCalledWith('Unknown invite result type', 'UNKNOWN_INVITE_TYPE');
  });

  it('invalid invite link → error from extractInviteHash', async () => {
    const { TgError } = await import('../../src/lib/errors.js');
    mockExtractInviteHash.mockImplementationOnce(() => {
      throw new TgError('Invalid invite link format', 'INVALID_INVITE');
    });

    const ctx = createMockCommandContext();
    await chatInviteInfoAction.call(ctx as any, 'not-a-link');

    expect(mockOutputError).toHaveBeenCalledWith('Invalid invite link format', 'INVALID_INVITE');
  });

  it('outputs error when not logged in', async () => {
    mockStoreWithLock.mockImplementationOnce(async (_profile: string, fn: (s: string) => Promise<any>) => {
      return fn('');
    });

    const ctx = createMockCommandContext();
    await chatInviteInfoAction.call(ctx as any, 'https://t.me/+abc');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in'),
      'NOT_AUTHENTICATED',
    );
  });
});
