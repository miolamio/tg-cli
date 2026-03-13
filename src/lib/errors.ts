/**
 * Base error class for tg-cli.
 * All custom errors extend this for consistent error handling.
 */
export class TgError extends Error {
  readonly code: string;

  constructor(message: string, code: string = 'TG_ERROR') {
    super(message);
    this.name = 'TgError';
    this.code = code;
  }
}

/**
 * Thrown when API credentials are missing or invalid.
 */
export class CredentialError extends TgError {
  constructor(message: string) {
    super(message, 'CREDENTIAL_ERROR');
    this.name = 'CredentialError';
  }
}

/**
 * Thrown for session-related errors (corrupt, expired, locked).
 */
export class SessionError extends TgError {
  constructor(message: string) {
    super(message, 'SESSION_ERROR');
    this.name = 'SessionError';
  }
}

/**
 * Thrown when Telegram rate-limits a request.
 * Includes the number of seconds to wait before retrying.
 */
export class FloodWaitError extends TgError {
  readonly seconds: number;

  constructor(seconds: number) {
    super(`Rate limited. Retry after ${seconds} seconds.`, 'FLOOD_WAIT');
    this.name = 'FloodWaitError';
    this.seconds = seconds;
  }
}

/**
 * Extract a structured error message and optional code from any thrown value.
 * Handles Error instances, TgError subclasses, and arbitrary thrown values.
 */
export function formatError(err: unknown): { message: string; code?: string } {
  if (err instanceof TgError) {
    return { message: err.message, code: err.code };
  }
  if (err instanceof Error) {
    return { message: err.message };
  }
  return { message: String(err) };
}

/**
 * Map of Telegram RPCError codes to human-readable messages.
 * Used by translateTelegramError to produce actionable CLI output.
 */
const TELEGRAM_ERROR_MAP: Record<string, string> = {
  'MESSAGE_EDIT_TIME_EXPIRED': 'Cannot edit: 48-hour edit window has expired',
  'MESSAGE_AUTHOR_REQUIRED': 'Cannot edit: you can only edit your own messages',
  'MESSAGE_DELETE_FORBIDDEN': 'Cannot delete this message',
  'CHAT_ADMIN_REQUIRED': 'Admin privileges required',
  'MESSAGE_ID_INVALID': 'Message not found',
  'PEER_ID_INVALID': 'Peer not found',
  'MESSAGE_NOT_MODIFIED': 'Message content unchanged',
  'USER_BOT_INVALID': 'Cannot block this bot',
  'INPUT_USER_DEACTIVATED': 'User account deleted',
  'CONTACT_ID_INVALID': 'Contact not found',
  'CONTACT_NAME_EMPTY': 'First name is required',
  'CONTACT_REQ_MISSING': 'Contact request required',
  'SEARCH_QUERY_EMPTY': 'Search query cannot be empty',
};

/**
 * Translate a Telegram API error into a user-friendly message + code pair.
 *
 * Handles gramjs RPCError objects (which have an `errorMessage` property)
 * by mapping known error codes to human-readable messages.
 * Falls back to formatError for non-RPCError thrown values.
 */
export function translateTelegramError(err: unknown): { message: string; code: string } {
  if (err != null && typeof err === 'object' && 'errorMessage' in err) {
    const errorMessage = (err as any).errorMessage as string;
    const humanMessage = TELEGRAM_ERROR_MAP[errorMessage] || errorMessage;
    return { message: humanMessage, code: errorMessage };
  }
  const result = formatError(err);
  return { message: result.message, code: result.code ?? 'UNKNOWN_ERROR' };
}
