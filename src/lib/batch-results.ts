import { translateTelegramError } from './errors.js';
import { outputSuccess } from './output.js';
import type { BatchItemError } from './types.js';
import { markExitFailure } from './daemon/execution-context.js';

/** Preserve the failed input and the original Telegram or application error code. */
export function batchError(input: string, err: unknown, operation?: string): BatchItemError {
  const { message, code } = translateTelegramError(err);
  const transportCode = err != null && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
    ? err.code : undefined;
  return { input, error: operation ? `${operation}: ${message}` : message, code: code === 'UNKNOWN_ERROR' ? (transportCode ?? code) : code };
}

/** Emit one batch result, retaining successes and making failures visible to scripts. */
export function outputBatchResult<T extends object>(data: T, errors: BatchItemError[]): void {
  if (errors.length > 0) markExitFailure();
  outputSuccess({ ...data, partial: errors.length > 0, errors });
}
