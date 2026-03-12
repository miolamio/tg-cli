import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Serialization & Format Tests (Task 1) ----

describe('serializeTopic', () => {
  // Dynamic import to allow mock setup
  let serializeTopic: typeof import('../../src/lib/serialize.js').serializeTopic;

  beforeEach(async () => {
    const mod = await import('../../src/lib/serialize.js');
    serializeTopic = mod.serializeTopic;
  });

  it('converts a full gramjs ForumTopic to TopicItem', () => {
    const topic = {
      id: 42,
      title: 'General Discussion',
      iconEmojiId: BigInt('12345678901234'),
      date: 1700000000, // Unix timestamp
      fromId: { userId: BigInt(999) },
      topMessage: 150,
      closed: false,
      pinned: true,
    };

    const result = serializeTopic(topic);

    expect(result.id).toBe(42);
    expect(result.title).toBe('General Discussion');
    expect(result.iconEmoji).toBe('12345678901234');
    expect(result.creationDate).toBe(new Date(1700000000 * 1000).toISOString());
    expect(result.creatorId).toBe('999');
    expect(result.messageCount).toBe(150);
    expect(result.isClosed).toBe(false);
    expect(result.isPinned).toBe(true);
  });

  it('handles null iconEmojiId gracefully', () => {
    const topic = {
      id: 10,
      title: 'No Icon',
      iconEmojiId: null,
      date: 1700000000,
      fromId: { userId: BigInt(1) },
      topMessage: 5,
      closed: false,
      pinned: false,
    };

    const result = serializeTopic(topic);
    expect(result.iconEmoji).toBeNull();
  });

  it('handles undefined iconEmojiId gracefully', () => {
    const topic = {
      id: 11,
      title: 'Undefined Icon',
      date: 1700000000,
      fromId: { userId: BigInt(1) },
      topMessage: 5,
      closed: false,
      pinned: false,
    };

    const result = serializeTopic(topic);
    expect(result.iconEmoji).toBeNull();
  });

  it('handles fromId with channelId', () => {
    const topic = {
      id: 20,
      title: 'Channel Topic',
      iconEmojiId: null,
      date: 1700000000,
      fromId: { channelId: BigInt(500) },
      topMessage: 10,
      closed: true,
      pinned: false,
    };

    const result = serializeTopic(topic);
    expect(result.creatorId).toBe('500');
    expect(result.isClosed).toBe(true);
  });

  it('handles fromId with chatId', () => {
    const topic = {
      id: 30,
      title: 'Chat Topic',
      iconEmojiId: null,
      date: 1700000000,
      fromId: { chatId: BigInt(300) },
      topMessage: 8,
      closed: false,
      pinned: true,
    };

    const result = serializeTopic(topic);
    expect(result.creatorId).toBe('300');
  });

  it('handles missing fromId', () => {
    const topic = {
      id: 40,
      title: 'No Creator',
      iconEmojiId: null,
      date: 1700000000,
      fromId: null,
      topMessage: 1,
      closed: false,
      pinned: false,
    };

    const result = serializeTopic(topic);
    expect(result.creatorId).toBe('');
  });
});

describe('formatTopics', () => {
  let formatTopics: typeof import('../../src/lib/format.js').formatTopics;

  beforeEach(async () => {
    const mod = await import('../../src/lib/format.js');
    formatTopics = mod.formatTopics;
  });

  it('renders topics with pinned and closed indicators', () => {
    const topics = [
      { id: 42, title: 'General', iconEmoji: null, creationDate: '2023-11-14T22:13:20.000Z', creatorId: '1', messageCount: 100, isClosed: false, isPinned: true },
      { id: 43, title: 'Off Topic', iconEmoji: null, creationDate: '2023-11-14T22:13:20.000Z', creatorId: '2', messageCount: 50, isClosed: true, isPinned: false },
      { id: 44, title: 'Normal Topic', iconEmoji: null, creationDate: '2023-11-14T22:13:20.000Z', creatorId: '3', messageCount: 10, isClosed: false, isPinned: false },
    ];

    const result = formatTopics(topics);

    expect(result).toContain('42');
    expect(result).toContain('General');
    expect(result).toContain('[pinned]');
    expect(result).toContain('43');
    expect(result).toContain('Off Topic');
    expect(result).toContain('[closed]');
    expect(result).toContain('44');
    expect(result).toContain('Normal Topic');
  });

  it('returns empty string for empty topics array', () => {
    const result = formatTopics([]);
    expect(result).toBe('');
  });
});

describe('formatData topics dispatch', () => {
  let formatData: typeof import('../../src/lib/format.js').formatData;

  beforeEach(async () => {
    const mod = await import('../../src/lib/format.js');
    formatData = mod.formatData;
  });

  it('dispatches topics[] array to formatTopics', () => {
    const data = {
      topics: [
        { id: 1, title: 'Topic 1', iconEmoji: null, creationDate: '2023-11-14T22:13:20.000Z', creatorId: '1', messageCount: 5, isClosed: false, isPinned: false },
      ],
      total: 1,
    };

    const result = formatData(data);
    // Should contain topic data, not JSON
    expect(result).toContain('Topic 1');
    expect(result).not.toContain('"ok"');
  });

  it('returns "No topics." for empty topics array', () => {
    const data = { topics: [], total: 0 };
    const result = formatData(data);
    expect(result).toBe('No topics.');
  });
});
