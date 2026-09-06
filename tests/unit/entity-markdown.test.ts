import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock telegram Api classes for entity type checking (instanceof)
const {
  MockBold, MockItalic, MockCode, MockPre, MockTextUrl, MockStrike,
  MockBlockquote, MockMentionName, MockSpoiler, MockUnderline, MockCustomEmoji,
} = vi.hoisted(() => {
  class MockBold { offset: number; length: number; constructor(args: any) { this.offset = args.offset; this.length = args.length; } }
  class MockItalic { offset: number; length: number; constructor(args: any) { this.offset = args.offset; this.length = args.length; } }
  class MockCode { offset: number; length: number; constructor(args: any) { this.offset = args.offset; this.length = args.length; } }
  class MockPre { offset: number; length: number; language: string; constructor(args: any) { this.offset = args.offset; this.length = args.length; this.language = args.language ?? ''; } }
  class MockTextUrl { offset: number; length: number; url: string; constructor(args: any) { this.offset = args.offset; this.length = args.length; this.url = args.url; } }
  class MockStrike { offset: number; length: number; constructor(args: any) { this.offset = args.offset; this.length = args.length; } }
  class MockBlockquote { offset: number; length: number; constructor(args: any) { this.offset = args.offset; this.length = args.length; } }
  class MockMentionName { offset: number; length: number; userId: number; constructor(args: any) { this.offset = args.offset; this.length = args.length; this.userId = args.userId; } }
  class MockSpoiler { offset: number; length: number; constructor(args: any) { this.offset = args.offset; this.length = args.length; } }
  class MockUnderline { offset: number; length: number; constructor(args: any) { this.offset = args.offset; this.length = args.length; } }
  class MockCustomEmoji { offset: number; length: number; documentId: string; constructor(args: any) { this.offset = args.offset; this.length = args.length; this.documentId = args.documentId; } }
  return {
    MockBold, MockItalic, MockCode, MockPre, MockTextUrl, MockStrike,
    MockBlockquote, MockMentionName, MockSpoiler, MockUnderline, MockCustomEmoji,
  };
});

vi.mock('telegram', () => ({
  Api: {
    MessageEntityBold: MockBold,
    MessageEntityItalic: MockItalic,
    MessageEntityCode: MockCode,
    MessageEntityPre: MockPre,
    MessageEntityTextUrl: MockTextUrl,
    MessageEntityStrike: MockStrike,
    MessageEntityBlockquote: MockBlockquote,
    MessageEntityMentionName: MockMentionName,
    MessageEntitySpoiler: MockSpoiler,
    MessageEntityUnderline: MockUnderline,
    MessageEntityCustomEmoji: MockCustomEmoji,
  },
}));

import { entitiesToMarkdown } from '../../src/lib/entity-to-markdown.js';

describe('entitiesToMarkdown', () => {
  it('returns text unchanged when entities is undefined', () => {
    const result = entitiesToMarkdown('Hello world', undefined);
    expect(result).toBe('Hello world');
  });

  it('returns text unchanged when entities array is empty', () => {
    const result = entitiesToMarkdown('Hello world', []);
    expect(result).toBe('Hello world');
  });

  it('converts bold entity to **text**', () => {
    const entities = [new MockBold({ offset: 0, length: 5 })];
    const result = entitiesToMarkdown('Hello world', entities as any);
    expect(result).toBe('**Hello** world');
  });

  it('converts italic entity to _text_', () => {
    const entities = [new MockItalic({ offset: 6, length: 5 })];
    const result = entitiesToMarkdown('Hello world', entities as any);
    expect(result).toBe('Hello _world_');
  });

  it('converts code entity to `text`', () => {
    const entities = [new MockCode({ offset: 4, length: 3 })];
    const result = entitiesToMarkdown('Use foo here', entities as any);
    expect(result).toBe('Use `foo` here');
  });

  it('converts pre entity to ```lang\\ntext\\n```', () => {
    const entities = [new MockPre({ offset: 0, length: 13, language: 'js' })];
    const result = entitiesToMarkdown('console.log()', entities as any);
    expect(result).toBe('```js\nconsole.log()\n```');
  });

  it('converts pre entity with no language', () => {
    const entities = [new MockPre({ offset: 0, length: 5, language: '' })];
    const result = entitiesToMarkdown('hello', entities as any);
    expect(result).toBe('```\nhello\n```');
  });

  it('converts text url entity to [text](url)', () => {
    const entities = [new MockTextUrl({ offset: 6, length: 4, url: 'https://example.com' })];
    const result = entitiesToMarkdown('Click here now', entities as any);
    expect(result).toBe('Click [here](https://example.com) now');
  });

  it('converts strikethrough entity to ~~text~~', () => {
    const entities = [new MockStrike({ offset: 0, length: 4 })];
    const result = entitiesToMarkdown('done task', entities as any);
    expect(result).toBe('~~done~~ task');
  });

  it('converts blockquote entity to > text', () => {
    const entities = [new MockBlockquote({ offset: 0, length: 12 })];
    const result = entitiesToMarkdown('quoted text.', entities as any);
    expect(result).toBe('> quoted text.');
  });

  it('converts multiline blockquote with > prefix on each line', () => {
    const entities = [new MockBlockquote({ offset: 0, length: 11 })];
    const result = entitiesToMarkdown('line1\nline2', entities as any);
    expect(result).toBe('> line1\n> line2');
  });

  it('converts mention name entity to [text](tg://user?id=ID)', () => {
    const entities = [new MockMentionName({ offset: 0, length: 4, userId: 12345 })];
    const result = entitiesToMarkdown('John said hi', entities as any);
    expect(result).toBe('[John](tg://user?id=12345) said hi');
  });

  it('handles multiple entities in same text (process from end to avoid offset shifts)', () => {
    const entities = [
      new MockBold({ offset: 0, length: 5 }),
      new MockItalic({ offset: 6, length: 5 }),
    ];
    const result = entitiesToMarkdown('Hello world', entities as any);
    expect(result).toBe('**Hello** _world_');
  });

  it('handles adjacent entities correctly', () => {
    const entities = [
      new MockBold({ offset: 0, length: 3 }),
      new MockItalic({ offset: 3, length: 3 }),
    ];
    const result = entitiesToMarkdown('abcdef', entities as any);
    expect(result).toBe('**abc**_def_');
  });

  it('converts spoiler entity to ||text||', () => {
    const entities = [new MockSpoiler({ offset: 0, length: 6 })];
    const result = entitiesToMarkdown('secret revealed', entities as any);
    expect(result).toBe('||secret|| revealed');
  });

  it('converts underline entity to <u>text</u>', () => {
    const entities = [new MockUnderline({ offset: 0, length: 4 })];
    const result = entitiesToMarkdown('note this', entities as any);
    expect(result).toBe('<u>note</u> this');
  });

  it('converts custom emoji to a tg://emoji markdown image', () => {
    const entities = [new MockCustomEmoji({ offset: 0, length: 2, documentId: '99' })];
    const result = entitiesToMarkdown('👋 hi', entities as any);
    expect(result).toBe('![👋](tg://emoji?id=99) hi');
  });
});
