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
  actionText?: string;
  emoji?: string;
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
  query: string;
  chat?: string;
  limit: number;
  offset: number;
  since?: string;
  until?: string;
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
