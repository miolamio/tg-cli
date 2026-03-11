import { TelegramClient, sessions } from 'telegram';

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
 * Execute a function with a connected TelegramClient, ensuring proper cleanup.
 *
 * - Creates the client with the given session string
 * - Sets a 30-second safety timeout that forces process exit if cleanup hangs
 * - Connects, runs the callback, and destroys the client in a finally block
 * - Uses destroy() (not disconnect()) to avoid zombie _updateLoop
 *
 * @param opts - Client connection options
 * @param fn - Async function to execute with the connected client
 * @returns The result of the callback function
 */
export async function withClient<T>(
  opts: ClientOptions,
  fn: (client: TelegramClient) => Promise<T>,
): Promise<T> {
  const session = new StringSession(opts.sessionString);
  const client = new TelegramClient(session, opts.apiId, opts.apiHash, {
    connectionRetries: 3,
    retryDelay: 1000,
    floodSleepThreshold: 60,
  });

  // Safety timeout: force exit if cleanup hangs (gramjs can take up to 30s)
  const timeout = setTimeout(() => {
    client.destroy().catch(() => {});
    process.exit(1);
  }, 30_000);

  try {
    await client.connect();
    const result = await fn(client);
    return result;
  } finally {
    clearTimeout(timeout);
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
