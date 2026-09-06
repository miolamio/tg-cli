import { TelegramClient, Api } from 'telegram';
import { TgError } from './errors.js';
import { ErrorCode } from './error-codes.js';

/**
 * Assert that an entity is a forum-enabled supergroup when topicId is provided.
 * Used by commands that support --topic flag to reject non-forum chats early.
 *
 * @throws TgError with NOT_A_FORUM if entity is not a forum Channel
 */
export async function assertForum(entity: any, topicId: number | undefined): Promise<void> {
  if (topicId === undefined) return;
  if (entity?.className !== 'Channel' || entity.forum !== true) {
    throw new TgError('Chat is not a forum-enabled supergroup', ErrorCode.NOT_A_FORUM);
  }
}

/**
 * Regex to extract invite hash from Telegram invite link URLs.
 * Handles: t.me/+HASH, t.me/joinchat/HASH, telegram.me/+HASH, telegram.me/joinchat/HASH
 * With or without https:// prefix.
 */
const INVITE_LINK_RE = /(?:t\.me|telegram\.me)\/(?:joinchat\/|\+)([a-zA-Z0-9_-]+)/;

/**
 * Check if input looks like an invite link (contains t.me/+ or joinchat/).
 */
function isInviteLink(input: string): boolean {
  return INVITE_LINK_RE.test(input);
}

/**
 * Check if input looks like a phone number (+digits).
 */
export function isPhoneNumber(input: string): boolean {
  return /^\+\d+$/.test(input);
}

/**
 * Check if input is a valid integer (including negative).
 */
function isNumericId(input: string): boolean {
  return /^-?\d+$/.test(input);
}

/** Preserve transport/RPC failures; only known absence errors mean not found. */
function throwResolutionError(err: unknown, invite = false): never {
  if (err instanceof TgError) throw err;
  const rpcCode = err != null && typeof err === 'object' && 'errorMessage' in err
    ? String(err.errorMessage) : undefined;
  const missingRpc = invite
    ? ['INVITE_HASH_EMPTY', 'INVITE_HASH_INVALID', 'INVITE_HASH_EXPIRED']
    : ['USERNAME_INVALID', 'USERNAME_NOT_OCCUPIED', 'PHONE_NOT_OCCUPIED', 'USER_ID_INVALID', 'PEER_ID_INVALID'];
  const message = err instanceof Error ? err.message : String(err);
  const missing = rpcCode ? missingRpc.includes(rpcCode) : invite
    ? /^invite hash (?:invalid|expired)$/i.test(message)
    : /^(?:(?:entity|phone|id|peer) not found|Could not find the input entity for |Cannot find any entity corresponding to |No user has .+ as username)/i.test(message);
  if (!missing) throw err;
  throw new TgError(
    `${invite ? 'Failed to resolve invite link' : 'Peer not found'}: ${message}`,
    invite ? ErrorCode.INVALID_INVITE : ErrorCode.PEER_NOT_FOUND,
  );
}

/**
 * Extract the invite hash from a Telegram invite link.
 *
 * Supported formats:
 * - https://t.me/+HASH
 * - https://t.me/joinchat/HASH
 * - https://telegram.me/+HASH
 * - t.me/+HASH (without https://)
 *
 * @throws TgError with INVALID_INVITE code if format is not recognized
 */
export function extractInviteHash(link: string): string {
  const match = link.match(INVITE_LINK_RE);
  if (!match) {
    throw new TgError('Invalid invite link format', 'INVALID_INVITE');
  }
  return match[1];
}

/**
 * Resolve a user input string to a gramjs entity.
 *
 * Accepts:
 * - Username: "username" or "@username"
 * - Numeric ID: "12345" or "-1001234567"
 * - Phone number: "+15551234567"
 * - Invite link: "https://t.me/+HASH" or "https://t.me/joinchat/HASH"
 *
 * @returns The resolved entity (User, Chat, or Channel)
 * @throws TgError with PEER_NOT_FOUND for resolution failures
 * @throws TgError with INVALID_INVITE for invite link failures
 */
export async function resolveEntity(
  client: TelegramClient,
  input: string,
): Promise<Api.User | Api.Chat | Api.Channel> {
  // Invite link: extract hash and use CheckChatInvite
  if (isInviteLink(input)) {
    const hash = extractInviteHash(input);
    try {
      const result = await client.invoke(
        new Api.messages.CheckChatInvite({ hash }),
      );
      // Return the chat from the result (ChatInviteAlready has .chat,
      // ChatInvite has the invite info, ChatInvitePeek has .chat)
      const chat = (result as any).chat;
      if (!chat) {
        throw new TgError(
          'Not a member of this invite. Join first with: tg chat join <link>',
          ErrorCode.NOT_A_MEMBER,
        );
      }
      return chat;
    } catch (err) {
      throwResolutionError(err, true);
    }
  }

  // Phone number: pass as-is to getEntity
  if (isPhoneNumber(input)) {
    try {
      return (await client.getEntity(input)) as Api.User | Api.Chat | Api.Channel;
    } catch (err) {
      throwResolutionError(err);
    }
  }

  // Numeric ID: parse to number
  if (isNumericId(input)) {
    const numId = Number(input);
    if (!Number.isSafeInteger(numId)) {
      throw new TgError('Peer ID must be a safe integer', ErrorCode.INVALID_ID);
    }
    try {
      return (await client.getEntity(numId)) as Api.User | Api.Chat | Api.Channel;
    } catch (err) {
      throwResolutionError(err);
    }
  }

  // Username: strip leading @ if present
  const username = input.startsWith('@') ? input.slice(1) : input;
  try {
    return (await client.getEntity(username)) as Api.User | Api.Chat | Api.Channel;
  } catch (err) {
    throwResolutionError(err);
  }
}
