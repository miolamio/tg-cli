import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';

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
  mockSendFile,
  mockGetMessages,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockSendFile: vi.fn(),
  mockGetMessages: vi.fn().mockResolvedValue([]),
}));

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  sendFile: mockSendFile,
  getMessages: mockGetMessages,
};

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: {
    StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
  },
  Api: {
    MessageMediaPhoto: class MessageMediaPhoto {},
    MessageMediaDocument: class MessageMediaDocument {},
    DocumentAttributeFilename: class DocumentAttributeFilename {},
    DocumentAttributeVideo: class DocumentAttributeVideo {},
    DocumentAttributeAudio: class DocumentAttributeAudio {},
    DocumentAttributeSticker: class DocumentAttributeSticker {},
    DocumentAttributeImageSize: class DocumentAttributeImageSize {},
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
const mockAssertForum = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
  assertForum: (...args: any[]) => mockAssertForum(...args),
}));

// Mock serialize
const mockSerializeMessage = vi.fn().mockImplementation((msg: any) => ({
  id: msg.id,
  text: msg.message ?? '',
  date: '2025-03-11T12:00:00.000Z',
  senderId: null,
  senderName: null,
  replyToMsgId: null,
  forwardFrom: null,
  mediaType: 'photo',
  type: 'message' as const,
}));
vi.mock('../../src/lib/serialize.js', () => ({
  serializeMessage: (...args: any[]) => mockSerializeMessage(...args),
  extractMediaInfo: vi.fn(),
  detectMedia: vi.fn(),
}));

// Mock media-utils
const mockDetectFileType = vi.fn().mockReturnValue('photo');
vi.mock('../../src/lib/media-utils.js', () => ({
  detectFileType: (...args: any[]) => mockDetectFileType(...args),
  generateFilename: vi.fn(),
  formatBytes: vi.fn(),
  FILTER_MAP: {},
  VALID_FILTERS: [],
}));

// Mock fs.access
const mockAccess = vi.fn().mockResolvedValue(undefined);
vi.mock('node:fs/promises', () => ({
  access: (...args: any[]) => mockAccess(...args),
}));

// Import after mocks
import { mediaSendAction } from '../../src/commands/media/send.js';

// Create a mock Command context
function createMockCommandContext(args: string[], opts: Record<string, any> = {}) {
  return {
    args,
    optsWithGlobals: vi.fn(() => ({
      profile: 'default',
      quiet: false,
      config: undefined,
      json: true,
      human: false,
      verbose: false,
      caption: undefined,
      replyTo: undefined,
      ...opts,
    })),
  };
}

describe('mediaSendAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccess.mockResolvedValue(undefined);
    mockDetectFileType.mockReturnValue('photo');
    mockSendFile.mockResolvedValue({
      id: 100,
      message: '',
      date: 1710150900,
      media: { _type: 'photo' },
    });
  });

  it('sends single file and returns serialized MessageItem', async () => {
    const ctx = createMockCommandContext(['testchat', 'photo.jpg']);
    await mediaSendAction.call(ctx as any);

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, 'testchat');
    expect(mockSendFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        file: resolve('photo.jpg'),
      }),
    );
    expect(mockSerializeMessage).toHaveBeenCalledOnce();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();

    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('mediaType');
  });

  it('sends album (multiple files) and returns album result', async () => {
    // For album, sendFile returns last message
    mockSendFile.mockResolvedValueOnce({
      id: 103,
      message: '',
      date: 1710150900,
      media: { _type: 'photo' },
    });

    // Re-fetch album messages
    const albumMsgs = [
      { id: 101, message: '', date: 1710150900, media: {} },
      { id: 102, message: '', date: 1710150900, media: {} },
      { id: 103, message: '', date: 1710150900, media: {} },
    ];
    mockGetMessages.mockResolvedValueOnce(albumMsgs);

    const ctx = createMockCommandContext(['testchat', 'a.jpg', 'b.jpg', 'c.jpg']);
    await mediaSendAction.call(ctx as any);

    expect(mockSendFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        file: expect.arrayContaining([
          resolve('a.jpg'),
          resolve('b.jpg'),
          resolve('c.jpg'),
        ]),
      }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();

    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result).toHaveProperty('messages');
    expect(result).toHaveProperty('sent', 3);
    expect(result.messages).toHaveLength(3);
  });

  it('passes --caption to sendFile', async () => {
    const ctx = createMockCommandContext(['testchat', 'photo.jpg'], { caption: 'My caption' });
    await mediaSendAction.call(ctx as any);

    expect(mockSendFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caption: 'My caption',
      }),
    );
  });

  it('passes --reply-to parsed as integer to sendFile', async () => {
    const ctx = createMockCommandContext(['testchat', 'photo.jpg'], { replyTo: '42' });
    await mediaSendAction.call(ctx as any);

    expect(mockSendFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        replyTo: 42,
      }),
    );
  });

  it('detects voice note for .ogg files and sets voiceNote: true', async () => {
    mockDetectFileType.mockReturnValue('voice');

    const ctx = createMockCommandContext(['testchat', 'audio.ogg']);
    await mediaSendAction.call(ctx as any);

    expect(mockSendFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        voiceNote: true,
      }),
    );
  });

  it('returns FILE_NOT_FOUND error when file does not exist', async () => {
    mockAccess.mockRejectedValueOnce(new Error('ENOENT'));

    const ctx = createMockCommandContext(['testchat', 'nonexistent.jpg']);
    await mediaSendAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('File not found'),
      'FILE_NOT_FOUND',
    );
    expect(mockSendFile).not.toHaveBeenCalled();
  });

  it('returns ALBUM_TOO_LARGE error for more than 10 files', async () => {
    const files = Array.from({ length: 11 }, (_, i) => `file${i}.jpg`);
    const ctx = createMockCommandContext(['testchat', ...files]);
    await mediaSendAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('maximum of 10'),
      'ALBUM_TOO_LARGE',
    );
    expect(mockSendFile).not.toHaveBeenCalled();
  });

  it('includes warning when album re-fetch returns partial results', async () => {
    mockSendFile.mockResolvedValueOnce({
      id: 103,
      message: '',
      date: 1710150900,
      media: { _type: 'photo' },
    });

    // Only 2 of 3 messages returned (one gap)
    const albumMsgs = [
      { id: 101, message: '', date: 1710150900, media: {} },
      null,
      { id: 103, message: '', date: 1710150900, media: {} },
    ];
    mockGetMessages.mockResolvedValueOnce(albumMsgs);

    const ctx = createMockCommandContext(['testchat', 'a.jpg', 'b.jpg', 'c.jpg']);
    await mediaSendAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result.sent).toBe(2);
    expect(result.warning).toMatch(/Only 2 of 3/);
  });

  it('returns INVALID_REPLY_TO error for non-numeric --reply-to', async () => {
    const ctx = createMockCommandContext(['testchat', 'photo.jpg'], { replyTo: 'abc' });
    await mediaSendAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid reply-to message ID'),
      'INVALID_REPLY_TO',
    );
    expect(mockSendFile).not.toHaveBeenCalled();
  });

  it('sets forceDocument for .pdf files', async () => {
    mockDetectFileType.mockReturnValue('document');

    const ctx = createMockCommandContext(['testchat', 'report.pdf']);
    await mediaSendAction.call(ctx as any);

    expect(mockSendFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        forceDocument: true,
      }),
    );
  });

  // ---- Topic tests (Finding 4: external verification coverage gap) ----

  it('sends to topic by passing topicId as replyTo', async () => {
    const ctx = createMockCommandContext(['testchat', 'photo.jpg'], { topic: '42' });
    await mediaSendAction.call(ctx as any);

    expect(mockAssertForum).toHaveBeenCalledWith(
      expect.objectContaining({ className: 'Channel' }),
      42,
    );
    expect(mockSendFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        replyTo: 42,
      }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
  });

  it('--topic overrides --reply-to', async () => {
    const ctx = createMockCommandContext(['testchat', 'photo.jpg'], { topic: '42', replyTo: '99' });
    await mediaSendAction.call(ctx as any);

    expect(mockSendFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        replyTo: 42,
      }),
    );
  });

  it('returns error when --topic used on non-forum chat', async () => {
    // assertForum throws TgError which goes through formatError in catch block
    const { TgError } = await import('../../src/lib/errors.js');
    mockAssertForum.mockRejectedValueOnce(
      new TgError('Chat is not a forum-enabled supergroup', 'NOT_A_FORUM'),
    );

    const ctx = createMockCommandContext(['testchat', 'photo.jpg'], { topic: '42' });
    await mediaSendAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('forum'),
      'NOT_A_FORUM',
    );
    expect(mockSendFile).not.toHaveBeenCalled();
  });

  it('returns INVALID_TOPIC_ID for non-numeric --topic', async () => {
    const ctx = createMockCommandContext(['testchat', 'photo.jpg'], { topic: 'abc' });
    await mediaSendAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid topic ID'),
      'INVALID_TOPIC_ID',
    );
    expect(mockSendFile).not.toHaveBeenCalled();
  });
});
