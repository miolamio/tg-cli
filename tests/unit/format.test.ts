import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

// Mock telegram for media-utils (FILTER_MAP references Api)
vi.mock('telegram', () => ({
  Api: {
    InputMessagesFilterPhotos: class {},
    InputMessagesFilterVideo: class {},
    InputMessagesFilterDocument: class {},
    InputMessagesFilterUrl: class {},
    InputMessagesFilterVoice: class {},
    InputMessagesFilterMusic: class {},
    InputMessagesFilterGif: class {},
    InputMessagesFilterRoundVideo: class {},
  },
}));

import {
  formatMessages,
  formatChatList,
  formatChatInfo,
  formatMembers,
  formatSearchResults,
  formatGeneric,
  formatData,
  formatDownloadResult,
  formatUploadResult,
  formatGetResult,
} from '../../src/lib/format.js';
import type {
  MessageItem,
  ChatListItem,
  ChatInfo,
  MemberItem,
  SearchResultItem,
  DownloadResult,
  AlbumResult,
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

  it('auto-detects DownloadResult shape', () => {
    const data: DownloadResult = {
      path: '/tmp/photo_123.jpg',
      filename: 'photo_123.jpg',
      size: 245760,
      mediaType: 'photo',
      messageId: 123,
    };
    const result = formatData(data);
    expect(result).toContain('photo_123.jpg');
    expect(result).toContain('/tmp/photo_123.jpg');
    // Should NOT be raw JSON
    expect(result).not.toContain('"path"');
  });

  it('auto-detects AlbumResult shape', () => {
    const data: AlbumResult = {
      messages: [
        {
          id: 1, text: 'Album photo', date: '2026-03-12T12:00:00.000Z',
          senderId: '123', senderName: 'Alice', replyToMsgId: null,
          forwardFrom: null, mediaType: 'photo', type: 'message',
        },
      ],
      sent: 1,
    };
    const result = formatData(data);
    expect(result).toContain('Sent 1');
    expect(result).toContain('Alice');
  });
});

describe('formatMessages - media annotations', () => {
  it('shows rich media annotation with dimensions and size', () => {
    const messages: MessageItem[] = [
      {
        id: 1, text: 'Look!', date: '2026-03-11T12:30:00.000Z',
        senderId: '123', senderName: 'Alice', replyToMsgId: null,
        forwardFrom: null, mediaType: 'photo', type: 'message',
        media: {
          filename: null,
          fileSize: 245760,
          mimeType: 'image/jpeg',
          width: 1920,
          height: 1080,
          duration: null,
        },
      },
    ];
    const result = formatMessages(messages);
    expect(result).toContain('photo');
    expect(result).toContain('1920x1080');
    expect(result).toContain('240KB');
  });

  it('shows duration for video messages', () => {
    const messages: MessageItem[] = [
      {
        id: 2, text: '', date: '2026-03-11T12:30:00.000Z',
        senderId: '123', senderName: 'Alice', replyToMsgId: null,
        forwardFrom: null, mediaType: 'video', type: 'message',
        media: {
          filename: null,
          fileSize: 1258291,
          mimeType: 'video/mp4',
          width: 1280,
          height: 720,
          duration: 32,
        },
      },
    ];
    const result = formatMessages(messages);
    expect(result).toContain('video');
    expect(result).toContain('1280x720');
    expect(result).toContain('0:32');
    expect(result).toContain('1.2MB');
  });

  it('shows filename for document messages', () => {
    const messages: MessageItem[] = [
      {
        id: 3, text: '', date: '2026-03-11T12:30:00.000Z',
        senderId: '123', senderName: 'Alice', replyToMsgId: null,
        forwardFrom: null, mediaType: 'document', type: 'message',
        media: {
          filename: 'report.pdf',
          fileSize: 3565158,
          mimeType: 'application/pdf',
          width: null,
          height: null,
          duration: null,
        },
      },
    ];
    const result = formatMessages(messages);
    expect(result).toContain('document');
    expect(result).toContain('report.pdf');
    expect(result).toContain('3.4MB');
  });

  it('shows [mediaType] only when no media metadata present', () => {
    const messages: MessageItem[] = [
      {
        id: 4, text: 'check this', date: '2026-03-11T12:30:00.000Z',
        senderId: '123', senderName: 'Alice', replyToMsgId: null,
        forwardFrom: null, mediaType: 'photo', type: 'message',
        // no media field
      },
    ];
    const result = formatMessages(messages);
    expect(result).toContain('[photo]');
  });

  it('shows "(edited)" indicator when editDate is present', () => {
    const messages: MessageItem[] = [
      {
        id: 5, text: 'Updated text', date: '2026-03-11T12:30:00.000Z',
        senderId: '123', senderName: 'Alice', replyToMsgId: null,
        forwardFrom: null, mediaType: null, type: 'message',
        editDate: '2026-03-11T12:35:00.000Z',
      },
    ];
    const result = formatMessages(messages);
    expect(result).toContain('(edited)');
    expect(result).toContain('Alice');
    expect(result).toContain('Updated text');
  });

  it('does not show "(edited)" when editDate is absent', () => {
    const messages: MessageItem[] = [
      {
        id: 6, text: 'Original text', date: '2026-03-11T12:30:00.000Z',
        senderId: '123', senderName: 'Alice', replyToMsgId: null,
        forwardFrom: null, mediaType: null, type: 'message',
      },
    ];
    const result = formatMessages(messages);
    expect(result).not.toContain('(edited)');
  });
});

describe('formatGetResult', () => {
  const msg: MessageItem = {
    id: 100, text: 'Hello', date: '2026-03-12T12:00:00.000Z',
    senderId: '123', senderName: 'Alice', replyToMsgId: null,
    forwardFrom: null, mediaType: null, type: 'message',
  };

  it('renders messages with notFound footer', () => {
    const result = formatGetResult({ messages: [msg], notFound: [101, 103] });
    expect(result).toContain('Alice');
    expect(result).toContain('Hello');
    expect(result).toContain('Not found: 101, 103');
  });

  it('renders messages without notFound when empty', () => {
    const result = formatGetResult({ messages: [msg], notFound: [] });
    expect(result).toContain('Alice');
    expect(result).not.toContain('Not found');
  });

  it('renders "No messages found." when messages empty', () => {
    const result = formatGetResult({ messages: [], notFound: [100, 101] });
    expect(result).toContain('No messages found.');
    expect(result).toContain('Not found: 100, 101');
  });

  it('renders "No messages found." with no notFound', () => {
    const result = formatGetResult({ messages: [], notFound: [] });
    expect(result).toBe('No messages found.');
  });
});

describe('formatData - getResult dispatch', () => {
  it('dispatches { messages, notFound } to formatGetResult', () => {
    const data = {
      messages: [{
        id: 1, text: 'Hi', date: '2026-03-12T12:00:00.000Z',
        senderId: '123', senderName: 'Alice', replyToMsgId: null,
        forwardFrom: null, mediaType: null, type: 'message',
      }],
      notFound: [99],
    };
    const result = formatData(data);
    expect(result).toContain('Alice');
    expect(result).toContain('Not found: 99');
  });

  it('dispatches { messages: [], notFound } correctly', () => {
    const result = formatData({ messages: [], notFound: [1, 2, 3] });
    expect(result).toContain('No messages found.');
    expect(result).toContain('Not found: 1, 2, 3');
  });
});

describe('formatDownloadResult', () => {
  it('formats download result with all fields', () => {
    const result = formatDownloadResult({
      path: '/tmp/photo_123.jpg',
      filename: 'photo_123.jpg',
      size: 245760,
      mediaType: 'photo',
      messageId: 123,
    });
    expect(result).toContain('photo_123.jpg');
    expect(result).toContain('/tmp/photo_123.jpg');
    expect(result).toContain('240KB');
    expect(result).toContain('photo');
  });
});

describe('formatUploadResult', () => {
  it('formats album result with message count', () => {
    const data: AlbumResult = {
      messages: [
        {
          id: 1, text: '', date: '2026-03-12T12:00:00.000Z',
          senderId: '123', senderName: 'Alice', replyToMsgId: null,
          forwardFrom: null, mediaType: 'photo', type: 'message',
        },
        {
          id: 2, text: '', date: '2026-03-12T12:00:01.000Z',
          senderId: '123', senderName: 'Alice', replyToMsgId: null,
          forwardFrom: null, mediaType: 'photo', type: 'message',
        },
      ],
      sent: 2,
    };
    const result = formatUploadResult(data);
    expect(result).toContain('Sent 2');
  });

  it('formats single message result', () => {
    const msg: MessageItem = {
      id: 1, text: 'sent photo', date: '2026-03-12T12:00:00.000Z',
      senderId: '123', senderName: 'Alice', replyToMsgId: null,
      forwardFrom: null, mediaType: 'photo', type: 'message',
    };
    const result = formatUploadResult(msg);
    expect(result).toContain('Alice');
    expect(result).toContain('sent photo');
  });
});
