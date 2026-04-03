import { z } from 'zod/v4';
import { TgError } from './errors.js';
import { ErrorCode } from './error-codes.js';

const profileSchema = z.string()
  .min(1, 'Profile name cannot be empty')
  .max(64, 'Profile name too long (max 64)')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Profile name: only letters, digits, _ and -');

const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

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
export function validatePagination(opts: { limit?: string; offset?: string }): { limit: number; offset: number } {
  const result = paginationSchema.safeParse(opts);
  if (!result.success) {
    throw new TgError(
      `Invalid pagination: ${result.error.issues[0].message}`,
      ErrorCode.INVALID_INPUT,
    );
  }
  return result.data;
}
