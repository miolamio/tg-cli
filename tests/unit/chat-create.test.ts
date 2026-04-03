import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
}));

// Hoisted mock state
const {
  mockConnect,
  mockDestroy,
  mockInvoke,
  MockCreateChannel,
  MockCreateChat,
} = vi.hoisted(() => {
  const _MockCreateChannel = vi.fn().mockImplementation((args: any) => ({ className: 'channels.CreateChannel', ...args }));
  const _MockCreateChat = vi.fn().mockImplementation((args: any) => ({ className: 'messages.CreateChat', ...args }));
  return {
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockDestroy: vi.fn().mockResolvedValue(undefined),
    mockInvoke: vi.fn().mockResolvedValue({ chats: [{ id: BigInt(999), title: 'New Chat' }] }),
    MockCreateChannel: _MockCreateChannel,
    MockCreateChat: _MockCreateChat,
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
      CreateChannel: MockCreateChannel,
    },
    messages: {
      CreateChat: MockCreateChat,
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
import { chatCreateAction } from '../../src/commands/chat/create.js';

function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default', quiet: false, config: undefined,
      json: true, human: false, verbose: false,
      ...opts,
    })),
  };
}

describe('chatCreateAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ chats: [{ id: BigInt(999), title: 'New Chat' }] });
  });

  it('creates a supergroup by default (calls CreateChannel with megagroup=true)', async () => {
    const ctx = createMockCommandContext();
    await chatCreateAction.call(ctx as any, 'My Supergroup');

    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(MockCreateChannel).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Supergroup', megagroup: true, broadcast: false }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.title).toBe('My Supergroup');
    expect(data.type).toBe('supergroup');
    expect(data.id).toBe('999');
  });

  it('creates a channel when --type channel is passed (broadcast=true)', async () => {
    const ctx = createMockCommandContext({ type: 'channel' });
    await chatCreateAction.call(ctx as any, 'My Channel');

    expect(MockCreateChannel).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Channel', broadcast: true, megagroup: false }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.type).toBe('channel');
  });

  it('creates a basic group when --type group is passed (calls CreateChat)', async () => {
    const ctx = createMockCommandContext({ type: 'group' });
    await chatCreateAction.call(ctx as any, 'My Group');

    expect(MockCreateChat).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Group' }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.type).toBe('group');
  });

  it('passes description as about when provided', async () => {
    const ctx = createMockCommandContext({ description: 'A test description' });
    await chatCreateAction.call(ctx as any, 'Described Chat');

    expect(MockCreateChannel).toHaveBeenCalledWith(
      expect.objectContaining({ about: 'A test description' }),
    );
  });

  it('errors on empty title', async () => {
    const ctx = createMockCommandContext();
    await chatCreateAction.call(ctx as any, '');

    expect(mockOutputError).toHaveBeenCalledOnce();
    expect(mockOutputError.mock.calls[0][1]).toBe('INVALID_INPUT');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('outputs null id when result has no chats', async () => {
    mockInvoke.mockResolvedValueOnce({});
    const ctx = createMockCommandContext();
    await chatCreateAction.call(ctx as any, 'Empty Result');

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.id).toBeNull();
  });
});
