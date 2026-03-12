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
  mockGetMessages,
  mockDownloadMedia,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockGetMessages: vi.fn().mockResolvedValue([]),
  mockDownloadMedia: vi.fn().mockResolvedValue(undefined),
}));

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  getMessages: mockGetMessages,
  downloadMedia: mockDownloadMedia,
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
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
}));

// Mock serialize
const mockExtractMediaInfo = vi.fn();
const mockDetectMedia = vi.fn();
vi.mock('../../src/lib/serialize.js', () => ({
  extractMediaInfo: (...args: any[]) => mockExtractMediaInfo(...args),
  detectMedia: (...args: any[]) => mockDetectMedia(...args),
  serializeMessage: vi.fn(),
}));

// Mock media-utils
const mockGenerateFilename = vi.fn();
const mockFormatBytes = vi.fn();
vi.mock('../../src/lib/media-utils.js', () => ({
  generateFilename: (...args: any[]) => mockGenerateFilename(...args),
  formatBytes: (...args: any[]) => mockFormatBytes(...args),
  detectFileType: vi.fn(),
  FILTER_MAP: {},
  VALID_FILTERS: [],
}));

// Import after mocks
import { mediaDownloadAction } from '../../src/commands/media/download.js';

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
      output: undefined,
      ...opts,
    })),
  };
}

// Helper to create a mock message with media
function createMockMessageWithMedia(msgId: number, media: any = {}) {
  return {
    id: msgId,
    media,
    message: '',
    date: 1710150900,
  };
}

describe('mediaDownloadAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectMedia.mockReturnValue({ mediaType: 'photo' });
    mockExtractMediaInfo.mockReturnValue({
      filename: null,
      fileSize: 1024,
      mimeType: 'image/jpeg',
      width: 800,
      height: 600,
      duration: null,
    });
    mockGenerateFilename.mockReturnValue('photo_123.jpg');
    mockFormatBytes.mockReturnValue('1KB');
  });

  it('downloads single message media and returns DownloadResult', async () => {
    const mockMsg = createMockMessageWithMedia(123, { _type: 'photo' });
    mockGetMessages.mockResolvedValueOnce([mockMsg]);

    const ctx = createMockCommandContext(['testchat', '123']);
    await mediaDownloadAction.call(ctx as any);

    expect(mockResolveEntity).toHaveBeenCalledWith(mockClientInstance, 'testchat');
    expect(mockGetMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ids: [123] }),
    );
    expect(mockDownloadMedia).toHaveBeenCalled();
    expect(mockOutputSuccess).toHaveBeenCalledOnce();

    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result).toHaveProperty('path');
    expect(result).toHaveProperty('filename');
    expect(result).toHaveProperty('size');
    expect(result).toHaveProperty('mediaType', 'photo');
    expect(result).toHaveProperty('messageId', 123);
    // Path should be absolute
    expect(result.path).toBe(resolve(result.path));
  });

  it('downloads batch media (comma-separated IDs) and returns batch result', async () => {
    const mockMsg1 = createMockMessageWithMedia(100, { _type: 'photo' });
    const mockMsg2 = createMockMessageWithMedia(200, { _type: 'photo' });
    mockGetMessages
      .mockResolvedValueOnce([mockMsg1])
      .mockResolvedValueOnce([mockMsg2]);

    const ctx = createMockCommandContext(['testchat', '100,200']);
    await mediaDownloadAction.call(ctx as any);

    expect(mockGetMessages).toHaveBeenCalledTimes(2);
    expect(mockDownloadMedia).toHaveBeenCalledTimes(2);
    expect(mockOutputSuccess).toHaveBeenCalledOnce();

    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result).toHaveProperty('files');
    expect(result).toHaveProperty('downloaded', 2);
    expect(result.files).toHaveLength(2);
  });

  it('returns NO_MEDIA error for message without media', async () => {
    const mockMsg = createMockMessageWithMedia(456, null);
    mockGetMessages.mockResolvedValueOnce([mockMsg]);
    mockDetectMedia.mockReturnValue({ mediaType: null });

    const ctx = createMockCommandContext(['testchat', '456']);
    await mediaDownloadAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('no downloadable media'),
      'NO_MEDIA',
    );
  });

  it('uses filename from media metadata when available', async () => {
    mockExtractMediaInfo.mockReturnValue({
      filename: 'report.pdf',
      fileSize: 2048,
      mimeType: 'application/pdf',
      width: null,
      height: null,
      duration: null,
    });
    mockDetectMedia.mockReturnValue({ mediaType: 'document' });

    const mockMsg = createMockMessageWithMedia(789, { _type: 'document' });
    mockGetMessages.mockResolvedValueOnce([mockMsg]);

    const ctx = createMockCommandContext(['testchat', '789']);
    await mediaDownloadAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result.filename).toBe('report.pdf');
    // generateFilename should NOT have been called since metadata had filename
    expect(mockGenerateFilename).not.toHaveBeenCalled();
  });

  it('falls back to generateFilename for photos without filename', async () => {
    // Default mock already has filename: null
    const mockMsg = createMockMessageWithMedia(555, { _type: 'photo' });
    mockGetMessages.mockResolvedValueOnce([mockMsg]);

    const ctx = createMockCommandContext(['testchat', '555']);
    await mediaDownloadAction.call(ctx as any);

    expect(mockGenerateFilename).toHaveBeenCalledWith('photo', 555, 'image/jpeg');
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result.filename).toBe('photo_123.jpg');
  });

  it('returns INVALID_ID error for non-numeric message IDs', async () => {
    const ctx = createMockCommandContext(['testchat', 'abc']);
    await mediaDownloadAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message ID'),
      'INVALID_ID',
    );
    expect(mockGetMessages).not.toHaveBeenCalled();
  });

  it('sanitizes path traversal in Telegram-supplied filenames', async () => {
    mockExtractMediaInfo.mockReturnValue({
      filename: '../../etc/passwd',
      fileSize: 2048,
      mimeType: 'application/octet-stream',
      width: null,
      height: null,
      duration: null,
    });
    mockDetectMedia.mockReturnValue({ mediaType: 'document' });

    const mockMsg = createMockMessageWithMedia(999, { _type: 'document' });
    mockGetMessages.mockResolvedValueOnce([mockMsg]);

    const ctx = createMockCommandContext(['testchat', '999']);
    await mediaDownloadAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const result = mockOutputSuccess.mock.calls[0][0];
    // basename() should strip path traversal, leaving just 'passwd'
    expect(result.filename).toBe('passwd');
    expect(result.path).not.toContain('..');
  });

  it('-o flag overrides output path and filename for single download', async () => {
    const mockMsg = createMockMessageWithMedia(333, { _type: 'photo' });
    mockGetMessages.mockResolvedValueOnce([mockMsg]);

    const ctx = createMockCommandContext(['testchat', '333'], { output: '/tmp/custom-photo.jpg' });
    await mediaDownloadAction.call(ctx as any);

    expect(mockDownloadMedia).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outputFile: resolve('/tmp/custom-photo.jpg') }),
    );
    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const result = mockOutputSuccess.mock.calls[0][0];
    expect(result.path).toBe(resolve('/tmp/custom-photo.jpg'));
    // filename should match the actual saved path, not the Telegram metadata name
    expect(result.filename).toBe('custom-photo.jpg');
  });
});
