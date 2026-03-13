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

// Hoisted mock state for telegram client
const {
  mockConnect,
  mockDestroy,
  mockUnpinMessage,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockUnpinMessage: vi.fn().mockResolvedValue(undefined),
}));

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  unpinMessage: mockUnpinMessage,
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
const mockResolveEntity = vi.fn().mockResolvedValue({ id: BigInt(789), className: 'Channel' });
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
}));

// Mock serialize (for bigIntToString)
vi.mock('../../src/lib/serialize.js', () => ({
  bigIntToString: (v: bigint) => String(v),
}));

// Mock errors (use actual translateTelegramError)
vi.mock('../../src/lib/errors.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/errors.js')>();
  return {
    ...actual,
    translateTelegramError: actual.translateTelegramError,
  };
});

// Import after mocks
import { messageUnpinAction } from '../../src/commands/message/unpin.js';

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

describe('messageUnpinAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnpinMessage.mockResolvedValue(undefined);
  });

  it('calls client.unpinMessage with correct entity and message ID', async () => {
    const ctx = createMockCommandContext();
    await messageUnpinAction.call(ctx as any, 'testchat', '42');

    expect(mockUnpinMessage).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
  });

  it('synthesizes PinResult confirmation with action unpinned (no silent field)', async () => {
    const ctx = createMockCommandContext();
    await messageUnpinAction.call(ctx as any, 'testchat', '42');

    expect(mockOutputSuccess).toHaveBeenCalledWith({
      messageId: 42,
      chatId: '789',
      action: 'unpinned',
    });
  });

  it('outputs INVALID_MESSAGE_ID for non-numeric message ID', async () => {
    const ctx = createMockCommandContext();
    await messageUnpinAction.call(ctx as any, 'testchat', 'bad');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message ID'),
      'INVALID_MESSAGE_ID',
    );
    expect(mockUnpinMessage).not.toHaveBeenCalled();
  });

  it('outputs INVALID_MESSAGE_ID for mixed string like "12abc"', async () => {
    const ctx = createMockCommandContext();
    await messageUnpinAction.call(ctx as any, 'testchat', '12abc');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message ID'),
      'INVALID_MESSAGE_ID',
    );
    expect(mockUnpinMessage).not.toHaveBeenCalled();
  });

  it('outputs INVALID_MESSAGE_ID for zero', async () => {
    const ctx = createMockCommandContext();
    await messageUnpinAction.call(ctx as any, 'testchat', '0');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message ID'),
      'INVALID_MESSAGE_ID',
    );
    expect(mockUnpinMessage).not.toHaveBeenCalled();
  });

  it('translates RPCError via translateTelegramError', async () => {
    mockUnpinMessage.mockRejectedValueOnce({ errorMessage: 'CHAT_ADMIN_REQUIRED' });

    const ctx = createMockCommandContext();
    await messageUnpinAction.call(ctx as any, 'testchat', '42');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Admin privileges required',
      'CHAT_ADMIN_REQUIRED',
    );
  });
});
