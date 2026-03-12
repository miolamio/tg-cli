import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock classes for telegram Api
const {
  MockBold,
  MockMediaPhoto,
  MockMediaDocument,
  MockAttrSticker,
  MockAttrVideo,
  MockAttrAudio,
  MockAttrFilename,
  MockAttrImageSize,
  MockActionChatCreate,
} = vi.hoisted(() => {
  class MockBold { offset: number; length: number; constructor(args: any) { this.offset = args.offset; this.length = args.length; } }
  class MockMediaPhoto {}
  class MockMediaDocument {}
  class MockAttrSticker { alt: string; constructor(a?: any) { this.alt = a?.alt ?? ''; } }
  class MockAttrVideo { w?: number; h?: number; duration?: number; constructor(a?: any) { this.w = a?.w; this.h = a?.h; this.duration = a?.duration; } }
  class MockAttrAudio { voice?: boolean; duration?: number; constructor(a?: any) { this.voice = a?.voice; this.duration = a?.duration; } }
  class MockAttrFilename { fileName: string; constructor(a?: any) { this.fileName = a?.fileName ?? ''; } }
  class MockAttrImageSize { w: number; h: number; constructor(a?: any) { this.w = a?.w ?? 0; this.h = a?.h ?? 0; } }
  class MockActionChatCreate {}
  return { MockBold, MockMediaPhoto, MockMediaDocument, MockAttrSticker, MockAttrVideo, MockAttrAudio, MockAttrFilename, MockAttrImageSize, MockActionChatCreate };
});

vi.mock('telegram', () => ({
  Api: {
    MessageEntityBold: MockBold,
    MessageEntityItalic: class { offset: number; length: number; constructor(a: any) { this.offset = a.offset; this.length = a.length; } },
    MessageEntityCode: class { offset: number; length: number; constructor(a: any) { this.offset = a.offset; this.length = a.length; } },
    MessageEntityPre: class { offset: number; length: number; language: string; constructor(a: any) { this.offset = a.offset; this.length = a.length; this.language = a.language ?? ''; } },
    MessageEntityTextUrl: class { offset: number; length: number; url: string; constructor(a: any) { this.offset = a.offset; this.length = a.length; this.url = a.url; } },
    MessageEntityStrike: class { offset: number; length: number; constructor(a: any) { this.offset = a.offset; this.length = a.length; } },
    MessageEntityBlockquote: class { offset: number; length: number; constructor(a: any) { this.offset = a.offset; this.length = a.length; } },
    MessageEntityMentionName: class { offset: number; length: number; userId: number; constructor(a: any) { this.offset = a.offset; this.length = a.length; this.userId = a.userId; } },
    MessageMediaPhoto: MockMediaPhoto,
    MessageMediaDocument: MockMediaDocument,
    DocumentAttributeSticker: MockAttrSticker,
    DocumentAttributeVideo: MockAttrVideo,
    DocumentAttributeAudio: MockAttrAudio,
    DocumentAttributeFilename: MockAttrFilename,
    DocumentAttributeImageSize: MockAttrImageSize,
    MessageActionChatCreate: MockActionChatCreate,
  },
}));

import {
  serializeDialog,
  serializeMessage,
  serializeSearchResult,
  serializeMember,
  bigIntToString,
  extractMediaInfo,
} from '../../src/lib/serialize.js';

// Helper to create a mock Dialog
function mockDialog(overrides: any = {}) {
  const defaults: any = {
    id: { toString: () => '12345' },
    title: 'Test Chat',
    name: 'Test Chat',
    unreadCount: 0,
    isUser: false,
    isGroup: false,
    isChannel: false,
    entity: {},
  };
  // Use Object.assign so explicit undefined values override defaults
  return { ...defaults, ...overrides };
}

// Helper to create a mock Message
function mockMessage(overrides: any = {}) {
  const defaults: any = {
    id: 1,
    message: 'Hello',
    date: 1710150900,
    entities: undefined,
    media: null,
    action: null,
    senderId: { toString: () => '99999' },
    replyTo: null,
    fwdFrom: null,
  };
  return { ...defaults, ...overrides };
}

describe('serializeDialog', () => {
  it('returns type "user" for user dialogs', () => {
    const dialog = mockDialog({ isUser: true });
    const result = serializeDialog(dialog as any);
    expect(result.type).toBe('user');
    expect(result.id).toBe('12345');
    expect(result.title).toBe('Test Chat');
  });

  it('returns type "group" for group dialogs', () => {
    const dialog = mockDialog({ isGroup: true });
    const result = serializeDialog(dialog as any);
    expect(result.type).toBe('group');
  });

  it('returns type "channel" for broadcast channel dialogs', () => {
    const dialog = mockDialog({
      isChannel: true,
      entity: { broadcast: true, megagroup: false, username: 'testchannel' },
    });
    const result = serializeDialog(dialog as any);
    expect(result.type).toBe('channel');
  });

  it('returns type "supergroup" for megagroup channel dialogs', () => {
    const dialog = mockDialog({
      isChannel: true,
      entity: { megagroup: true, broadcast: false, username: 'supergroup' },
    });
    const result = serializeDialog(dialog as any);
    expect(result.type).toBe('supergroup');
  });

  it('serializes BigInteger ID as string', () => {
    const bigId = { toString: () => '1001234567890' };
    const dialog = mockDialog({ id: bigId, isUser: true });
    const result = serializeDialog(dialog as any);
    expect(result.id).toBe('1001234567890');
    expect(typeof result.id).toBe('string');
  });

  it('returns null username when entity has no username', () => {
    const dialog = mockDialog({ isUser: true, entity: {} });
    const result = serializeDialog(dialog as any);
    expect(result.username).toBeNull();
  });

  it('extracts username from entity', () => {
    const dialog = mockDialog({ isUser: true, entity: { username: 'alice' } });
    const result = serializeDialog(dialog as any);
    expect(result.username).toBe('alice');
  });

  it('includes unreadCount', () => {
    const dialog = mockDialog({ isUser: true, unreadCount: 5 });
    const result = serializeDialog(dialog as any);
    expect(result.unreadCount).toBe(5);
  });

  it('uses title field, falling back to name', () => {
    const dialog = mockDialog({ isUser: true, title: undefined, name: 'Fallback Name' });
    const result = serializeDialog(dialog as any);
    expect(result.title).toBe('Fallback Name');
  });

  it('handles null id gracefully', () => {
    const dialog = mockDialog({ isUser: true, id: null });
    const result = serializeDialog(dialog as any);
    expect(result.id).toBe('');
  });
});

describe('serializeMessage', () => {
  it('returns correct basic fields for a text message', () => {
    const msg = mockMessage({ id: 42, message: 'Hello world' });
    const result = serializeMessage(msg as any);
    expect(result.id).toBe(42);
    expect(result.text).toBe('Hello world');
    expect(result.type).toBe('message');
    expect(result.senderId).toBe('99999');
  });

  it('converts date to ISO 8601 UTC string', () => {
    // 1710150900 = 2024-03-11T09:55:00.000Z
    const msg = mockMessage({ date: 1710150900 });
    const result = serializeMessage(msg as any);
    expect(result.date).toBe('2024-03-11T09:55:00.000Z');
  });

  it('converts message entities to Markdown', () => {
    const entities = [new MockBold({ offset: 0, length: 5 })];
    const msg = mockMessage({ message: 'Hello world', entities });
    const result = serializeMessage(msg as any);
    expect(result.text).toBe('**Hello** world');
  });

  it('includes senderName from senderEntity', () => {
    const msg = mockMessage();
    const sender = { firstName: 'Alice', lastName: 'Bob' };
    const result = serializeMessage(msg as any, sender as any);
    expect(result.senderName).toBe('Alice Bob');
  });

  it('uses firstName only when lastName missing', () => {
    const msg = mockMessage();
    const sender = { firstName: 'Alice' };
    const result = serializeMessage(msg as any, sender as any);
    expect(result.senderName).toBe('Alice');
  });

  it('includes replyToMsgId when message is a reply', () => {
    const msg = mockMessage({ replyTo: { replyToMsgId: 10 } });
    const result = serializeMessage(msg as any);
    expect(result.replyToMsgId).toBe(10);
  });

  it('returns null replyToMsgId when not a reply', () => {
    const msg = mockMessage();
    const result = serializeMessage(msg as any);
    expect(result.replyToMsgId).toBeNull();
  });

  it('detects photo media type', () => {
    const media = new MockMediaPhoto();
    const msg = mockMessage({ media });
    const result = serializeMessage(msg as any);
    expect(result.mediaType).toBe('photo');
  });

  it('detects video media type', () => {
    const media = new MockMediaDocument();
    (media as any).document = { attributes: [new MockAttrVideo()] };
    const msg = mockMessage({ media });
    const result = serializeMessage(msg as any);
    expect(result.mediaType).toBe('video');
  });

  it('detects voice media type', () => {
    const media = new MockMediaDocument();
    const audioAttr = new MockAttrAudio({ voice: true });
    (media as any).document = { attributes: [audioAttr] };
    const msg = mockMessage({ media });
    const result = serializeMessage(msg as any);
    expect(result.mediaType).toBe('voice');
  });

  it('detects sticker media type with emoji', () => {
    const media = new MockMediaDocument();
    const stickerAttr = new MockAttrSticker({ alt: '\u{1F600}' });
    (media as any).document = { attributes: [stickerAttr] };
    const msg = mockMessage({ media });
    const result = serializeMessage(msg as any);
    expect(result.mediaType).toBe('sticker');
    expect(result.emoji).toBe('\u{1F600}');
  });

  it('returns type "service" with actionText for service messages', () => {
    const action = new MockActionChatCreate();
    const msg = mockMessage({ action, message: '' });
    const result = serializeMessage(msg as any);
    expect(result.type).toBe('service');
    expect(result.actionText).toBeDefined();
  });

  it('returns null senderId when senderId is null', () => {
    const msg = mockMessage({ senderId: null });
    const result = serializeMessage(msg as any);
    expect(result.senderId).toBeNull();
  });

  it('handles forwardFrom info', () => {
    const msg = mockMessage({
      fwdFrom: { fromName: 'Forwarded User' },
    });
    const result = serializeMessage(msg as any);
    expect(result.forwardFrom).toBe('Forwarded User');
  });

  it('returns null forwardFrom when not forwarded', () => {
    const msg = mockMessage();
    const result = serializeMessage(msg as any);
    expect(result.forwardFrom).toBeNull();
  });

  it('uses caption as text for media messages', () => {
    const media = new MockMediaPhoto();
    const msg = mockMessage({ media, message: 'A nice photo caption' });
    const result = serializeMessage(msg as any);
    expect(result.text).toBe('A nice photo caption');
    expect(result.mediaType).toBe('photo');
  });
});

describe('serializeSearchResult', () => {
  it('includes chatId and chatTitle in addition to message fields', () => {
    const msg = mockMessage({ id: 10, message: 'search hit' });
    const result = serializeSearchResult(msg as any, '54321', 'Test Group');
    expect(result.id).toBe(10);
    expect(result.text).toBe('search hit');
    expect(result.chatId).toBe('54321');
    expect(result.chatTitle).toBe('Test Group');
  });
});

describe('serializeMember', () => {
  it('serializes a user entity to MemberItem', () => {
    const user = {
      id: { toString: () => '67890' },
      username: 'bobuser',
      firstName: 'Bob',
      lastName: 'Smith',
      bot: false,
      status: { className: 'UserStatusOnline' },
    };
    const result = serializeMember(user as any);
    expect(result.id).toBe('67890');
    expect(result.username).toBe('bobuser');
    expect(result.firstName).toBe('Bob');
    expect(result.lastName).toBe('Smith');
    expect(result.isBot).toBe(false);
  });

  it('handles null fields gracefully', () => {
    const user = {
      id: { toString: () => '11111' },
      username: null,
      firstName: null,
      lastName: null,
      bot: true,
      status: null,
    };
    const result = serializeMember(user as any);
    expect(result.id).toBe('11111');
    expect(result.username).toBeNull();
    expect(result.firstName).toBeNull();
    expect(result.lastName).toBeNull();
    expect(result.isBot).toBe(true);
    expect(result.status).toBeNull();
  });
});

describe('bigIntToString', () => {
  it('converts BigInteger-like object to string', () => {
    expect(bigIntToString({ toString: () => '9876543210' })).toBe('9876543210');
  });

  it('returns empty string for null/undefined', () => {
    expect(bigIntToString(null)).toBe('');
    expect(bigIntToString(undefined)).toBe('');
  });

  it('converts numbers to string', () => {
    expect(bigIntToString(12345)).toBe('12345');
  });
});

describe('extractMediaInfo', () => {
  it('returns null for null/undefined media', () => {
    expect(extractMediaInfo(null)).toBeNull();
    expect(extractMediaInfo(undefined)).toBeNull();
  });

  it('extracts info from MessageMediaPhoto', () => {
    const photo = new MockMediaPhoto();
    // Simulate photo.photo with sizes array (largest size has w, h, size)
    (photo as any).photo = {
      sizes: [
        { w: 320, h: 240, size: 5000, className: 'PhotoSize' },
        { w: 1920, h: 1080, size: 245760, className: 'PhotoSize' },
      ],
    };
    const info = extractMediaInfo(photo);
    expect(info).not.toBeNull();
    expect(info!.mimeType).toBe('image/jpeg');
    expect(info!.filename).toBeNull();
    expect(info!.width).toBe(1920);
    expect(info!.height).toBe(1080);
    expect(info!.fileSize).toBe(245760);
    expect(info!.duration).toBeNull();
  });

  it('extracts info from MessageMediaDocument with video attributes', () => {
    const media = new MockMediaDocument();
    (media as any).document = {
      size: BigInt(1234567),
      mimeType: 'video/mp4',
      attributes: [
        new MockAttrVideo({ w: 1280, h: 720, duration: 32 }),
        new MockAttrFilename({ fileName: 'clip.mp4' }),
      ],
    };
    const info = extractMediaInfo(media);
    expect(info).not.toBeNull();
    expect(info!.mimeType).toBe('video/mp4');
    expect(info!.filename).toBe('clip.mp4');
    expect(info!.width).toBe(1280);
    expect(info!.height).toBe(720);
    expect(info!.duration).toBe(32);
    expect(info!.fileSize).toBe(1234567);
  });

  it('extracts info from MessageMediaDocument with audio attributes', () => {
    const media = new MockMediaDocument();
    (media as any).document = {
      size: BigInt(98765),
      mimeType: 'audio/ogg',
      attributes: [
        new MockAttrAudio({ voice: true, duration: 15 }),
      ],
    };
    const info = extractMediaInfo(media);
    expect(info).not.toBeNull();
    expect(info!.duration).toBe(15);
    expect(info!.mimeType).toBe('audio/ogg');
    expect(info!.fileSize).toBe(98765);
  });

  it('returns null for unsupported media types', () => {
    const unknownMedia = { className: 'MessageMediaGeo' };
    expect(extractMediaInfo(unknownMedia)).toBeNull();
  });
});

describe('serializeMessage - media field', () => {
  it('includes media field for photo messages', () => {
    const media = new MockMediaPhoto();
    (media as any).photo = {
      sizes: [
        { w: 800, h: 600, size: 50000, className: 'PhotoSize' },
      ],
    };
    const msg = mockMessage({ media });
    const result = serializeMessage(msg as any);
    expect(result.mediaType).toBe('photo');
    expect(result.media).toBeDefined();
    expect(result.media!.mimeType).toBe('image/jpeg');
    expect(result.media!.width).toBe(800);
    expect(result.media!.height).toBe(600);
  });

  it('excludes media field for text-only messages (backward compatible)', () => {
    const msg = mockMessage({ media: null });
    const result = serializeMessage(msg as any);
    expect(result.mediaType).toBeNull();
    expect(result.media).toBeUndefined();
  });

  it('includes media field for document messages', () => {
    const media = new MockMediaDocument();
    (media as any).document = {
      size: BigInt(5000),
      mimeType: 'application/pdf',
      attributes: [
        new MockAttrFilename({ fileName: 'report.pdf' }),
      ],
    };
    const msg = mockMessage({ media });
    const result = serializeMessage(msg as any);
    expect(result.mediaType).toBe('document');
    expect(result.media).toBeDefined();
    expect(result.media!.filename).toBe('report.pdf');
    expect(result.media!.mimeType).toBe('application/pdf');
  });
});
