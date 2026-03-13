import type { Command } from 'commander';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import type { GlobalOptions, DeleteResult } from '../../lib/types.js';

/**
 * Action handler for `tg message delete <chat> <ids>`.
 *
 * Deletes messages in a chat. Requires explicit --revoke (delete for everyone)
 * or --for-me (delete for self only) flag for safety.
 *
 * Accepts comma-separated IDs (max 100). Returns DeleteResult shape.
 * Uses translateTelegramError for Telegram-specific permission errors.
 */
export async function messageDeleteAction(this: Command, chat: string, idsInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { revoke?: boolean; forMe?: boolean };
  const { profile } = opts;

  // Safety: require explicit mode selection
  if (!opts.revoke && !opts.forMe) {
    outputError('Specify --revoke (delete for everyone) or --for-me (delete for self)', 'DELETE_MODE_REQUIRED');
    return;
  }

  // Parse comma-separated message IDs (same pattern as get.ts)
  const parts = idsInput.split(',').map(s => s.trim());
  const numericIds: number[] = [];
  const invalid: string[] = [];

  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num <= 0) {
      invalid.push(part);
    } else {
      numericIds.push(num);
    }
  }

  if (invalid.length > 0) {
    outputError(`Invalid message IDs: ${invalid.join(', ')}`, 'INVALID_MSG_ID');
    return;
  }

  if (numericIds.length === 0) {
    outputError('No message IDs provided', 'INVALID_MSG_ID');
    return;
  }

  if (numericIds.length > 100) {
    outputError(`Maximum 100 IDs per request (got ${numericIds.length})`, 'TOO_MANY_IDS');
    return;
  }

  const mode: 'revoke' | 'for-me' = opts.revoke ? 'revoke' : 'for-me';

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
        const entity = await resolveEntity(client, chat);

        await client.deleteMessages(entity, numericIds, { revoke: mode === 'revoke' });

        // If no error thrown, all deletions succeeded
        const result: DeleteResult = {
          deleted: numericIds,
          failed: [],
          mode,
        };
        outputSuccess(result);
      });
    });
  } catch (err: unknown) {
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
