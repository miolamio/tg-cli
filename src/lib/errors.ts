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
