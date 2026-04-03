import type { TelegramClient } from 'telegram';
import { createConfig, getCredentialsOrThrow } from './config.js';
import { withClient } from './client.js';
import { SessionStore } from './session-store.js';
import { outputError } from './output.js';
import { formatError } from './errors.js';
import { ErrorCode } from './error-codes.js';
import { validateProfile } from './validate.js';

/**
 * Minimal options required by withAuth.
 * Compatible with GlobalOptions but doesn't force the full interface.
 */
export interface WithAuthOptions {
  profile: string;
  config?: string;
  [key: string]: unknown;
}

/**
 * Execute an authenticated Telegram operation with full boilerplate:
 * config → session store → lock → auth check → credentials → client → callback.
 *
 * Covers 32 of 37 command files. Excluded: auth/login, auth/logout,
 * auth/status, session/export, session/import (they have custom flows).
 *
 * @param opts - Must include `profile` and optional `config`
 * @param fn - Receives a connected TelegramClient
 */
export async function withAuth(
  opts: WithAuthOptions,
  fn: (client: TelegramClient) => Promise<void>,
): Promise<void> {
  try {
    validateProfile(opts.profile);
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
    return;
  }

  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));

  try {
    await store.withLock(opts.profile, async (sessionString) => {
      if (!sessionString) {
        outputError('Not logged in. Run: tg auth login', ErrorCode.NOT_AUTHENTICATED);
        return;
      }

      const { apiId, apiHash } = getCredentialsOrThrow(config);

      await withClient({ apiId, apiHash, sessionString }, async (client) => {
        await fn(client);
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
