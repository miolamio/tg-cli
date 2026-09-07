import { TelegramClient, sessions } from 'telegram';
import { TgError } from './errors.js';
import { ErrorCode } from './error-codes.js';
import { createGramjsLogger } from './gramjs-logger.js';
import { installClientErrorDiagnostics } from './transport-diagnostics.js';
import { connectionOptions } from './connection-options.js';
import type { Transport } from './types.js';
import { connectOrThrow } from './connect.js';

const { StringSession } = sessions;

/**
 * Options for creating and connecting a TelegramClient.
 */
export interface ClientOptions {
  apiId: number;
  apiHash: string;
  sessionString: string;
  transport?: Transport;
}

/**
 * Options for withClient behavior.
 */
export interface WithClientOptions {
  /** Timeout in milliseconds. Defaults to 120_000 (2 minutes). */
  timeout?: number;
  /** Additional attempts after a retryable failure. Default 0 (one attempt). */
  retries?: number;
  /** Base delay in ms between retries (doubles each attempt). Default 1000. */
  retryDelay?: number;
  /** Keep session ownership until all started work and teardown have finished. */
  holdUntil?: (cleanup: Promise<unknown>) => void;
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
  }
  return false;
}

/** A retry wait owns its timer and removes it as soon as the deadline fires. */
function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

/**
 * Execute a function with a connected TelegramClient, ensuring proper cleanup.
 *
 * - Creates the client with the given session string
 * - Sets a configurable safety timeout (default 120s) that rejects with a structured TgError
 * - Connects, runs the callback, and destroys the client in a finally block
 * - Uses destroy() (not disconnect()) to avoid zombie _updateLoop
 * - Aborts the callback signal at the deadline and cancels pending retries.
 *   An already running callback must observe the signal before further work;
 *   JavaScript cannot forcibly cancel an arbitrary promise or undo an RPC.
 *   A late completion is destroyed again. When holdUntil is supplied, session
 *   ownership remains held until that cleanup succeeds, even after TIMEOUT.
 *
 * @param opts - Client connection options
 * @param fn - Async function to execute with the connected client
 * @param options - Optional behavior config (timeout)
 * @returns The result of the callback function
 */
export async function withClient<T>(
  opts: ClientOptions,
  fn: (client: TelegramClient, signal: AbortSignal) => Promise<T>,
  options?: WithClientOptions,
): Promise<T> {
  const timeoutMs = options?.timeout ?? 120_000;
  const timeoutSeconds = Math.round(timeoutMs / 1000);
  const retries = options?.retries ?? 0;
  const baseDelay = options?.retryDelay ?? 1000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647
    || !Number.isSafeInteger(retries) || retries < 0
    || !Number.isFinite(baseDelay) || baseDelay < 0 || baseDelay > 2_147_483_647) {
    throw new TgError('Invalid client timeout or retry options', ErrorCode.INVALID_OPTIONS);
  }

  const session = new StringSession(opts.sessionString);
  const logger = createGramjsLogger([opts.apiHash, opts.sessionString]);
  const client = new TelegramClient(session, opts.apiId, opts.apiHash, {
    connectionRetries: 3,
    retryDelay: 1000,
    floodSleepThreshold: 60,
    baseLogger: logger,
    ...connectionOptions(opts.transport),
  });
  installClientErrorDiagnostics(client, logger);

  const cancellation = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new TgError(`Client operation timed out after ${timeoutSeconds} seconds`, ErrorCode.TIMEOUT);
      cancellation.abort(error);
      reject(error);
    }, timeoutMs);
  });

  // Prevent unhandled rejection if timeout fires during microtask gap
  // (Promise.race handles this, but detection can race in some runtimes)
  timeoutPromise.catch(() => {});

  // Defer execution to a microtask so the ownership hook is registered before
  // connect or user work starts. Operation failure does not mean cleanup failed.
  const operation = Promise.resolve().then(async () => {
    await connectOrThrow(client);
    for (let attempt = 0; ; attempt++) {
      cancellation.signal.throwIfAborted();
      try {
        const result = await fn(client, cancellation.signal);
        cancellation.signal.throwIfAborted();
        return result;
      } catch (err) {
        cancellation.signal.throwIfAborted();
        if (!isRetryable(err) || attempt >= retries) throw err;
        const backoff = Math.min(baseDelay * Math.pow(2, attempt), 2_147_483_647);
        await waitForRetry(backoff, cancellation.signal);
      }
    }
  });

  type TeardownResult = { ok: true } | { ok: false; error: unknown };
  let finishTeardown!: (result: TeardownResult) => void;
  const teardown = new Promise<TeardownResult>(resolve => { finishTeardown = resolve; });
  const cleanup = Promise.all([operation.then(() => {}, () => {}), teardown]).then(async ([, result]) => {
    // An SDK connect or callback can outlive the immediate timeout teardown.
    // Final destruction runs after every started operation has settled.
    if (cancellation.signal.aborted) await client.destroy();
    if (!result.ok) throw result.error;
  });
  // Consumers without an ownership hook still get late cleanup, without an
  // unhandled rejection. A lock owner receives the original success/failure.
  cleanup.catch(() => {});
  options?.holdUntil?.(cleanup);

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
    // Use destroy() NOT disconnect() -- avoids zombie _updateLoop
    try {
      await client.destroy();
      finishTeardown({ ok: true });
    } catch (error) {
      finishTeardown({ ok: false, error });
    }
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
  transport: Transport = 'tcp',
): Promise<TelegramClient> {
  const session = new StringSession('');
  const logger = createGramjsLogger([apiHash]);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
    retryDelay: 1000,
    floodSleepThreshold: 60,
    baseLogger: logger,
    ...connectionOptions(transport),
  });
  installClientErrorDiagnostics(client, logger);

  return client;
}
