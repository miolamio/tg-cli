import pc from 'picocolors';
import type { SuccessEnvelope, ErrorEnvelope } from './types.js';
import { formatData } from './format.js';

/** Current output mode: false = JSON (default), true = human-readable. */
let _humanMode = false;

/**
 * Set the output mode for all subsequent output calls.
 * Called by the preAction hook in tg.ts based on --human / --no-json flags.
 */
export function setOutputMode(human: boolean): void {
  _humanMode = human;
}

/**
 * Get the current output mode.
 */
export function getOutputMode(): boolean {
  return _humanMode;
}

/**
 * Write a success response to stdout.
 * In JSON mode (default): writes JSON envelope { ok: true, data: ... }
 * In human mode: writes formatted human-readable text via formatData.
 */
export function outputSuccess<T>(data: T): void {
  if (_humanMode) {
    const formatted = formatData(data);
    process.stdout.write(formatted + '\n');
  } else {
    const envelope: SuccessEnvelope<T> = { ok: true, data };
    process.stdout.write(JSON.stringify(envelope) + '\n');
  }
}

/**
 * Write an error response.
 * In JSON mode (default): writes JSON envelope { ok: false, error: ... } to stdout.
 * In human mode: writes colored error text to stderr.
 */
export function outputError(error: string, code?: string): void {
  if (_humanMode) {
    const prefix = pc.red('Error: ');
    const suffix = code ? pc.dim(` [${code}]`) : '';
    process.stderr.write(prefix + error + suffix + '\n');
  } else {
    const envelope: ErrorEnvelope = { ok: false, error, ...(code && { code }) };
    process.stdout.write(JSON.stringify(envelope) + '\n');
  }
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
