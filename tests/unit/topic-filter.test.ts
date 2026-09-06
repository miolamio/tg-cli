import { describe, it, expect } from 'vitest';
import { messageMatchesTopic } from '../../src/lib/daemon/topic-filter.js';

describe('messageMatchesTopic', () => {
  it('always passes the topic-root message', () => {
    expect(messageMatchesTopic({ id: 9 }, 9)).toBe(true);
    expect(messageMatchesTopic({ id: 1 }, 1)).toBe(true);
  });

  it('passes General unthreaded and General replies (no forumTopic flag)', () => {
    expect(messageMatchesTopic({ id: 8, message: 'hi' }, 1)).toBe(true);
    expect(messageMatchesTopic({
      id: 12,
      replyTo: { replyToMsgId: 8 },
    }, 1)).toBe(true);
  });

  it('drops named-topic messages when watching General', () => {
    expect(messageMatchesTopic({
      id: 20,
      replyTo: { forumTopic: true, replyToTopId: 9, replyToMsgId: 15 },
    }, 1)).toBe(false);
  });

  it('passes named-topic messages and nested replies for that topic', () => {
    expect(messageMatchesTopic({
      id: 20,
      replyTo: { forumTopic: true, replyToTopId: 9, replyToMsgId: 15 },
    }, 9)).toBe(true);
    expect(messageMatchesTopic({
      id: 21,
      replyTo: { forumTopic: true, replyToMsgId: 9 },
    }, 9)).toBe(true);
  });

  it('drops General and other topics when watching a named topic', () => {
    expect(messageMatchesTopic({ id: 8 }, 9)).toBe(false);
    expect(messageMatchesTopic({
      id: 12,
      replyTo: { replyToMsgId: 8 },
    }, 9)).toBe(false);
    expect(messageMatchesTopic({
      id: 30,
      replyTo: { forumTopic: true, replyToTopId: 4 },
    }, 9)).toBe(false);
  });
});
