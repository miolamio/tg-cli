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

// Hoisted mock state for telegram client
const {
  mockConnect,
  mockDestroy,
  mockGetMessages,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockGetMessages: vi.fn().mockResolvedValue([]),
}));

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  getMessages: mockGetMessages,
};

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: {
    StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
  },
  Api: {},
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
const mockStoreWithLock = vi.fn().mockImplementation(async (_profile: string, fn: (s: string) => Promise<any>) => {
  return fn('test-session');
});

vi.mock('../../src/lib/session-store.js', () => ({
  SessionStore: vi.fn().mockImplementation(() => ({
    withLock: mockStoreWithLock,
    filePath: (p: string) => `/mock/sessions/${p}.session`,
  })),
}));

// Mock client module
vi.mock('../../src/lib/client.js', () => ({
  withClient: vi.fn(async (_opts: any, fn: any) => fn(mockClientInstance)),
}));

// Mock peer resolution
const mockResolveEntity = vi.fn().mockResolvedValue({ id: BigInt(123), className: 'Channel' });
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
}));

// Mock serialize
const mockSerializeMessage = vi.fn().mockImplementation((msg: any, _sender?: any) => ({
  id: msg.id,
  text: msg.message ?? '',
  date: '2026-03-12T12:00:00.000Z',
  senderId: msg.senderId?.toString() ?? null,
  senderName: 'Test User',
  replyToMsgId: null,
  forwardFrom: null,
  mediaType: null,
  type: 'message',
}));
vi.mock('../../src/lib/serialize.js', () => ({
  serializeMessage: (...args: any[]) => mockSerializeMessage(...args),
}));

// Mock entity-map
const mockBuildEntityMap = vi.fn().mockReturnValue(new Map());
vi.mock('../../src/lib/entity-map.js', () => ({
  buildEntityMap: (...args: any[]) => mockBuildEntityMap(...args),
}));

// Import after mocks
import { messageGetAction } from '../../src/commands/message/get.js';

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

// Helper to create mock message objects (gramjs style)
function createMockMessage(overrides: Record<string, any> = {}) {
  const defaults = {
    id: 1,
    message: 'Hello world',
    date: 1710150900,
    senderId: BigInt(456),
    entities: [],
    media: null,
    action: null,
    replyTo: null,
    fwdFrom: null,
    fromId: { userId: BigInt(456) },
    _sender: { id: BigInt(456), firstName: 'Test', lastName: 'User' },
  };
  return { ...defaults, ...overrides };
}

describe('messageGetAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns messages for valid IDs', async () => {
    const messages = [
      createMockMessage({ id: 100 }),
      createMockMessage({ id: 101 }),
      createMockMessage({ id: 102 }),
    ];
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext();
    await messageGetAction.call(ctx as any, 'mychat', '100,101,102');

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, 'mychat');
    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ids: [100, 101, 102] }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages).toHaveLength(3);
    expect(data.notFound).toEqual([]);
  });

  it('populates notFound for missing IDs', async () => {
    const messages = [
      createMockMessage({ id: 100 }),
      undefined,
      createMockMessage({ id: 102 }),
    ];
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext();
    await messageGetAction.call(ctx as any, 'mychat', '100,101,102');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages).toHaveLength(2);
    expect(data.notFound).toEqual([101]);
  });

  it('rejects invalid IDs', async () => {
    const ctx = createMockCommandContext();
    await messageGetAction.call(ctx as any, 'mychat', 'abc,0,-1');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message IDs'),
      'INVALID_MSG_ID',
    );
    expect(mockGetMessages).not.toHaveBeenCalled();
  });

  it('rejects over 100 IDs', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1).join(',');
    const ctx = createMockCommandContext();
    await messageGetAction.call(ctx as any, 'mychat', ids);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Maximum 100 IDs per request'),
      'TOO_MANY_IDS',
    );
    expect(mockGetMessages).not.toHaveBeenCalled();
  });

  it('preserves order', async () => {
    const messages = [
      createMockMessage({ id: 3 }),
      createMockMessage({ id: 1 }),
      createMockMessage({ id: 2 }),
    ];
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext();
    await messageGetAction.call(ctx as any, 'mychat', '3,1,2');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages).toHaveLength(3);
    // Messages should preserve input order (positional matching)
    expect(data.messages[0].id).toBe(3);
    expect(data.messages[1].id).toBe(1);
    expect(data.messages[2].id).toBe(2);
  });

  it('all not found returns empty messages with full notFound', async () => {
    const messages = [undefined, undefined, undefined];
    mockGetMessages.mockResolvedValueOnce(messages);

    const ctx = createMockCommandContext();
    await messageGetAction.call(ctx as any, 'mychat', '100,101,102');

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.messages).toEqual([]);
    expect(data.notFound).toEqual([100, 101, 102]);
  });

  it('unauthenticated returns NOT_AUTHENTICATED', async () => {
    mockStoreWithLock.mockImplementationOnce(async (_profile: string, fn: (s: string | null) => Promise<any>) => {
      return fn(null);
    });

    const ctx = createMockCommandContext();
    await messageGetAction.call(ctx as any, 'mychat', '100');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in'),
      'NOT_AUTHENTICATED',
    );
  });
});
