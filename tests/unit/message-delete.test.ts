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
  mockDeleteMessages,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockDeleteMessages: vi.fn().mockResolvedValue([]),
}));

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  deleteMessages: mockDeleteMessages,
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
import { messageDeleteAction } from '../../src/commands/message/delete.js';

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

describe('messageDeleteAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteMessages.mockResolvedValue([]);
  });

  it('outputs DELETE_MODE_REQUIRED when neither --revoke nor --for-me is set', async () => {
    const ctx = createMockCommandContext();
    await messageDeleteAction.call(ctx as any, 'testchat', '1,2,3');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Specify --revoke (delete for everyone) or --for-me (delete for self)',
      'DELETE_MODE_REQUIRED',
    );
    expect(mockDeleteMessages).not.toHaveBeenCalled();
  });

  it('calls client.deleteMessages with revoke: true when --revoke is set', async () => {
    const ctx = createMockCommandContext({ revoke: true });
    await messageDeleteAction.call(ctx as any, 'testchat', '10,20');

    expect(mockDeleteMessages).toHaveBeenCalledWith(
      expect.anything(),
      [10, 20],
      { revoke: true },
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
  });

  it('calls client.deleteMessages with revoke: false when --for-me is set', async () => {
    const ctx = createMockCommandContext({ forMe: true });
    await messageDeleteAction.call(ctx as any, 'testchat', '10,20');

    expect(mockDeleteMessages).toHaveBeenCalledWith(
      expect.anything(),
      [10, 20],
      { revoke: false },
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
  });

  it('outputs DeleteResult shape on success with revoke mode', async () => {
    const ctx = createMockCommandContext({ revoke: true });
    await messageDeleteAction.call(ctx as any, 'testchat', '5,10,15');

    expect(mockOutputSuccess).toHaveBeenCalledWith({
      deleted: [5, 10, 15],
      failed: [],
      mode: 'revoke',
    });
  });

  it('outputs DeleteResult shape on success with for-me mode', async () => {
    const ctx = createMockCommandContext({ forMe: true });
    await messageDeleteAction.call(ctx as any, 'testchat', '5');

    expect(mockOutputSuccess).toHaveBeenCalledWith({
      deleted: [5],
      failed: [],
      mode: 'for-me',
    });
  });

  it('outputs INVALID_MSG_ID for non-numeric IDs', async () => {
    const ctx = createMockCommandContext({ revoke: true });
    await messageDeleteAction.call(ctx as any, 'testchat', 'abc,10');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('abc'),
      'INVALID_MSG_ID',
    );
    expect(mockDeleteMessages).not.toHaveBeenCalled();
  });

  it('outputs TOO_MANY_IDS when >100 IDs provided', async () => {
    const ctx = createMockCommandContext({ revoke: true });
    const ids = Array.from({ length: 101 }, (_, i) => String(i + 1)).join(',');
    await messageDeleteAction.call(ctx as any, 'testchat', ids);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('100'),
      'TOO_MANY_IDS',
    );
    expect(mockDeleteMessages).not.toHaveBeenCalled();
  });

  it('translates RPCError via translateTelegramError', async () => {
    mockDeleteMessages.mockRejectedValueOnce({ errorMessage: 'MESSAGE_DELETE_FORBIDDEN' });

    const ctx = createMockCommandContext({ revoke: true });
    await messageDeleteAction.call(ctx as any, 'testchat', '42');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Cannot delete this message',
      'MESSAGE_DELETE_FORBIDDEN',
    );
  });
});
