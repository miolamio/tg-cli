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
  MockChannel,
  MockUser,
} = vi.hoisted(() => {
  const _MockChannel = class Channel {
    id: any; title: string; username: string | null; megagroup: boolean;
    constructor(args: any = {}) {
      this.id = args.id ?? BigInt(100); this.title = args.title ?? 'Test Channel';
      this.username = args.username ?? null; this.megagroup = args.megagroup ?? false;
    }
  };
  const _MockUser = class User {
    id: any; firstName: string; lastName: string | null; username: string | null;
    constructor(args: any = {}) {
      this.id = args.id ?? BigInt(300); this.firstName = args.firstName ?? 'Test';
      this.lastName = args.lastName ?? null; this.username = args.username ?? null;
    }
  };
  return {
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockDestroy: vi.fn().mockResolvedValue(undefined),
    MockChannel: _MockChannel,
    MockUser: _MockUser,
  };
});

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
};

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: {
    StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
  },
  Api: {
    Channel: MockChannel,
    User: MockUser,
    Chat: class Chat {
      id: any; title: string;
      constructor(args: any = {}) { this.id = args.id ?? BigInt(200); this.title = args.title ?? 'Group'; }
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

import { chatResolveAction } from '../../src/commands/chat/resolve.js';

function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default', quiet: false, config: undefined,
      json: true, human: false, verbose: false,
      ...opts,
    })),
  };
}

describe('chatResolveAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a username to entity info', async () => {
    const entity = new MockChannel({ id: BigInt(100), title: 'My Channel', username: 'mychan', megagroup: false });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext();
    await chatResolveAction.call(ctx as any, 'mychan');

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, 'mychan');
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.id).toBe('100');
    expect(data.type).toBe('channel');
    expect(data.title).toBe('My Channel');
    expect(data.username).toBe('mychan');
  });

  it('resolves a numeric ID', async () => {
    const entity = new MockUser({ id: BigInt(300), firstName: 'Alice', username: 'alice' });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext();
    await chatResolveAction.call(ctx as any, '300');

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, '300');
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.id).toBe('300');
    expect(data.type).toBe('user');
    expect(data.title).toBe('Alice');
  });

  it('outputs error for unknown peer', async () => {
    mockResolveEntity.mockRejectedValueOnce(new Error('Peer not found: no such user'));

    const ctx = createMockCommandContext();
    await chatResolveAction.call(ctx as any, 'nonexistent');

    expect(mockOutputError).toHaveBeenCalledOnce();
    expect(mockOutputError.mock.calls[0][0]).toContain('Peer not found');
  });

  it('resolves a supergroup', async () => {
    const entity = new MockChannel({ id: BigInt(101), title: 'Supergroup', username: 'sg', megagroup: true });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const ctx = createMockCommandContext();
    await chatResolveAction.call(ctx as any, 'sg');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.type).toBe('supergroup');
  });
});
