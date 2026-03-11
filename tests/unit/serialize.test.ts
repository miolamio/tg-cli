import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock classes for telegram Api
const {
  MockBold,
  MockMediaPhoto,
  MockMediaDocument,
  MockAttrSticker,
  MockAttrVideo,
  MockAttrAudio,
  MockActionChatCreate,
} = vi.hoisted(() => {
  class MockBold { offset: number; length: number; constructor(args: any) { this.offset = args.offset; this.length = args.length; } }
  class MockMediaPhoto {}
  class MockMediaDocument {}
  class MockAttrSticker { alt: string; constructor(a?: any) { this.alt = a?.alt ?? ''; } }
  class MockAttrVideo {}
  class MockAttrAudio { voice?: boolean; constructor(a?: any) { this.voice = a?.voice; } }
  class MockActionChatCreate {}
  return { MockBold, MockMediaPhoto, MockMediaDocument, MockAttrSticker, MockAttrVideo, MockAttrAudio, MockActionChatCreate };
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
    MessageActionChatCreate: MockActionChatCreate,
  },
}));

import {
  serializeDialog,
  serializeMessage,
  serializeSearchResult,
  serializeMember,
  bigIntToString,
} from '../../src/lib/serialize.js';

// Helper to create a mock Dialog
function mockDialog(overrides: any = {}) {
  return {
    id: overrides.id ?? { toString: () => '12345' },
    title: overrides.title ?? 'Test Chat',
    name: overrides.name ?? 'Test Chat',
    unreadCount: overrides.unreadCount ?? 0,
    isUser: overrides.isUser ?? false,
    isGroup: overrides.isGroup ?? false,
    isChannel: overrides.isChannel ?? false,
    entity: overrides.entity ?? {},
  };
}

// Helper to create a mock Message
function mockMessage(overrides: any = {}) {
  return {
    id: overrides.id ?? 1,
    message: overrides.message ?? 'Hello',
    date: overrides.date ?? 1710150900, // 2024-03-11T09:15:00Z
    entities: overrides.entities ?? undefined,
    media: overrides.media ?? null,
    action: overrides.action ?? null,
    senderId: overrides.senderId ?? { toString: () => '99999' },
    replyTo: overrides.replyTo ?? null,
    fwdFrom: overrides.fwdFrom ?? null,
  };
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
    const msg = mockMessage({ date: 1710150900 });
    const result = serializeMessage(msg as any);
    expect(result.date).toBe('2024-03-11T09:15:00.000Z');
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
