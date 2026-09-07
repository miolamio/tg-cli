import type { TelegramClient } from 'telegram';
import { TgError } from './errors.js';
import { ErrorCode } from './error-codes.js';

/** gramjs returns false after failed retries as well as for an existing connection. */
export async function connectOrThrow(client: TelegramClient): Promise<void> {
  const connected = await client.connect();
  if (connected === false && !client.connected) {
    throw new TgError(
      'Could not establish a Telegram connection after retries. Check the transport diagnostics on stderr; use --verbose for connection stages.',
      ErrorCode.CONNECTION_FAILED,
    );
  }
}
