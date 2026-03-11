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
  mockForwardMessages,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockForwardMessages: vi.fn().mockResolvedValue([]),
}));

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  forwardMessages: mockForwardMessages,
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

// Mock peer resolution -- return different entities for different inputs
const mockResolveEntity = vi.fn().mockImplementation(async (_client: any, input: string) => {
  if (input === 'source') return { id: BigInt(100), className: 'Channel' };
  if (input === 'dest') return { id: BigInt(200), className: 'Channel' };
  return { id: BigInt(999), className: 'Channel' };
});
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
}));

// Helper to create mock message objects
function createMockMessage(overrides: Record<string, any> = {}) {
  const defaults = {
    id: 1,
    message: 'Forwarded message',
    date: 1710150900,
    senderId: BigInt(456),
    entities: [],
    media: null,
    action: null,
    replyTo: null,
    fwdFrom: null,
  };
  return { ...defaults, ...overrides };
}

// Import after mocks
import { messageForwardAction } from '../../src/commands/message/forward.js';

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

describe('messageForwardAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards a single message and returns forwarded count with messages', async () => {
    const forwardedMsgs = [createMockMessage({ id: 50, message: 'Forwarded' })];
    mockForwardMessages.mockResolvedValueOnce(forwardedMsgs);

    const ctx = createMockCommandContext();
    await messageForwardAction.call(ctx as any, 'source', '123', 'dest');

    // Should resolve both source and destination entities
    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, 'source');
    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, 'dest');

    // Should call forwardMessages with fromPeer
    expect(mockForwardMessages).toHaveBeenCalledWith(
      expect.anything(), // toEntity
      expect.objectContaining({
        messages: [123],
        fromPeer: expect.anything(), // fromEntity
      }),
    );

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.forwarded).toBe(1);
    expect(data.messages).toHaveLength(1);
  });

  it('forwards multiple comma-separated message IDs', async () => {
    const forwardedMsgs = [
      createMockMessage({ id: 50 }),
      createMockMessage({ id: 51 }),
      createMockMessage({ id: 52 }),
    ];
    mockForwardMessages.mockResolvedValueOnce(forwardedMsgs);

    const ctx = createMockCommandContext();
    await messageForwardAction.call(ctx as any, 'source', '10,20,30', 'dest');

    expect(mockForwardMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        messages: [10, 20, 30],
      }),
    );

    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.forwarded).toBe(3);
    expect(data.messages).toHaveLength(3);
  });

  it('rejects invalid message IDs with INVALID_MESSAGE_IDS error', async () => {
    const ctx = createMockCommandContext();
    await messageForwardAction.call(ctx as any, 'source', '10,abc,30', 'dest');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message IDs'),
      'INVALID_MESSAGE_IDS',
    );
    expect(mockForwardMessages).not.toHaveBeenCalled();
  });

  it('outputs error when not logged in', async () => {
    mockStoreWithLock.mockImplementationOnce(async (_profile: string, fn: (s: string) => Promise<any>) => {
      return fn('');
    });

    const ctx = createMockCommandContext();
    await messageForwardAction.call(ctx as any, 'source', '10', 'dest');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in'),
      'NOT_AUTHENTICATED',
    );
  });

  it('handles whitespace in comma-separated IDs', async () => {
    const forwardedMsgs = [createMockMessage({ id: 50 }), createMockMessage({ id: 51 })];
    mockForwardMessages.mockResolvedValueOnce(forwardedMsgs);

    const ctx = createMockCommandContext();
    await messageForwardAction.call(ctx as any, 'source', ' 10 , 20 ', 'dest');

    expect(mockForwardMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        messages: [10, 20],
      }),
    );
  });
});
