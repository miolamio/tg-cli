import type { TelegramClient } from 'telegram';
import { createConfig, getCredentialsOrThrow } from './config.js';
import { withClient } from './client.js';
import { SessionStore } from './session-store.js';
import { outputError } from './output.js';
import { formatError } from './errors.js';
import { ErrorCode } from './error-codes.js';
import { validateProfile } from './validate.js';
import { DaemonPaths } from './daemon/pid.js';
import { DaemonServer } from './daemon/server.js';

/**
 * Minimal options required by withAuth.
 * Compatible with GlobalOptions but doesn't force the full interface.
 */
export interface WithAuthOptions {
  profile: string;
  config?: string;
  daemon?: boolean;
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
  const configDir = config.path.replace(/[/\\][^/\\]+$/, '');

  // Daemon mode: start daemon if needed and use its client
  if (opts.daemon) {
    const paths = new DaemonPaths(configDir, opts.profile);

    if (!paths.socketExists()) {
      // Auto-start daemon
      const store = new SessionStore(configDir);
      const sessionString = await store.load(opts.profile);
      if (!sessionString) {
        outputError('Not logged in. Run: tg auth login', ErrorCode.NOT_AUTHENTICATED);
        return;
      }

      const { apiId, apiHash } = await getCredentialsOrThrow(config);

      try {
        const server = new DaemonServer(paths, { apiId, apiHash, sessionString });
        await server.start();

        const client = server.getClient();
        if (client) await fn(client);
      } catch (err: unknown) {
        const { message, code } = formatError(err);
        outputError(message, code);
      }
      return;
    }

    // Daemon already running — fall through to direct connection
    // (daemon proxy for arbitrary callbacks is not implemented yet)
  }

  // Direct connection (current behavior)
  const store = new SessionStore(configDir);

  try {
    await store.withLock(opts.profile, async (sessionString) => {
      if (!sessionString) {
        outputError('Not logged in. Run: tg auth login', ErrorCode.NOT_AUTHENTICATED);
        return;
      }

      const { apiId, apiHash } = await getCredentialsOrThrow(config);

      await withClient({ apiId, apiHash, sessionString }, async (client) => {
        await fn(client);
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
