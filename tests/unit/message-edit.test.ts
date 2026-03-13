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
  mockEditMessage,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockEditMessage: vi.fn().mockResolvedValue({}),
}));

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  editMessage: mockEditMessage,
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
const mockSerializeMessage = vi.fn().mockReturnValue({
  id: 42,
  text: 'edited text',
  date: '2026-03-13T12:00:00.000Z',
  senderId: '123',
  senderName: 'Alice',
  replyToMsgId: null,
  forwardFrom: null,
  mediaType: null,
  type: 'message',
  editDate: '2026-03-13T12:05:00.000Z',
});
vi.mock('../../src/lib/serialize.js', () => ({
  serializeMessage: (...args: any[]) => mockSerializeMessage(...args),
}));

// Mock errors
vi.mock('../../src/lib/errors.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/errors.js')>();
  return {
    ...actual,
    translateTelegramError: actual.translateTelegramError,
  };
});

// Import after mocks
import { messageEditAction } from '../../src/commands/message/edit.js';

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

describe('messageEditAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset editMessage to return a valid message by default
    mockEditMessage.mockResolvedValue({
      id: 42,
      message: 'edited text',
      date: 1710150900,
      editDate: 1710151200,
      senderId: BigInt(456),
      entities: [],
      media: null,
      action: null,
      replyTo: null,
      fwdFrom: null,
    });
  });

  it('edits a message and returns serialized MessageItem via outputSuccess', async () => {
    const ctx = createMockCommandContext();
    await messageEditAction.call(ctx as any, 'testchat', '42', 'edited text');

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, 'testchat');
    expect(mockEditMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 42, text: 'edited text' }),
    );
    expect(mockSerializeMessage).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('text');
    expect(data).toHaveProperty('editDate');
  });

  it('outputs STDIN_REQUIRED when text is "-" and stdin is TTY', async () => {
    const origIsTTY = process.stdin.isTTY;
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      const ctx = createMockCommandContext();
      await messageEditAction.call(ctx as any, 'testchat', '42', '-');

      expect(mockOutputError).toHaveBeenCalledWith(
        expect.stringContaining('requires piped input'),
        'STDIN_REQUIRED',
      );
      expect(mockEditMessage).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true });
    }
  });

  it('outputs INVALID_MESSAGE_ID for non-numeric message ID', async () => {
    const ctx = createMockCommandContext();
    await messageEditAction.call(ctx as any, 'testchat', 'notanumber', 'new text');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message ID'),
      'INVALID_MESSAGE_ID',
    );
    expect(mockEditMessage).not.toHaveBeenCalled();
  });

  it('outputs INVALID_MESSAGE_ID for mixed string like "12abc"', async () => {
    const ctx = createMockCommandContext();
    await messageEditAction.call(ctx as any, 'testchat', '12abc', 'new text');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message ID'),
      'INVALID_MESSAGE_ID',
    );
    expect(mockEditMessage).not.toHaveBeenCalled();
  });

  it('outputs INVALID_MESSAGE_ID for zero', async () => {
    const ctx = createMockCommandContext();
    await messageEditAction.call(ctx as any, 'testchat', '0', 'new text');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message ID'),
      'INVALID_MESSAGE_ID',
    );
    expect(mockEditMessage).not.toHaveBeenCalled();
  });

  it('outputs INVALID_MESSAGE_ID for negative number', async () => {
    const ctx = createMockCommandContext();
    await messageEditAction.call(ctx as any, 'testchat', '-5', 'new text');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message ID'),
      'INVALID_MESSAGE_ID',
    );
    expect(mockEditMessage).not.toHaveBeenCalled();
  });

  it('outputs EMPTY_MESSAGE for empty text', async () => {
    const ctx = createMockCommandContext();
    await messageEditAction.call(ctx as any, 'testchat', '42', '');

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Message text is required'),
      'EMPTY_MESSAGE',
    );
    expect(mockEditMessage).not.toHaveBeenCalled();
  });

  it('translates RPCError MESSAGE_EDIT_TIME_EXPIRED to human-readable message', async () => {
    mockEditMessage.mockRejectedValueOnce({ errorMessage: 'MESSAGE_EDIT_TIME_EXPIRED' });

    const ctx = createMockCommandContext();
    await messageEditAction.call(ctx as any, 'testchat', '42', 'too late');

    expect(mockOutputError).toHaveBeenCalledWith(
      'Cannot edit: 48-hour edit window has expired',
      'MESSAGE_EDIT_TIME_EXPIRED',
    );
  });

  it('reads from stdin when text is "-" and stdin is piped', async () => {
    const origIsTTY = process.stdin.isTTY;
    const origStdin = process.stdin[Symbol.asyncIterator];
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });

      const stdinContent = Buffer.from('piped edit content\n');
      (process.stdin as any)[Symbol.asyncIterator] = async function* () {
        yield stdinContent;
      };

      const ctx = createMockCommandContext();
      await messageEditAction.call(ctx as any, 'testchat', '42', '-');

      expect(mockEditMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ message: 42, text: 'piped edit content' }),
      );
      expect(mockOutputSuccess).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true });
      (process.stdin as any)[Symbol.asyncIterator] = origStdin;
    }
  });
});
