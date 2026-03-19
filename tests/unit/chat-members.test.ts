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
  mockGetParticipants,
  MockChannel,
  MockUser,
} = vi.hoisted(() => {
  const _MockChannel = class Channel {
    id: any; title: string;
    constructor(args: any = {}) { this.id = args.id ?? BigInt(100); this.title = args.title ?? 'Test Channel'; }
  };
  const _MockUser = class User {
    id: any; username: string | null; firstName: string | null; lastName: string | null; bot: boolean; status: any;
    constructor(args: any = {}) {
      this.id = args.id ?? BigInt(1); this.username = args.username ?? null;
      this.firstName = args.firstName ?? null; this.lastName = args.lastName ?? null;
      this.bot = args.bot ?? false; this.status = args.status ?? null;
    }
  };
  return {
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockDestroy: vi.fn().mockResolvedValue(undefined),
    mockGetParticipants: vi.fn().mockResolvedValue([]),
    MockChannel: _MockChannel,
    MockUser: _MockUser,
  };
});

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  getParticipants: mockGetParticipants,
};

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: {
    StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
  },
  Api: {
    Channel: MockChannel,
    User: MockUser,
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

// Helper to create mock user participants
function createMockUser(overrides: Record<string, any> = {}) {
  return {
    id: BigInt(1),
    username: null,
    firstName: null,
    lastName: null,
    bot: false,
    status: null,
    ...overrides,
  };
}

// Import after mocks
import { chatMembersAction } from '../../src/commands/chat/members.js';

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

describe('chatMembersAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists members with serialized output', async () => {
    const entity = new MockChannel({ id: BigInt(100), title: 'Test Group' });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const participants = [
      createMockUser({ id: BigInt(1), username: 'alice', firstName: 'Alice', lastName: 'Smith' }),
      createMockUser({ id: BigInt(2), username: 'bob', firstName: 'Bob', bot: true, status: { className: 'UserStatusOnline' } }),
    ];
    (participants as any).total = 2;
    mockGetParticipants.mockResolvedValueOnce(participants);

    const ctx = createMockCommandContext();
    await chatMembersAction.call(ctx as any, 'testgroup');

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, 'testgroup');
    expect(mockGetParticipants).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.members).toHaveLength(2);
    expect(data.total).toBe(2);
    expect(data.members[0].username).toBe('alice');
    expect(data.members[0].firstName).toBe('Alice');
    expect(data.members[0].lastName).toBe('Smith');
    expect(data.members[0].isBot).toBe(false);
    expect(data.members[1].username).toBe('bob');
    expect(data.members[1].isBot).toBe(true);
    expect(data.members[1].status).toBe('UserStatusOnline');
  });

  it('applies limit and offset pagination', async () => {
    const entity = new MockChannel({ id: BigInt(100) });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const participants = [
      createMockUser({ id: BigInt(10), firstName: 'User10' }),
    ];
    (participants as any).total = 50;
    mockGetParticipants.mockResolvedValueOnce(participants);

    const ctx = createMockCommandContext({ limit: '10', offset: '5' });
    await chatMembersAction.call(ctx as any, 'group');

    expect(mockGetParticipants).toHaveBeenCalledWith(
      entity,
      expect.objectContaining({ limit: 10, offset: 5 }),
    );
  });

  it('applies search filter', async () => {
    const entity = new MockChannel({ id: BigInt(100) });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const participants: any[] = [];
    (participants as any).total = 0;
    mockGetParticipants.mockResolvedValueOnce(participants);

    const ctx = createMockCommandContext({ search: 'alice' });
    await chatMembersAction.call(ctx as any, 'group');

    expect(mockGetParticipants).toHaveBeenCalledWith(
      entity,
      expect.objectContaining({ search: 'alice' }),
    );
  });

  it('handles CHAT_ADMIN_REQUIRED error gracefully', async () => {
    const entity = new MockChannel({ id: BigInt(100) });
    mockResolveEntity.mockResolvedValueOnce(entity);
    mockGetParticipants.mockRejectedValueOnce(new Error('CHAT_ADMIN_REQUIRED'));

    const ctx = createMockCommandContext();
    await chatMembersAction.call(ctx as any, 'group');

    expect(mockOutputError).toHaveBeenCalledOnce();
    expect(mockOutputError.mock.calls[0][0]).toContain('CHAT_ADMIN_REQUIRED');
  });

  it('handles empty member list', async () => {
    const entity = new MockChannel({ id: BigInt(100) });
    mockResolveEntity.mockResolvedValueOnce(entity);

    const participants: any[] = [];
    (participants as any).total = 0;
    mockGetParticipants.mockResolvedValueOnce(participants);

    const ctx = createMockCommandContext();
    await chatMembersAction.call(ctx as any, 'group');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.members).toHaveLength(0);
    expect(data.total).toBe(0);
  });
});
