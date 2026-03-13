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
  mockPinMessage,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockPinMessage: vi.fn().mockResolvedValue(undefined),
}));

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  pinMessage: mockPinMessage,
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
const mockResolveEntity = vi.fn().mockResolvedValue({ id: BigInt(456), className: 'Channel' });
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
import { messagePinAction } from '../../src/commands/message/pin.js';

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

describe('messagePinAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPinMessage.mockResolvedValue(undefined);
  });

  it('pins silently by default (notify: false)', async () => {
    const ctx = createMockCommandContext();
    await messagePinAction.call(ctx as any, 'testchat', '42');

    expect(mockPinMessage).toHaveBeenCalledWith(
      expect.anything(),
      42,
      { notify: false },
    );
  });

  it('pins with notification when --notify is set', async () => {
    const ctx = createMockCommandContext({ notify: true });
    await messagePinAction.call(ctx as any, 'testchat', '42');

    expect(mockPinMessage).toHaveBeenCalledWith(
      expect.anything(),
      42,
      { notify: true },
    );
  });

  it('outputs PinResult with silent: true by default', async () => {
    const ctx = createMockCommandContext();
    await messagePinAction.call(ctx as any, 'testchat', '42');

    expect(mockOutputSuccess).toHaveBeenCalledWith({
      messageId: 42,
      chatId: '456',
      action: 'pinned',
      silent: true,
    });
  });

  it('outputs PinResult with silent: false when --notify', async () => {
    const ctx = createMockCommandContext({ notify: true });
    await messagePinAction.call(ctx as any, 'testchat', '42');

    expect(mockOutputSuccess).toHaveBeenCalledWith({
      messageId: 42,
      chatId: '456',
      action: 'pinned',
      silent: false,
    });
  });

  it('outputs INVALID_MESSAGE_ID for non-numeric message ID', async () => {
    const ctx = createMockCommandContext();
    await messagePinAction.call(ctx as any, 'testchat', 'notanumber');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message ID'),
      'INVALID_MESSAGE_ID',
    );
    expect(mockPinMessage).not.toHaveBeenCalled();
  });

  it('translates RPCError via translateTelegramError', async () => {
    mockPinMessage.mockRejectedValueOnce({ errorMessage: 'CHAT_ADMIN_REQUIRED' });

    const ctx = createMockCommandContext();
    await messagePinAction.call(ctx as any, 'testchat', '42');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Admin privileges required',
      'CHAT_ADMIN_REQUIRED',
    );
  });
});
