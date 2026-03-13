/**
 * Global CLI options available on all commands via optsWithGlobals().
 */
export interface GlobalOptions {
  json: boolean;
  human: boolean;
  verbose: boolean;
  quiet: boolean;
  profile: string;
  config?: string;
  fields?: string;
  jsonl?: boolean;
  toon?: boolean;
}

/**
 * Stored data for a named profile (session + metadata).
 */
export interface ProfileData {
  session: string;
  phone?: string;
  created?: string;
}

/**
 * Configuration schema for the tg-cli config file.
 */
export interface TgConfig {
  apiId?: number;
  apiHash?: string;
  profiles: Record<string, ProfileData>;
}

/**
 * JSON output envelope for successful responses.
 */
export interface SuccessEnvelope<T> {
  ok: true;
  data: T;
}

/**
 * JSON output envelope for error responses.
 */
export interface ErrorEnvelope {
  ok: false;
  error: string;
  code?: string;
}

/**
 * Union type for all JSON output envelopes.
 */
export type OutputEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

// ---- Phase 2: Chat Discovery & Message Reading types ----

/**
 * Serialized chat/dialog item for list output.
 */
export interface ChatListItem {
  id: string;
  title: string;
  type: 'user' | 'group' | 'channel' | 'supergroup';
  username: string | null;
  unreadCount: number;
}

/**
 * Detailed chat information (kitchen sink per user decision).
 */
export interface ChatInfo {
  id: string;
  title: string;
  type: string;
  username: string | null;
  description: string | null;
  memberCount: number | null;
  creationDate: string | null;
  photo: object | null;
  linkedChatId: string | null;
  slowmodeSeconds: number | null;
  permissions: object | null;
  inviteLink: string | null;
  migratedFrom: string | null;
}

/**
 * Serialized group/channel member.
 */
export interface MemberItem {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  isBot: boolean;
  status: string | null;
}

/**
 * Serialized message for history and search output.
 */
export interface MessageItem {
  id: number;
  text: string;
  date: string;
  senderId: string | null;
  senderName: string | null;
  replyToMsgId: number | null;
  forwardFrom: string | null;
  mediaType: string | null;
  type: 'message' | 'service';
  views?: number | null;
  forwards?: number | null;
  reactions?: ReactionCount[];
  actionText?: string;
  emoji?: string;
  media?: MediaInfo;  // Only present when mediaType is not null
  editDate?: string;  // ISO string when message has been edited
  poll?: PollData;  // Present when message contains a poll
}

/** Reaction count for a message. */
export interface ReactionCount {
  emoji: string;
  count: number;
}

/**
 * Search result extends MessageItem with chat context for global search.
 */
export interface SearchResultItem extends MessageItem {
  chatId: string;
  chatTitle: string;
}

/**
 * Options for the chat list command.
 */
export interface ChatListOptions {
  type?: 'user' | 'group' | 'channel' | 'supergroup';
  limit: number;
  offset: number;
}

/**
 * Options for the chat info command.
 */
export interface ChatInfoOptions {
  chat: string;
}

/**
 * Options for the chat members command.
 */
export interface ChatMembersOptions {
  chat: string;
  limit: number;
  offset: number;
  search?: string;
}

/**
 * Options for the message history command.
 */
export interface MessageHistoryOptions {
  chat: string;
  limit: number;
  offset: number;
  since?: string;
  until?: string;
}

/**
 * Options for the message search command.
 */
export interface MessageSearchOptions {
  query?: string;  // Now optional (required when no --filter)
  filter?: string;
  chat?: string;
  limit: number;
  offset: number;
  since?: string;
  until?: string;
}

// ---- Phase 4: Media & Files types ----

/** Metadata extracted from a message's media attachment. */
export interface MediaInfo {
  filename: string | null;
  fileSize: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
}

/** Result of downloading a single media file. */
export interface DownloadResult {
  path: string;
  filename: string;
  size: number;
  mediaType: string;
  messageId: number;
}

/** Result of uploading/sending a single file. */
export interface UploadResult extends MessageItem {}

/** Result of sending an album (multiple files). */
export interface AlbumResult {
  messages: MessageItem[];
  sent: number;
}

/** Options for the media download command. */
export interface MediaDownloadOptions {
  chat: string;
  messageIds: number[];
  output?: string;
}

/** Options for the media send command. */
export interface MediaSendOptions {
  chat: string;
  files: string[];
  caption?: string;
  replyTo?: number;
}

// ---- Phase 5: Advanced Features types ----

/**
 * Serialized forum topic item for topic listing output.
 */
export interface TopicItem {
  id: number;
  title: string;
  iconEmoji: string | null;
  creationDate: string;
  creatorId: string;
  /** Mapped from gramjs topMessage (latest message ID, not a true count) */
  messageCount: number;
  isClosed: boolean;
  isPinned: boolean;
}

/**
 * Options for the chat topics command.
 */
export interface TopicListOptions {
  chat: string;
  limit: number;
  offset: number;
}

// ---- Phase 3: Messaging & Interaction types ----

export interface SendOptions {
  chat: string;
  text: string;
  replyTo?: number;
}

export interface ForwardOptions {
  fromChat: string;
  messageIds: number[];
  toChat: string;
}

export interface ReactOptions {
  chat: string;
  messageId: number;
  emoji: string;
  remove: boolean;
}

// ---- Phase 7: Message Write Operations types ----

/** Result of deleting messages. */
export interface DeleteResult {
  deleted: number[];
  failed: { id: number; reason: string }[];
  mode: 'revoke' | 'for-me';
}

/** Result of pinning or unpinning a message. */
export interface PinResult {
  messageId: number;
  chatId: string;
  action: 'pinned' | 'unpinned';
  silent?: boolean;
}

// ---- Phase 8: User Profiles & Block/Unblock types ----

/** Detailed user profile information. */
export interface UserProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null | '[restricted]';
  bio: string | null;
  photoCount: number;
  lastSeen: string | null;
  isBot: boolean;
  blocked: boolean;
  commonChatsCount: number;
  premium: boolean;
  verified: boolean;
  mutualContact: boolean;
  langCode: string | null;
  /** Bot-only: inline query placeholder text. */
  botInlinePlaceholder?: string;
  /** Bot-only: whether the bot supports inline queries. */
  supportsInline?: boolean;
}

/** Result of a multi-user profile lookup. */
export interface UserProfileResult {
  profiles: UserProfile[];
  notFound: string[];
}

/** Result of blocking or unblocking a user. */
export interface BlockResult {
  userId: string;
  username: string | null;
  firstName: string | null;
  action: 'blocked' | 'unblocked';
}

/** Summary of a blocked user for list output. */
export interface BlockedListItem {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  isBot: boolean;
}

/** Result of listing blocked users. */
export interface BlockedListResult {
  users: BlockedListItem[];
  total: number;
}

// ---- Phase 10: Polls types ----

/** Single poll option with vote data. */
export interface PollOption {
  text: string;
  voters: number;
  chosen: boolean;
  correct: boolean;
}

/** Structured poll data extracted from MessageMediaPoll. */
export interface PollData {
  question: string;
  options: PollOption[];
  isQuiz: boolean;
  isPublic: boolean;
  isMultiple: boolean;
  isClosed: boolean;
  closePeriod: number | null;
  closeDate: string | null;
  totalVoters: number;
  correctOption: number | null;
  solution: string | null;
}

// ---- Phase 9: Contacts CRUD types ----

/** Result of deleting a contact. */
export interface ContactDeleteResult {
  userId: string;
  username: string | null;
  firstName: string | null;
  action: 'deleted';
}

/** Result of listing contacts. */
export interface ContactListResult {
  contacts: UserProfile[];
  total: number;
}

/** A search result item with contact status. */
export interface ContactSearchItem extends UserProfile {
  isContact: boolean;
}

/** Result of searching contacts. */
export interface ContactSearchResult {
  results: ContactSearchItem[];
  total: number;
}
