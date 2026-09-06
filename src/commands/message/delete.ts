import type { Command } from 'commander';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { withAuth } from '../../lib/with-auth.js';
import { parseMessageIds } from '../../lib/validate.js';
import { formatError } from '../../lib/errors.js';
import type { GlobalOptions, DeleteResult } from '../../lib/types.js';
import { ErrorCode } from '../../lib/error-codes.js';

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

  // Safety: require explicit mode selection, mutually exclusive
  if (!opts.revoke && !opts.forMe) {
    outputError('Specify --revoke (delete for everyone) or --for-me (delete for self)', ErrorCode.DELETE_MODE_REQUIRED);
    return;
  }
  if (opts.revoke && opts.forMe) {
    outputError('--revoke and --for-me are mutually exclusive', ErrorCode.INVALID_OPTIONS);
    return;
  }

  let numericIds: number[];
  try {
    numericIds = parseMessageIds(idsInput);
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
    return;
  }

  const mode: 'revoke' | 'for-me' = opts.revoke ? 'revoke' : 'for-me';

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, chat);

    // Telegram only supports deleting for everyone in channels and supergroups.
    // gramjs silently ignores revoke:false for these peers, so reject before RPC.
    if (mode === 'for-me' && ['Channel', 'ChannelForbidden', 'InputPeerChannel', 'PeerChannel'].includes(entity.className)) {
      outputError('--for-me is not supported in channels or supergroups. Use --revoke to delete for everyone.', ErrorCode.INVALID_OPTIONS);
      return;
    }

    try {
      await client.deleteMessages(entity, numericIds, { revoke: mode === 'revoke' });

      // If no error thrown, all deletions succeeded
      const result: DeleteResult = {
        deleted: numericIds,
        failed: [],
        mode,
      };
      outputSuccess(result);
    } catch (err: unknown) {
      const { message, code } = translateTelegramError(err);
      outputError(message, code);
    }
  });
}
