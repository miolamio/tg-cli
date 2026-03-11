import { FloodWaitError } from './errors.js';

/**
 * Re-export FloodWaitError as RateLimitError for cleaner consumer API.
 * This is the structured error thrown when a FloodWait exceeds the threshold.
 */
export { FloodWaitError as RateLimitError } from './errors.js';

/**
 * Wrap an async function with FloodWait error handling.
 *
 * gramjs auto-sleeps for FloodWait under floodSleepThreshold (default 60s).
 * For waits ABOVE the threshold, gramjs throws an error with a `seconds` property.
 * This wrapper catches those and throws a structured FloodWaitError with retry-after info.
 *
 * @param fn - Async function to execute
 * @param label - Optional label for logging (identifies which API call was rate-limited)
 */
export async function withRateLimit<T>(fn: () => Promise<T>, label?: string): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    // Check if this is a gramjs FloodWaitError (has `seconds` property)
    if (
      err instanceof Error &&
      typeof (err as any).seconds === 'number'
    ) {
      const seconds = (err as any).seconds as number;
      const context = label ? ` (${label})` : '';
      process.stderr.write(`Rate limited${context}: wait ${seconds} seconds\n`);
      throw new FloodWaitError(seconds);
    }
    throw err;
  }
}
