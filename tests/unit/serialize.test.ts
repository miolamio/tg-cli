import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock classes for telegram Api
const {
  MockBold,
  MockMediaPhoto,
  MockMediaDocument,
  MockMediaPoll,
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
  class MockMediaPoll {}
  class MockAttrSticker { alt: string; constructor(a?: any) { this.alt = a?.alt ?? ''; } }
  class MockAttrVideo { w?: number; h?: number; duration?: number; constructor(a?: any) { this.w = a?.w; this.h = a?.h; this.duration = a?.duration; } }
  class MockAttrAudio { voice?: boolean; duration?: number; constructor(a?: any) { this.voice = a?.voice; this.duration = a?.duration; } }
  class MockAttrFilename { fileName: string; constructor(a?: any) { this.fileName = a?.fileName ?? ''; } }
  class MockAttrImageSize { w: number; h: number; constructor(a?: any) { this.w = a?.w ?? 0; this.h = a?.h ?? 0; } }
  class MockActionChatCreate {}
  return { MockBold, MockMediaPhoto, MockMediaDocument, MockMediaPoll, MockAttrSticker, MockAttrVideo, MockAttrAudio, MockAttrFilename, MockAttrImageSize, MockActionChatCreate };
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
    MessageMediaPoll: MockMediaPoll,
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
  extractPollData,
  detectMedia,
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

  it('handles gramjs BigInteger-like size values via toJSNumber()', () => {
    const bigIntLike = { toJSNumber: () => 9876543210 };
    const media = new MockMediaDocument();
    (media as any).document = {
      size: bigIntLike,
      mimeType: 'application/pdf',
      attributes: [
        new MockAttrFilename({ fileName: 'large.pdf' }),
      ],
    };
    const info = extractMediaInfo(media);
    expect(info).not.toBeNull();
    expect(info!.fileSize).toBe(9876543210);
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

// Helper to create a mock MessageMediaPoll instance
function mockPollMedia(overrides: any = {}) {
  const defaults = {
    poll: {
      question: { text: 'Favorite color?' },
      answers: [
        { text: { text: 'Red' }, option: Buffer.from('0') },
        { text: { text: 'Blue' }, option: Buffer.from('1') },
        { text: { text: 'Green' }, option: Buffer.from('2') },
      ],
      quiz: false,
      publicVoters: false,
      multipleChoice: false,
      closed: false,
      closePeriod: undefined,
      closeDate: undefined,
    },
    results: {
      results: [],
      totalVoters: 0,
      solution: undefined,
    },
  };

  const merged = {
    poll: { ...defaults.poll, ...overrides.poll },
    results: { ...defaults.results, ...overrides.results },
  };

  // Merge answers if provided
  if (overrides.poll?.answers) {
    merged.poll.answers = overrides.poll.answers;
  }

  return Object.assign(new MockMediaPoll(), merged);
}

describe('extractPollData', () => {
  it('returns null for non-MessageMediaPoll media', () => {
    const photo = new MockMediaPhoto();
    expect(extractPollData(photo)).toBeNull();
    expect(extractPollData(null)).toBeNull();
    expect(extractPollData(undefined)).toBeNull();
  });

  it('extracts basic poll with question and options', () => {
    const media = mockPollMedia();
    const result = extractPollData(media);
    expect(result).not.toBeNull();
    expect(result!.question).toBe('Favorite color?');
    expect(result!.options).toHaveLength(3);
    expect(result!.options[0]).toEqual({ text: 'Red', voters: 0, chosen: false, correct: false });
    expect(result!.options[1]).toEqual({ text: 'Blue', voters: 0, chosen: false, correct: false });
    expect(result!.options[2]).toEqual({ text: 'Green', voters: 0, chosen: false, correct: false });
    expect(result!.isQuiz).toBe(false);
    expect(result!.isPublic).toBe(false);
    expect(result!.isMultiple).toBe(false);
    expect(result!.isClosed).toBe(false);
    expect(result!.totalVoters).toBe(0);
    expect(result!.correctOption).toBeNull();
    expect(result!.solution).toBeNull();
  });

  it('extracts poll with votes matched to options via option bytes', () => {
    const media = mockPollMedia({
      results: {
        results: [
          { option: Buffer.from('0'), voters: 5, chosen: false, correct: false },
          { option: Buffer.from('1'), voters: 3, chosen: true, correct: false },
          { option: Buffer.from('2'), voters: 1, chosen: false, correct: false },
        ],
        totalVoters: 9,
      },
    });
    const result = extractPollData(media);
    expect(result!.options[0].voters).toBe(5);
    expect(result!.options[0].chosen).toBe(false);
    expect(result!.options[1].voters).toBe(3);
    expect(result!.options[1].chosen).toBe(true);
    expect(result!.options[2].voters).toBe(1);
    expect(result!.totalVoters).toBe(9);
  });

  it('extracts quiz poll with correctOption as 1-based index', () => {
    const media = mockPollMedia({
      poll: {
        question: { text: 'Capital of France?' },
        answers: [
          { text: { text: 'London' }, option: Buffer.from('0') },
          { text: { text: 'Paris' }, option: Buffer.from('1') },
          { text: { text: 'Berlin' }, option: Buffer.from('2') },
        ],
        quiz: true,
        publicVoters: false,
        multipleChoice: false,
        closed: false,
      },
      results: {
        results: [
          { option: Buffer.from('0'), voters: 2, chosen: false, correct: false },
          { option: Buffer.from('1'), voters: 8, chosen: true, correct: true },
          { option: Buffer.from('2'), voters: 1, chosen: false, correct: false },
        ],
        totalVoters: 11,
        solution: 'Paris is the capital of France',
      },
    });
    const result = extractPollData(media);
    expect(result!.isQuiz).toBe(true);
    expect(result!.correctOption).toBe(2); // 1-based: option index 1 -> position 2
    expect(result!.options[1].correct).toBe(true);
    expect(result!.solution).toBe('Paris is the capital of France');
  });

  it('extracts closed poll with closePeriod and closeDate', () => {
    const closeTimestamp = 1710200000; // Unix timestamp
    const media = mockPollMedia({
      poll: {
        question: { text: 'Quick poll' },
        answers: [
          { text: { text: 'Yes' }, option: Buffer.from('0') },
          { text: { text: 'No' }, option: Buffer.from('1') },
        ],
        quiz: false,
        publicVoters: false,
        multipleChoice: false,
        closed: true,
        closePeriod: 60,
        closeDate: closeTimestamp,
      },
      results: {
        results: [],
        totalVoters: 5,
      },
    });
    const result = extractPollData(media);
    expect(result!.isClosed).toBe(true);
    expect(result!.closePeriod).toBe(60);
    expect(result!.closeDate).toBe(new Date(closeTimestamp * 1000).toISOString());
    expect(result!.totalVoters).toBe(5);
  });

  it('extracts public and multiple-choice flags', () => {
    const media = mockPollMedia({
      poll: {
        question: { text: 'Multi poll' },
        answers: [
          { text: { text: 'A' }, option: Buffer.from('0') },
          { text: { text: 'B' }, option: Buffer.from('1') },
        ],
        quiz: false,
        publicVoters: true,
        multipleChoice: true,
        closed: false,
      },
    });
    const result = extractPollData(media);
    expect(result!.isPublic).toBe(true);
    expect(result!.isMultiple).toBe(true);
  });

  it('handles missing results gracefully', () => {
    const media = Object.assign(new MockMediaPoll(), {
      poll: {
        question: { text: 'New poll' },
        answers: [
          { text: { text: 'Yes' }, option: Buffer.from('0') },
          { text: { text: 'No' }, option: Buffer.from('1') },
        ],
        quiz: false,
        publicVoters: false,
        multipleChoice: false,
        closed: false,
      },
      results: null,
    });
    const result = extractPollData(media);
    expect(result).not.toBeNull();
    expect(result!.options[0].voters).toBe(0);
    expect(result!.totalVoters).toBe(0);
  });
});

describe('serializeMessage - poll field', () => {
  it('populates poll field when message contains a poll', () => {
    const media = mockPollMedia();
    const msg = mockMessage({ media });
    const result = serializeMessage(msg as any);
    expect(result.mediaType).toBe('poll');
    expect(result.poll).toBeDefined();
    expect(result.poll!.question).toBe('Favorite color?');
    expect(result.poll!.options).toHaveLength(3);
  });

  it('does not include poll field for non-poll messages', () => {
    const msg = mockMessage({ media: null });
    const result = serializeMessage(msg as any);
    expect(result.poll).toBeUndefined();
  });
});

describe('detectMedia - poll', () => {
  it('returns mediaType "poll" for MessageMediaPoll', () => {
    const media = new MockMediaPoll();
    expect(detectMedia(media).mediaType).toBe('poll');
  });
});
