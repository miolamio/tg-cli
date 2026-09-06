import { z } from 'zod/v4';
import { TgError } from './errors.js';
import { ErrorCode } from './error-codes.js';

/** Largest positive signed TL int (message IDs, offsets, and counts). */
export const MAX_TL_INT = 2_147_483_647;

/** Parse a decimal CLI integer without truncation, coercion, or overflow. */
export function parseIntegerOption(
  input: string,
  label: string,
  options: { min?: number; max?: number; code?: string } = {},
): number {
  const { min = 0, max = MAX_TL_INT, code = ErrorCode.INVALID_INPUT } = options;
  const trimmed = input.trim();
  const value = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new TgError(`${label} must be an integer from ${min} to ${max}`, code);
  }
  return value;
}

const profileSchema = z.string()
  .min(1, 'Profile name cannot be empty')
  .max(64, 'Profile name too long (max 64)')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Profile name: only letters, digits, _ and -');

/**
 * Validate and return a sanitized profile name.
 * Rejects path traversal, special chars, and empty strings.
 *
 * @throws TgError with INVALID_INPUT
 */
export function validateProfile(profile: string): string {
  const result = profileSchema.safeParse(profile);
  if (!result.success) {
    throw new TgError(result.error.issues[0].message, ErrorCode.INVALID_INPUT);
  }
  return result.data;
}

/**
 * Validate and parse pagination options with defaults.
 *
 * @throws TgError with INVALID_INPUT
 */
export function validatePagination(
  opts: { limit?: string; offset?: string },
  defaultLimit = 50,
): { limit: number; offset: number } {
  try {
    return {
      limit: parseIntegerOption(opts.limit ?? String(defaultLimit), 'limit', { min: 1 }),
      offset: parseIntegerOption(opts.offset ?? '0', 'offset'),
    };
  } catch (err) {
    throw new TgError(`Invalid pagination: ${(err as Error).message}`, ErrorCode.INVALID_INPUT);
  }
}

/**
 * Parse comma-separated message IDs: digits only, each > 0, max `max` entries.
 *
 * @throws TgError INVALID_MESSAGE_ID or TOO_MANY_IDS
 */
export function parseMessageIds(input: string, max = 100): number[] {
  const parts = input.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length === 0) {
    throw new TgError('No message IDs provided', ErrorCode.INVALID_MESSAGE_ID);
  }

  const ids: number[] = [];
  const invalid: string[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      invalid.push(part);
      continue;
    }
    const num = parseInt(part, 10);
    if (!Number.isSafeInteger(num) || num <= 0 || num > MAX_TL_INT) invalid.push(part);
    else ids.push(num);
  }

  if (invalid.length > 0) {
    throw new TgError(`Invalid message IDs: ${invalid.join(', ')}`, ErrorCode.INVALID_MESSAGE_ID);
  }
  if (ids.length > max) {
    throw new TgError(
      `Maximum ${max} IDs per request (got ${ids.length})`,
      ErrorCode.TOO_MANY_IDS,
    );
  }
  return ids;
}

/** Parse a single positive message ID. */
export function parseMessageId(input: string): number {
  try {
    return parseIntegerOption(input, 'Message ID', { min: 1, code: ErrorCode.INVALID_MESSAGE_ID });
  } catch {
    throw new TgError(`Invalid message ID: expected an integer from 1 to ${MAX_TL_INT}`, ErrorCode.INVALID_MESSAGE_ID);
  }
}

/** Parse a forum topic id. Rejects `12x` (no parseInt truncation). */
export function parseTopicId(input: string): number {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new TgError('Invalid topic ID: must be a number', ErrorCode.INVALID_TOPIC_ID);
  }
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(n) || n <= 0 || n > MAX_TL_INT) {
    throw new TgError('Invalid topic ID: must be a number', ErrorCode.INVALID_TOPIC_ID);
  }
  return n;
}

/** Parse an ISO 8601 (or Date.parse-able) timestamp. */
export function parseIsoDate(value: string, label: string): Date {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new TgError(`Invalid ${label}: must be ISO 8601`, ErrorCode.INVALID_INPUT);
  }
  return new Date(ms);
}
