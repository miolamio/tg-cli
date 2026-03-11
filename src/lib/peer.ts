import { TelegramClient, Api } from 'telegram';
import { TgError } from './errors.js';

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
function isPhoneNumber(input: string): boolean {
  return /^\+\d+$/.test(input);
}

/**
 * Check if input is a valid integer (including negative).
 */
function isNumericId(input: string): boolean {
  return /^-?\d+$/.test(input);
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
      return (result as any).chat ?? result;
    } catch (err) {
      if (err instanceof TgError) throw err;
      throw new TgError(
        `Failed to resolve invite link: ${(err as Error).message}`,
        'INVALID_INVITE',
      );
    }
  }

  // Phone number: pass as-is to getEntity
  if (isPhoneNumber(input)) {
    try {
      return (await client.getEntity(input)) as Api.User | Api.Chat | Api.Channel;
    } catch (err) {
      if (err instanceof TgError) throw err;
      throw new TgError(
        `Peer not found: ${(err as Error).message}`,
        'PEER_NOT_FOUND',
      );
    }
  }

  // Numeric ID: parse to number
  if (isNumericId(input)) {
    const numId = Number(input);
    try {
      return (await client.getEntity(numId)) as Api.User | Api.Chat | Api.Channel;
    } catch (err) {
      if (err instanceof TgError) throw err;
      throw new TgError(
        `Peer not found: ${(err as Error).message}`,
        'PEER_NOT_FOUND',
      );
    }
  }

  // Username: strip leading @ if present
  const username = input.startsWith('@') ? input.slice(1) : input;
  try {
    return (await client.getEntity(username)) as Api.User | Api.Chat | Api.Channel;
  } catch (err) {
    if (err instanceof TgError) throw err;
    throw new TgError(
      `Peer not found: ${(err as Error).message}`,
      'PEER_NOT_FOUND',
    );
  }
}
