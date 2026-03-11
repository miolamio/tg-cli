import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
}));

const mockExtractInviteHash = vi.fn();
vi.mock('../../src/lib/peer.js', () => ({
  extractInviteHash: (...args: any[]) => mockExtractInviteHash(...args),
}));

// Hoisted mock state
const {
  mockConnect,
  mockDestroy,
  mockInvoke,
  MockChatInviteAlready,
  MockChatInvite,
  MockChatInvitePeek,
} = vi.hoisted(() => {
  const _MockChatInviteAlready = class ChatInviteAlready {
    chat: any;
    constructor(args: any = {}) { this.chat = args.chat ?? { id: BigInt(100), title: 'Already Joined' }; }
  };
  const _MockChatInvite = class ChatInvite {
    title: string; about: string | null; participantsCount: number; channel: boolean; broadcast: boolean;
    constructor(args: any = {}) {
      this.title = args.title ?? 'Invite Group';
      this.about = args.about ?? null;
      this.participantsCount = args.participantsCount ?? 100;
      this.channel = args.channel ?? false;
      this.broadcast = args.broadcast ?? false;
    }
  };
  const _MockChatInvitePeek = class ChatInvitePeek {
    chat: any; expires: number;
    constructor(args: any = {}) {
      this.chat = args.chat ?? { id: BigInt(200), title: 'Peek Group' };
      this.expires = args.expires ?? 1700000000;
    }
  };
  return {
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockDestroy: vi.fn().mockResolvedValue(undefined),
    mockInvoke: vi.fn().mockResolvedValue({}),
    MockChatInviteAlready: _MockChatInviteAlready,
    MockChatInvite: _MockChatInvite,
    MockChatInvitePeek: _MockChatInvitePeek,
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
    ChatInviteAlready: MockChatInviteAlready,
    ChatInvite: MockChatInvite,
    ChatInvitePeek: MockChatInvitePeek,
    messages: {
      CheckChatInvite: vi.fn().mockImplementation((args: any) => ({ className: 'messages.CheckChatInvite', ...args })),
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

import { chatInviteInfoAction } from '../../src/commands/chat/invite-info.js';
import { TgError } from '../../src/lib/errors.js';

function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default', quiet: false, config: undefined,
      json: true, human: false, verbose: false,
      ...opts,
    })),
  };
}

describe('chatInviteInfoAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles already-member invite result', async () => {
    mockExtractInviteHash.mockReturnValueOnce('abc123');
    const result = new MockChatInviteAlready({
      chat: { id: BigInt(100), title: 'Already Group' },
    });
    mockInvoke.mockResolvedValueOnce(result);

    const ctx = createMockCommandContext();
    await chatInviteInfoAction.call(ctx as any, 'https://t.me/+abc123');

    expect(mockExtractInviteHash).toHaveBeenCalledWith('https://t.me/+abc123');
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.alreadyMember).toBe(true);
    expect(data.chat.title).toBe('Already Group');
  });

  it('handles invite preview result', async () => {
    mockExtractInviteHash.mockReturnValueOnce('def456');
    const result = new MockChatInvite({
      title: 'Preview Group',
      about: 'Some description',
      participantsCount: 500,
      channel: false,
      broadcast: false,
    });
    mockInvoke.mockResolvedValueOnce(result);

    const ctx = createMockCommandContext();
    await chatInviteInfoAction.call(ctx as any, 'https://t.me/+def456');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.alreadyMember).toBe(false);
    expect(data.title).toBe('Preview Group');
    expect(data.about).toBe('Some description');
    expect(data.participantsCount).toBe(500);
  });

  it('handles peek result with expiry', async () => {
    mockExtractInviteHash.mockReturnValueOnce('ghi789');
    const result = new MockChatInvitePeek({
      chat: { id: BigInt(200), title: 'Peek Group' },
      expires: 1700000000,
    });
    mockInvoke.mockResolvedValueOnce(result);

    const ctx = createMockCommandContext();
    await chatInviteInfoAction.call(ctx as any, 'https://t.me/+ghi789');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.alreadyMember).toBe(false);
    expect(data.chat.title).toBe('Peek Group');
    expect(data.expires).toBeDefined();
  });

  it('outputs error for invalid link', async () => {
    mockExtractInviteHash.mockImplementationOnce(() => {
      throw new TgError('Invalid invite link format', 'INVALID_INVITE');
    });

    const ctx = createMockCommandContext();
    await chatInviteInfoAction.call(ctx as any, 'not-a-link');

    expect(mockOutputError).toHaveBeenCalledOnce();
    expect(mockOutputError.mock.calls[0][0]).toContain('Invalid invite link');
    expect(mockOutputError.mock.calls[0][1]).toBe('INVALID_INVITE');
  });
});
