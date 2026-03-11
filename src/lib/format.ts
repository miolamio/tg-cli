import pc from 'picocolors';
import type {
  MessageItem,
  ChatListItem,
  ChatInfo,
  MemberItem,
  SearchResultItem,
} from './types.js';

/**
 * Format a date string to local "YYYY-MM-DD HH:MM" display.
 */
function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Format a single message line in conversational style.
 * [2026-03-11 12:30] Alice: Hello world
 * [2026-03-11 12:31] Bob (reply to 42): Thanks!
 * [2026-03-11 12:32] Alice: [photo] Check this out
 */
function formatSingleMessage(m: MessageItem): string {
  const ts = pc.dim(`[${formatTimestamp(m.date)}]`);
  const sender = pc.bold(m.senderName ?? 'Unknown');
  const reply = m.replyToMsgId != null ? pc.dim(` (reply to ${m.replyToMsgId})`) : '';
  const media = m.mediaType ? pc.yellow(`[${m.mediaType}] `) : '';
  return `${ts} ${sender}${reply}: ${media}${m.text}`;
}

/**
 * Format a list of messages in conversational style.
 * Each message on its own line with timestamp, sender, optional reply/media annotations.
 */
export function formatMessages(messages: MessageItem[]): string {
  if (messages.length === 0) return '';
  return messages.map(formatSingleMessage).join('\n');
}

/**
 * Format a chat list in table format.
 * [channel]    My Channel @mychan
 * [supergroup] Dev Group @devs (5 unread)
 * [user]       Alice @alice
 */
export function formatChatList(chats: ChatListItem[]): string {
  if (chats.length === 0) return '';

  // Determine max type length for alignment
  const maxTypeLen = Math.max(...chats.map(c => c.type.length));

  return chats.map(c => {
    const typePad = c.type.padEnd(maxTypeLen);
    const typeTag = pc.dim(`[${typePad}]`);
    const title = pc.bold(c.title);
    const username = c.username ? pc.dim(` @${c.username}`) : '';
    const unread = c.unreadCount > 0 ? pc.yellow(` (${c.unreadCount} unread)`) : '';
    return `${typeTag} ${title}${username}${unread}`;
  }).join('\n');
}

/**
 * Format chat info as key-value pairs.
 * Title:       My Channel
 * Type:        channel
 * Username:    @mychan
 * Description: A test channel
 * Members:     1,234
 */
export function formatChatInfo(info: ChatInfo): string {
  const pairs: [string, string][] = [];

  pairs.push(['Title', info.title]);
  pairs.push(['Type', info.type]);
  if (info.username != null) pairs.push(['Username', `@${info.username}`]);
  if (info.description != null) pairs.push(['Description', info.description]);
  if (info.memberCount != null) pairs.push(['Members', info.memberCount.toLocaleString()]);
  if (info.creationDate != null) pairs.push(['Created', info.creationDate]);
  if (info.linkedChatId != null) pairs.push(['Linked Chat', info.linkedChatId]);
  if (info.slowmodeSeconds != null) pairs.push(['Slowmode', `${info.slowmodeSeconds}s`]);
  if (info.inviteLink != null) pairs.push(['Invite Link', info.inviteLink]);
  if (info.migratedFrom != null) pairs.push(['Migrated From', info.migratedFrom]);

  const maxLabelLen = Math.max(...pairs.map(([label]) => label.length));

  return pairs.map(([label, value]) => {
    const paddedLabel = label.padEnd(maxLabelLen);
    return `${pc.bold(paddedLabel)}  ${value}`;
  }).join('\n');
}

/**
 * Format members list with name, username, and bot tag.
 * Alice @alice
 * Bob @bob [bot]
 */
export function formatMembers(members: MemberItem[]): string {
  if (members.length === 0) return '';

  return members.map(m => {
    const name = pc.bold([m.firstName, m.lastName].filter(Boolean).join(' ') || 'Unknown');
    const username = m.username ? pc.dim(` @${m.username}`) : '';
    const bot = m.isBot ? pc.cyan(' [bot]') : '';
    return `${name}${username}${bot}`;
  }).join('\n');
}

/**
 * Format search results grouped by chat title.
 * --- Dev Group ---
 * [2026-03-11 12:30] Alice: found this
 * --- General Chat ---
 * [2026-03-11 12:35] Bob: also here
 */
export function formatSearchResults(results: SearchResultItem[]): string {
  if (results.length === 0) return '';

  // Group by chatTitle preserving order
  const groups = new Map<string, SearchResultItem[]>();
  for (const r of results) {
    const existing = groups.get(r.chatTitle);
    if (existing) {
      existing.push(r);
    } else {
      groups.set(r.chatTitle, [r]);
    }
  }

  const sections: string[] = [];
  for (const [chatTitle, msgs] of groups) {
    sections.push(pc.bold(`--- ${chatTitle} ---`));
    for (const m of msgs) {
      sections.push(formatSingleMessage(m));
    }
  }

  return sections.join('\n');
}

/**
 * Fallback formatter: pretty-prints any data as indented JSON.
 * Used for auth status, session export/import, join/leave confirmations, etc.
 */
export function formatGeneric(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Auto-detect data shape and dispatch to the appropriate formatter.
 *
 * Detection order:
 * 1. .messages[] with .chatTitle -> formatSearchResults
 * 2. .messages[] with .text and .date -> formatMessages
 * 3. .chats[] with .type and .title -> formatChatList
 * 4. .title + .type + .memberCount (ChatInfo) -> formatChatInfo
 * 5. .members[] with .isBot -> formatMembers
 * 6. Default -> formatGeneric
 */
export function formatData(data: unknown): string {
  if (data == null || typeof data !== 'object') {
    return formatGeneric(data);
  }

  const obj = data as Record<string, any>;

  // Check for messages array
  if (Array.isArray(obj.messages) && obj.messages.length > 0) {
    const first = obj.messages[0];
    // Search results have chatTitle
    if ('chatTitle' in first) {
      return formatSearchResults(obj.messages as SearchResultItem[]);
    }
    // Regular messages have text and date
    if ('text' in first && 'date' in first) {
      return formatMessages(obj.messages as MessageItem[]);
    }
  }

  // Check for chats array
  if (Array.isArray(obj.chats) && obj.chats.length > 0) {
    const first = obj.chats[0];
    if ('type' in first && 'title' in first) {
      return formatChatList(obj.chats as ChatListItem[]);
    }
  }

  // Check for ChatInfo shape (has title + type + memberCount at top level)
  if ('title' in obj && 'type' in obj && 'memberCount' in obj) {
    return formatChatInfo(obj as ChatInfo);
  }

  // Check for members array
  if (Array.isArray(obj.members) && obj.members.length > 0) {
    const first = obj.members[0];
    if ('isBot' in first) {
      return formatMembers(obj.members as MemberItem[]);
    }
  }

  // Fallback
  return formatGeneric(data);
}
