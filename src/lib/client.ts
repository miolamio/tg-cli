import { TelegramClient, sessions } from 'telegram';
import { TgError } from './errors.js';

const { StringSession } = sessions;

/**
 * Options for creating and connecting a TelegramClient.
 */
export interface ClientOptions {
  apiId: number;
  apiHash: string;
  sessionString: string;
}

/**
 * Options for withClient behavior.
 */
export interface WithClientOptions {
  /** Timeout in milliseconds. Defaults to 120_000 (2 minutes). */
  timeout?: number;
  /** Number of retry attempts. Default 0 (no retry). */
  retries?: number;
  /** Base delay in ms between retries (doubles each attempt). Default 1000. */
  retryDelay?: number;
}

/**
 * Determine if an error is retryable (network/transient errors only).
 * TgError and its subclasses are never retryable (they represent app-level errors).
 * Telegram RPCErrors are not retryable (they represent API rejection).
 */
function isRetryable(err: unknown): boolean {
  if (err instanceof TgError) return false;
  if (err instanceof Error) {
    const code = (err as any).code;
    if (typeof code === 'string' && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN'].includes(code)) {
      return true;
    }
    // gramjs FloodWaitError has .seconds
    if (typeof (err as any).seconds === 'number') return true;
  }
  return false;
}

/**
 * Execute a function with a connected TelegramClient, ensuring proper cleanup.
 *
 * - Creates the client with the given session string
 * - Sets a configurable safety timeout (default 120s) that rejects with a structured TgError
 * - Connects, runs the callback, and destroys the client in a finally block
 * - Uses destroy() (not disconnect()) to avoid zombie _updateLoop
 *
 * @param opts - Client connection options
 * @param fn - Async function to execute with the connected client
 * @param options - Optional behavior config (timeout)
 * @returns The result of the callback function
 */
export async function withClient<T>(
  opts: ClientOptions,
  fn: (client: TelegramClient) => Promise<T>,
  options?: WithClientOptions,
): Promise<T> {
  const timeoutMs = options?.timeout ?? 120_000;
  const timeoutSeconds = Math.round(timeoutMs / 1000);

  const session = new StringSession(opts.sessionString);
  const client = new TelegramClient(session, opts.apiId, opts.apiHash, {
    connectionRetries: 3,
    retryDelay: 1000,
    floodSleepThreshold: 60,
  });

  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      client.destroy().catch(() => {});
      reject(new TgError(`Client operation timed out after ${timeoutSeconds} seconds`, 'TIMEOUT'));
    }, timeoutMs);
  });

  // Prevent unhandled rejection if timeout fires during microtask gap
  // (Promise.race handles this, but detection can race in some runtimes)
  timeoutPromise.catch(() => {});

  try {
    return await Promise.race([
      (async () => {
        await client.connect();
        const maxAttempts = (options?.retries ?? 0) || 1;
        const baseDelay = options?.retryDelay ?? 1000;
        let lastError: unknown;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            return await fn(client);
          } catch (err) {
            lastError = err;
            if (!isRetryable(err) || attempt === maxAttempts) throw err;
            const delay = baseDelay * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
        throw lastError;
      })(),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeoutId!);
    // Use destroy() NOT disconnect() -- avoids zombie _updateLoop
    await client.destroy().catch(() => {});
  }
}

/**
 * Create a TelegramClient for interactive auth flow (login).
 *
 * Returns an unconnected client with an empty StringSession.
 * The caller manages the lifecycle: call client.start() for auth,
 * then client.destroy() when done.
 *
 * @param apiId - Telegram API ID
 * @param apiHash - Telegram API hash
 * @returns Unconnected TelegramClient instance
 */
export async function createClientForAuth(
  apiId: number,
  apiHash: string,
): Promise<TelegramClient> {
  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
    retryDelay: 1000,
    floodSleepThreshold: 60,
  });

  return client;
}
