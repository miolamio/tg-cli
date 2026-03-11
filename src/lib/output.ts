import type { SuccessEnvelope, ErrorEnvelope } from './types.js';

/**
 * Write a success envelope to stdout as JSON.
 * Data output always goes to stdout for agent consumption.
 */
export function outputSuccess<T>(data: T): void {
  const envelope: SuccessEnvelope<T> = { ok: true, data };
  process.stdout.write(JSON.stringify(envelope) + '\n');
}

/**
 * Write an error envelope to stdout as JSON.
 * Error envelopes go to stdout so agents can parse them consistently.
 */
export function outputError(error: string, code?: string): void {
  const envelope: ErrorEnvelope = { ok: false, error, ...(code && { code }) };
  process.stdout.write(JSON.stringify(envelope) + '\n');
}

/**
 * Write a status/progress message to stderr.
 * Suppressed when quiet mode is enabled.
 * NEVER writes to stdout -- stdout is reserved for data output only.
 */
export function logStatus(message: string, quiet: boolean = false): void {
  if (!quiet) {
    process.stderr.write(message + '\n');
  }
}
