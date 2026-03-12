import { describe, it, expect } from 'vitest';
import {
  formatMessages,
  formatChatList,
  formatChatInfo,
  formatMembers,
  formatSearchResults,
  formatGeneric,
  formatData,
} from '../../src/lib/format.js';
import type {
  MessageItem,
  ChatListItem,
  ChatInfo,
  MemberItem,
  SearchResultItem,
} from '../../src/lib/types.js';

describe('formatMessages', () => {
  it('renders timestamp + sender + text', () => {
    const messages: MessageItem[] = [
      {
        id: 1,
        text: 'Hello world',
        date: '2026-03-11T12:30:00.000Z',
        senderId: '123',
        senderName: 'Alice',
        replyToMsgId: null,
        forwardFrom: null,
        mediaType: null,
        type: 'message',
      },
    ];
    const result = formatMessages(messages);
    // Should contain the sender name and message text
    expect(result).toContain('Alice');
    expect(result).toContain('Hello world');
    // Should contain a timestamp pattern (YYYY-MM-DD HH:MM)
    expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  });

  it('shows reply annotation when replyToMsgId is set', () => {
    const messages: MessageItem[] = [
      {
        id: 2,
        text: 'Thanks!',
        date: '2026-03-11T12:31:00.000Z',
        senderId: '456',
        senderName: 'Bob',
        replyToMsgId: 42,
        forwardFrom: null,
        mediaType: null,
        type: 'message',
      },
    ];
    const result = formatMessages(messages);
    expect(result).toContain('reply to 42');
    expect(result).toContain('Bob');
    expect(result).toContain('Thanks!');
  });

  it('shows media tag when mediaType is set', () => {
    const messages: MessageItem[] = [
      {
        id: 3,
        text: 'Check this out',
        date: '2026-03-11T12:32:00.000Z',
        senderId: '123',
        senderName: 'Alice',
        replyToMsgId: null,
        forwardFrom: null,
        mediaType: 'photo',
        type: 'message',
      },
    ];
    const result = formatMessages(messages);
    expect(result).toContain('[photo]');
    expect(result).toContain('Alice');
  });

  it('handles empty array', () => {
    const result = formatMessages([]);
    expect(result).toBe('');
  });

  it('uses "Unknown" for null sender name', () => {
    const messages: MessageItem[] = [
      {
        id: 4,
        text: 'Mystery message',
        date: '2026-03-11T12:33:00.000Z',
        senderId: null,
        senderName: null,
        replyToMsgId: null,
        forwardFrom: null,
        mediaType: null,
        type: 'message',
      },
    ];
    const result = formatMessages(messages);
    expect(result).toContain('Unknown');
    expect(result).toContain('Mystery message');
  });
});

describe('formatChatList', () => {
  it('renders type + title + username + unread', () => {
    const chats: ChatListItem[] = [
      { id: '1', title: 'Dev Group', type: 'supergroup', username: 'devs', unreadCount: 5 },
    ];
    const result = formatChatList(chats);
    expect(result).toContain('supergroup');
    expect(result).toContain('Dev Group');
    expect(result).toContain('@devs');
    expect(result).toContain('5 unread');
  });

  it('handles missing username and zero unread', () => {
    const chats: ChatListItem[] = [
      { id: '2', title: 'Private Chat', type: 'user', username: null, unreadCount: 0 },
    ];
    const result = formatChatList(chats);
    expect(result).toContain('user');
    expect(result).toContain('Private Chat');
    expect(result).not.toContain('unread');
    expect(result).not.toContain('@');
  });

  it('handles empty array', () => {
    const result = formatChatList([]);
    expect(result).toBe('');
  });
});

describe('formatChatInfo', () => {
  it('renders key-value pairs with labels', () => {
    const info: ChatInfo = {
      id: '1',
      title: 'My Channel',
      type: 'channel',
      username: 'mychan',
      description: 'A test channel',
      memberCount: 1234,
      creationDate: '2025-01-01',
      photo: null,
      linkedChatId: null,
      slowmodeSeconds: null,
      permissions: null,
      inviteLink: null,
      migratedFrom: null,
    };
    const result = formatChatInfo(info);
    expect(result).toContain('Title');
    expect(result).toContain('My Channel');
    expect(result).toContain('Type');
    expect(result).toContain('channel');
    expect(result).toContain('Username');
    expect(result).toContain('@mychan');
    expect(result).toContain('Description');
    expect(result).toContain('A test channel');
    expect(result).toContain('Members');
    expect(result).toContain('1,234');
  });

  it('skips null fields', () => {
    const info: ChatInfo = {
      id: '1',
      title: 'Minimal',
      type: 'group',
      username: null,
      description: null,
      memberCount: null,
      creationDate: null,
      photo: null,
      linkedChatId: null,
      slowmodeSeconds: null,
      permissions: null,
      inviteLink: null,
      migratedFrom: null,
    };
    const result = formatChatInfo(info);
    expect(result).toContain('Title');
    expect(result).toContain('Type');
    expect(result).not.toContain('Username');
    expect(result).not.toContain('Description');
    expect(result).not.toContain('Members');
  });
});

describe('formatMembers', () => {
  it('renders name + username + bot tag', () => {
    const members: MemberItem[] = [
      { id: '1', username: 'alice', firstName: 'Alice', lastName: null, isBot: false, status: null },
      { id: '2', username: 'mybot', firstName: 'My Bot', lastName: null, isBot: true, status: null },
    ];
    const result = formatMembers(members);
    expect(result).toContain('Alice');
    expect(result).toContain('@alice');
    expect(result).toContain('My Bot');
    expect(result).toContain('@mybot');
    expect(result).toContain('[bot]');
  });

  it('handles missing username', () => {
    const members: MemberItem[] = [
      { id: '3', username: null, firstName: 'NoUsername', lastName: 'User', isBot: false, status: null },
    ];
    const result = formatMembers(members);
    expect(result).toContain('NoUsername');
    expect(result).not.toContain('@');
  });

  it('handles empty array', () => {
    const result = formatMembers([]);
    expect(result).toBe('');
  });
});

describe('formatSearchResults', () => {
  it('groups messages by chat title', () => {
    const results: SearchResultItem[] = [
      {
        id: 1, text: 'found this', date: '2026-03-11T12:30:00.000Z',
        senderId: '123', senderName: 'Alice', replyToMsgId: null,
        forwardFrom: null, mediaType: null, type: 'message',
        chatId: '100', chatTitle: 'Dev Group',
      },
      {
        id: 2, text: 'also here', date: '2026-03-11T12:35:00.000Z',
        senderId: '456', senderName: 'Bob', replyToMsgId: null,
        forwardFrom: null, mediaType: null, type: 'message',
        chatId: '200', chatTitle: 'General Chat',
      },
    ];
    const result = formatSearchResults(results);
    expect(result).toContain('Dev Group');
    expect(result).toContain('found this');
    expect(result).toContain('General Chat');
    expect(result).toContain('also here');
  });

  it('handles empty array', () => {
    const result = formatSearchResults([]);
    expect(result).toBe('');
  });
});

describe('formatGeneric', () => {
  it('pretty-prints objects as indented JSON', () => {
    const result = formatGeneric({ key: 'value', num: 42 });
    expect(result).toContain('"key"');
    expect(result).toContain('"value"');
    expect(result).toContain('42');
    // Should be indented (multi-line)
    expect(result).toContain('\n');
  });
});

describe('formatData', () => {
  it('auto-detects message shape and dispatches to formatMessages', () => {
    const data = {
      messages: [
        {
          id: 1, text: 'Hello', date: '2026-03-11T12:30:00.000Z',
          senderId: '123', senderName: 'Alice', replyToMsgId: null,
          forwardFrom: null, mediaType: null, type: 'message',
        },
      ],
      total: 1,
    };
    const result = formatData(data);
    expect(result).toContain('Alice');
    expect(result).toContain('Hello');
  });

  it('auto-detects chat list shape', () => {
    const data = {
      chats: [
        { id: '1', title: 'Test', type: 'group', username: null, unreadCount: 0 },
      ],
      total: 1,
    };
    const result = formatData(data);
    expect(result).toContain('group');
    expect(result).toContain('Test');
  });

  it('auto-detects ChatInfo shape', () => {
    const data: ChatInfo = {
      id: '1', title: 'InfoTest', type: 'channel', username: 'test',
      description: null, memberCount: 100, creationDate: null,
      photo: null, linkedChatId: null, slowmodeSeconds: null,
      permissions: null, inviteLink: null, migratedFrom: null,
    };
    const result = formatData(data);
    expect(result).toContain('InfoTest');
    expect(result).toContain('channel');
  });

  it('auto-detects members shape', () => {
    const data = {
      members: [
        { id: '1', username: 'alice', firstName: 'Alice', lastName: null, isBot: false, status: null },
      ],
      total: 1,
    };
    const result = formatData(data);
    expect(result).toContain('Alice');
    expect(result).toContain('@alice');
  });

  it('auto-detects search results shape (messages with chatTitle)', () => {
    const data = {
      messages: [
        {
          id: 1, text: 'found', date: '2026-03-11T12:30:00.000Z',
          senderId: '123', senderName: 'Alice', replyToMsgId: null,
          forwardFrom: null, mediaType: null, type: 'message',
          chatId: '100', chatTitle: 'SearchChat',
        },
      ],
      total: 1,
    };
    const result = formatData(data);
    expect(result).toContain('SearchChat');
    expect(result).toContain('found');
  });

  it('auto-detects single MessageItem at top level', () => {
    const data: MessageItem = {
      id: 99, text: 'Sent!', date: '2026-03-12T06:00:00.000Z',
      senderId: '123', senderName: 'Alice', replyToMsgId: null,
      forwardFrom: null, mediaType: null, type: 'message',
    };
    const result = formatData(data);
    expect(result).toContain('Alice');
    expect(result).toContain('Sent!');
    expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    // Should NOT be JSON
    expect(result).not.toContain('"id"');
  });

  it('returns empty-state string for empty messages array', () => {
    const result = formatData({ messages: [], total: 0 });
    expect(result).toBe('No messages.');
  });

  it('returns empty-state string for empty chats array', () => {
    const result = formatData({ chats: [], total: 0 });
    expect(result).toBe('No chats.');
  });

  it('returns empty-state string for empty members array', () => {
    const result = formatData({ members: [], total: 0 });
    expect(result).toBe('No members.');
  });

  it('falls back to formatGeneric for unknown shapes', () => {
    const data = { loggedIn: true, phone: '+1234' };
    const result = formatData(data);
    expect(result).toContain('"loggedIn"');
    expect(result).toContain('true');
  });
});
