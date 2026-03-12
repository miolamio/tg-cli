import { describe, it, expect, vi } from 'vitest';

// Mock telegram Api for FILTER_MAP factory functions
const {
  MockFilterPhotos,
  MockFilterVideo,
  MockFilterPhotoVideo,
  MockFilterDocument,
  MockFilterUrl,
  MockFilterGif,
  MockFilterVoice,
  MockFilterMusic,
  MockFilterRoundVideo,
  MockFilterRoundVoice,
  MockFilterChatPhotos,
  MockFilterPhoneCalls,
  MockFilterMyMentions,
  MockFilterGeo,
  MockFilterContacts,
  MockFilterPinned,
} = vi.hoisted(() => {
  class MockFilterPhotos {}
  class MockFilterVideo {}
  class MockFilterPhotoVideo {}
  class MockFilterDocument {}
  class MockFilterUrl {}
  class MockFilterGif {}
  class MockFilterVoice {}
  class MockFilterMusic {}
  class MockFilterRoundVideo {}
  class MockFilterRoundVoice {}
  class MockFilterChatPhotos {}
  class MockFilterPhoneCalls {}
  class MockFilterMyMentions {}
  class MockFilterGeo {}
  class MockFilterContacts {}
  class MockFilterPinned {}
  return {
    MockFilterPhotos,
    MockFilterVideo,
    MockFilterPhotoVideo,
    MockFilterDocument,
    MockFilterUrl,
    MockFilterGif,
    MockFilterVoice,
    MockFilterMusic,
    MockFilterRoundVideo,
    MockFilterRoundVoice,
    MockFilterChatPhotos,
    MockFilterPhoneCalls,
    MockFilterMyMentions,
    MockFilterGeo,
    MockFilterContacts,
    MockFilterPinned,
  };
});

vi.mock('telegram', () => ({
  Api: {
    InputMessagesFilterPhotos: MockFilterPhotos,
    InputMessagesFilterVideo: MockFilterVideo,
    InputMessagesFilterPhotoVideo: MockFilterPhotoVideo,
    InputMessagesFilterDocument: MockFilterDocument,
    InputMessagesFilterUrl: MockFilterUrl,
    InputMessagesFilterGif: MockFilterGif,
    InputMessagesFilterVoice: MockFilterVoice,
    InputMessagesFilterMusic: MockFilterMusic,
    InputMessagesFilterRoundVideo: MockFilterRoundVideo,
    InputMessagesFilterRoundVoice: MockFilterRoundVoice,
    InputMessagesFilterChatPhotos: MockFilterChatPhotos,
    InputMessagesFilterPhoneCalls: MockFilterPhoneCalls,
    InputMessagesFilterMyMentions: MockFilterMyMentions,
    InputMessagesFilterGeo: MockFilterGeo,
    InputMessagesFilterContacts: MockFilterContacts,
    InputMessagesFilterPinned: MockFilterPinned,
  },
}));

import {
  FILTER_MAP,
  VALID_FILTERS,
  generateFilename,
  detectFileType,
  formatBytes,
} from '../../src/lib/media-utils.js';

describe('FILTER_MAP', () => {
  it('has all 16 MTProto search filters', () => {
    expect(Object.keys(FILTER_MAP)).toHaveLength(16);
  });

  it('contains all expected filter names', () => {
    const expected = [
      'photos', 'videos', 'photo_video', 'documents', 'urls', 'gifs',
      'voice', 'music', 'round', 'round_voice', 'chat_photos',
      'phone_calls', 'mentions', 'geo', 'contacts', 'pinned',
    ];
    for (const name of expected) {
      expect(FILTER_MAP).toHaveProperty(name);
    }
  });

  it('each value is a factory function returning a filter instance', () => {
    expect(FILTER_MAP.photos()).toBeInstanceOf(MockFilterPhotos);
    expect(FILTER_MAP.videos()).toBeInstanceOf(MockFilterVideo);
    expect(FILTER_MAP.photo_video()).toBeInstanceOf(MockFilterPhotoVideo);
    expect(FILTER_MAP.documents()).toBeInstanceOf(MockFilterDocument);
    expect(FILTER_MAP.urls()).toBeInstanceOf(MockFilterUrl);
    expect(FILTER_MAP.gifs()).toBeInstanceOf(MockFilterGif);
    expect(FILTER_MAP.voice()).toBeInstanceOf(MockFilterVoice);
    expect(FILTER_MAP.music()).toBeInstanceOf(MockFilterMusic);
    expect(FILTER_MAP.round()).toBeInstanceOf(MockFilterRoundVideo);
    expect(FILTER_MAP.round_voice()).toBeInstanceOf(MockFilterRoundVoice);
    expect(FILTER_MAP.chat_photos()).toBeInstanceOf(MockFilterChatPhotos);
    expect(FILTER_MAP.phone_calls()).toBeInstanceOf(MockFilterPhoneCalls);
    expect(FILTER_MAP.mentions()).toBeInstanceOf(MockFilterMyMentions);
    expect(FILTER_MAP.geo()).toBeInstanceOf(MockFilterGeo);
    expect(FILTER_MAP.contacts()).toBeInstanceOf(MockFilterContacts);
    expect(FILTER_MAP.pinned()).toBeInstanceOf(MockFilterPinned);
  });

  it('factory functions create fresh instances each call', () => {
    const a = FILTER_MAP.photos();
    const b = FILTER_MAP.photos();
    expect(a).not.toBe(b);
  });
});

describe('VALID_FILTERS', () => {
  it('matches Object.keys(FILTER_MAP)', () => {
    expect(VALID_FILTERS).toEqual(Object.keys(FILTER_MAP));
  });
});

describe('generateFilename', () => {
  it('generates filename with jpeg extension for image/jpeg', () => {
    expect(generateFilename('photo', 12345, 'image/jpeg')).toBe('photo_12345.jpg');
  });

  it('generates filename with mp4 extension for video/mp4', () => {
    expect(generateFilename('video', 99, 'video/mp4')).toBe('video_99.mp4');
  });

  it('generates filename with png extension for image/png', () => {
    expect(generateFilename('photo', 1, 'image/png')).toBe('photo_1.png');
  });

  it('generates filename with ogg extension for audio/ogg', () => {
    expect(generateFilename('voice', 5, 'audio/ogg')).toBe('voice_5.ogg');
  });

  it('generates filename with mp3 extension for audio/mpeg', () => {
    expect(generateFilename('audio', 7, 'audio/mpeg')).toBe('audio_7.mp3');
  });

  it('falls back to .bin for null mimeType', () => {
    expect(generateFilename('document', 1, null)).toBe('document_1.bin');
  });

  it('falls back to .bin for unknown mimeType', () => {
    expect(generateFilename('document', 2, 'application/octet-stream')).toBe('document_2.bin');
  });
});

describe('detectFileType', () => {
  it('returns photo for .jpg', () => {
    expect(detectFileType('.jpg')).toBe('photo');
  });

  it('returns photo for .jpeg', () => {
    expect(detectFileType('.jpeg')).toBe('photo');
  });

  it('returns photo for .png', () => {
    expect(detectFileType('.png')).toBe('photo');
  });

  it('returns photo for .gif', () => {
    expect(detectFileType('.gif')).toBe('photo');
  });

  it('returns photo for .bmp', () => {
    expect(detectFileType('.bmp')).toBe('photo');
  });

  it('returns photo for .webp', () => {
    expect(detectFileType('.webp')).toBe('photo');
  });

  it('returns video for .mp4', () => {
    expect(detectFileType('.mp4')).toBe('video');
  });

  it('returns video for .mov', () => {
    expect(detectFileType('.mov')).toBe('video');
  });

  it('returns video for .avi', () => {
    expect(detectFileType('.avi')).toBe('video');
  });

  it('returns video for .mkv', () => {
    expect(detectFileType('.mkv')).toBe('video');
  });

  it('returns video for .webm', () => {
    expect(detectFileType('.webm')).toBe('video');
  });

  it('returns voice for .ogg', () => {
    expect(detectFileType('.ogg')).toBe('voice');
  });

  it('returns voice for .opus', () => {
    expect(detectFileType('.opus')).toBe('voice');
  });

  it('returns document for .pdf', () => {
    expect(detectFileType('.pdf')).toBe('document');
  });

  it('returns document for .txt', () => {
    expect(detectFileType('.txt')).toBe('document');
  });

  it('returns document for unknown extension', () => {
    expect(detectFileType('.xyz')).toBe('document');
  });
});

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0B');
  });

  it('formats bytes under 1024', () => {
    expect(formatBytes(500)).toBe('500B');
  });

  it('formats exactly 1024 as 1KB', () => {
    expect(formatBytes(1024)).toBe('1KB');
  });

  it('formats KB with rounding', () => {
    expect(formatBytes(1536)).toBe('2KB');
  });

  it('formats MB with one decimal', () => {
    expect(formatBytes(1258291)).toBe('1.2MB');
  });

  it('formats GB with one decimal', () => {
    expect(formatBytes(1073741824)).toBe('1.0GB');
  });
});
