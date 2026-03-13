import pc from 'picocolors';
import type {
  MessageItem,
  ChatListItem,
  ChatInfo,
  MemberItem,
  SearchResultItem,
  DownloadResult,
  AlbumResult,
  TopicItem,
  DeleteResult,
  PinResult,
} from './types.js';
import { formatBytes } from './media-utils.js';

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
 * Build a rich media annotation string from a message's media metadata.
 *
 * With media metadata: [photo 1920x1080 240KB], [video 1280x720 0:32 1.2MB], [document report.pdf 3.4MB]
 * Without metadata but with mediaType: [photo] (existing behavior for messages without full metadata)
 * Neither: empty string
 */
function formatMediaAnnotation(m: MessageItem): string {
  if (m.media) {
    const parts: string[] = [m.mediaType ?? 'file'];
    if (m.media.width != null && m.media.height != null) {
      parts.push(`${m.media.width}x${m.media.height}`);
    }
    if (m.media.duration != null) {
      const mins = Math.floor(m.media.duration / 60);
      const secs = String(m.media.duration % 60).padStart(2, '0');
      parts.push(`${mins}:${secs}`);
    }
    if (m.media.fileSize != null) {
      parts.push(formatBytes(m.media.fileSize));
    }
    if (m.media.filename != null) {
      parts.push(m.media.filename);
    }
    return `[${parts.join(' ')}]`;
  }
  if (m.mediaType) {
    return `[${m.mediaType}]`;
  }
  return '';
}

/**
 * Format a single message line in conversational style.
 * [2026-03-11 12:30] Alice: Hello world
 * [2026-03-11 12:31] Bob (reply to 42): Thanks!
 * [2026-03-11 12:32] Alice: [photo 1920x1080 240KB] Check this out
 */
function formatSingleMessage(m: MessageItem): string {
  const ts = pc.dim(`[${formatTimestamp(m.date)}]`);
  const sender = pc.bold(m.senderName ?? 'Unknown');
  const reply = m.replyToMsgId != null ? pc.dim(` (reply to ${m.replyToMsgId})`) : '';
  const edited = m.editDate ? pc.dim(' (edited)') : '';
  const annotation = formatMediaAnnotation(m);
  const media = annotation ? pc.yellow(annotation) + ' ' : '';
  return `${ts} ${sender}${reply}${edited}: ${media}${m.text}`;
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
 * Format a download result with path, filename, size, and type.
 */
export function formatDownloadResult(result: DownloadResult): string {
  const lines = [
    `${pc.bold('Downloaded:')} ${result.filename}`,
    `${pc.bold('Path:')} ${pc.green(result.path)}`,
    `${pc.bold('Size:')} ${formatBytes(result.size)}`,
    `${pc.bold('Type:')} ${result.mediaType}`,
  ];
  return lines.join('\n');
}

/**
 * Format an upload/send result.
 * Handles both single MessageItem (delegates to formatSingleMessage) and
 * AlbumResult (header + each message formatted).
 */
export function formatUploadResult(result: AlbumResult | MessageItem): string {
  // AlbumResult shape
  if ('messages' in result && 'sent' in result) {
    const album = result as AlbumResult;
    const header = pc.bold(`Sent ${album.sent} files`);
    const msgs = album.messages.map(formatSingleMessage).join('\n');
    return `${header}\n${msgs}`;
  }
  // Single MessageItem
  return formatSingleMessage(result);
}

/**
 * Format forum topics as a human-readable list.
 * Each topic shows its ID, title, and optional pinned/closed indicators.
 * Example:
 *   42  General Discussion [pinned]
 *   43  Off Topic [closed]
 *   44  Normal Topic
 */
export function formatTopics(topics: TopicItem[]): string {
  if (topics.length === 0) return '';

  // Determine max ID width for alignment
  const maxIdLen = Math.max(...topics.map(t => String(t.id).length));

  return topics.map(t => {
    const idStr = String(t.id).padStart(maxIdLen);
    const id = pc.dim(idStr);
    const title = pc.bold(t.title);
    const indicators: string[] = [];
    if (t.isPinned) indicators.push(pc.cyan('[pinned]'));
    if (t.isClosed) indicators.push(pc.yellow('[closed]'));
    const suffix = indicators.length > 0 ? ' ' + indicators.join(' ') : '';
    return `  ${id}  ${title}${suffix}`;
  }).join('\n');
}

/**
 * Format a get-by-ID result with messages and a not-found footer.
 * Renders found messages with formatMessages, appends dim "Not found: ..." line.
 */
export function formatGetResult(data: { messages: MessageItem[]; notFound: number[] }): string {
  const parts: string[] = [];

  if (data.messages.length > 0) {
    parts.push(formatMessages(data.messages));
  } else {
    parts.push('No messages found.');
  }

  if (data.notFound.length > 0) {
    parts.push(pc.dim('Not found: ' + data.notFound.join(', ')));
  }

  return parts.join('\n');
}

/**
 * Format a delete result with count, mode, and any failed entries.
 * "Deleted 3 messages (revoke)." or "Failed: 42 (permission denied)"
 */
export function formatDeleteResult(result: DeleteResult): string {
  const parts: string[] = [];
  if (result.deleted.length > 0) {
    parts.push(`Deleted ${result.deleted.length} message${result.deleted.length > 1 ? 's' : ''} (${result.mode}).`);
  }
  for (const f of result.failed) {
    parts.push(pc.red(`Failed: ${f.id} (${f.reason})`));
  }
  if (parts.length === 0) {
    parts.push('No messages deleted.');
  }
  return parts.join('\n');
}

/**
 * Format a pin/unpin result with action, message ID, chat ID, and silent indicator.
 * "Pinned message 456 in @group (silent)" or "Unpinned message 456 in @group"
 */
export function formatPinResult(result: PinResult): string {
  const action = result.action === 'pinned' ? 'Pinned' : 'Unpinned';
  const suffix = result.action === 'pinned'
    ? (result.silent ? ' (silent)' : ' (notified)')
    : '';
  return `${action} message ${result.messageId} in ${result.chatId}${suffix}`;
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

  // Check for DownloadResult shape (has path + filename + size + mediaType + messageId)
  if ('path' in obj && 'filename' in obj && 'size' in obj && 'mediaType' in obj && 'messageId' in obj) {
    return formatDownloadResult(obj as DownloadResult);
  }

  // Check for batch download shape (has files[] + downloaded count)
  if (Array.isArray(obj.files) && 'downloaded' in obj) {
    const header = pc.bold(`Downloaded ${obj.downloaded} files`);
    const items = (obj.files as DownloadResult[]).map(f => formatDownloadResult(f)).join('\n\n');
    return `${header}\n\n${items}`;
  }

  // Check for AlbumResult shape (messages[] + sent number) - before generic messages check
  if (Array.isArray(obj.messages) && typeof obj.sent === 'number') {
    return formatUploadResult(obj as AlbumResult);
  }

  // Check for single MessageItem at top level (e.g. from send command)
  if ('id' in obj && 'text' in obj && 'date' in obj && 'type' in obj && !('messages' in obj) && !('chats' in obj)) {
    return formatMessages([obj as MessageItem]);
  }

  // Check for get-by-ID result shape (messages[] + notFound[]) — BEFORE generic messages check
  // to avoid notFound being silently dropped
  if (Array.isArray(obj.messages) && Array.isArray(obj.notFound)) {
    return formatGetResult(obj as { messages: MessageItem[]; notFound: number[] });
  }

  // Check for messages array
  if (Array.isArray(obj.messages)) {
    if (obj.messages.length === 0) return 'No messages.';
    const first = obj.messages[0];
    if ('chatTitle' in first) {
      return formatSearchResults(obj.messages as SearchResultItem[]);
    }
    if ('text' in first && 'date' in first) {
      return formatMessages(obj.messages as MessageItem[]);
    }
  }

  // Check for chats array
  if (Array.isArray(obj.chats)) {
    if (obj.chats.length === 0) return 'No chats.';
    const first = obj.chats[0];
    if ('type' in first && 'title' in first) {
      return formatChatList(obj.chats as ChatListItem[]);
    }
  }

  // Check for ChatInfo shape (has title + type + memberCount at top level)
  if ('title' in obj && 'type' in obj && 'memberCount' in obj) {
    return formatChatInfo(obj as ChatInfo);
  }

  // Check for topics array (forum topics)
  if (Array.isArray(obj.topics)) {
    if (obj.topics.length === 0) return 'No topics.';
    const first = obj.topics[0];
    if ('title' in first && 'isClosed' in first) {
      return formatTopics(obj.topics as TopicItem[]);
    }
  }

  // Check for members array
  if (Array.isArray(obj.members)) {
    if (obj.members.length === 0) return 'No members.';
    const first = obj.members[0];
    if ('isBot' in first) {
      return formatMembers(obj.members as MemberItem[]);
    }
  }

  // Check for DeleteResult shape (has deleted[] + mode)
  if (Array.isArray(obj.deleted) && 'mode' in obj) {
    return formatDeleteResult(obj as DeleteResult);
  }

  // Check for PinResult shape (has action pinned/unpinned + messageId, but NOT emoji to avoid react conflict)
  if ('action' in obj && 'messageId' in obj && !('emoji' in obj) &&
      (obj.action === 'pinned' || obj.action === 'unpinned')) {
    return formatPinResult(obj as PinResult);
  }

  // Fallback
  return formatGeneric(data);
}
