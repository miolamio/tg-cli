import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { bigIntToString } from '../../lib/serialize.js';
import type { GlobalOptions, BlockedListItem, BlockedListResult } from '../../lib/types.js';

/**
 * Action handler for `tg user blocked`.
 *
 * Lists blocked users with pagination support.
 * Handles both contacts.Blocked (full list, no .count) and
 * contacts.BlockedSlice (paginated, has .count) response types.
 *
 * Returns BlockedListResult { users: BlockedListItem[], total: number }.
 */
export async function userBlockedAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { limit?: string; offset?: string };
  const { profile } = opts;

  const limit = parseInt(opts.limit ?? '50', 10);
  const offset = parseInt(opts.offset ?? '0', 10);

  if (isNaN(limit) || isNaN(offset)) {
    outputError('Invalid limit or offset: must be a number', 'INVALID_INPUT');
    return;
  }

  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));

  try {
    await store.withLock(profile, async (sessionString) => {
      if (!sessionString) {
        outputError('Not logged in. Run: tg auth login', 'NOT_AUTHENTICATED');
        return;
      }

      const { apiId, apiHash } = getCredentialsOrThrow(config);

      await withClient({ apiId, apiHash, sessionString }, async (client) => {
        const result = await client.invoke(
          new Api.contacts.GetBlocked({ offset, limit }),
        );

        const total: number = (result as any).count ?? (result as any).blocked?.length ?? 0;

        // Build userMap from result.users keyed by stringified user ID
        const userMap = new Map<string, any>();
        for (const user of (result as any).users ?? []) {
          userMap.set(bigIntToString(user.id), user);
        }

        // Map blocked entries to BlockedListItem
        const users: BlockedListItem[] = [];
        for (const entry of (result as any).blocked ?? []) {
          const userId = bigIntToString(entry.peerId.userId);
          const user = userMap.get(userId);
          users.push({
            id: userId,
            firstName: user?.firstName ?? null,
            lastName: user?.lastName ?? null,
            username: user?.username ?? null,
            isBot: !!user?.bot,
          });
        }

        const output: BlockedListResult = { users, total };
        outputSuccess(output);
      });
    });
  } catch (err: unknown) {
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
