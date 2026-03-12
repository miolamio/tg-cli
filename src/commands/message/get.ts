import type { Command } from 'commander';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import { buildEntityMap } from '../../lib/entity-map.js';
import type { GlobalOptions, MessageItem } from '../../lib/types.js';

/**
 * Action handler for `tg message get <chat> <ids>`.
 *
 * Fetches specific messages by ID from a chat. Accepts comma-separated IDs (max 100).
 * Returns found messages and a list of IDs that were not found.
 *
 * Output shape: { messages: MessageItem[], notFound: number[] }
 */
export async function messageGetAction(
  this: Command,
  chatInput: string,
  idsInput: string,
): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile } = opts;

  // Parse comma-separated message IDs
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
        const entity = await resolveEntity(client, chatInput);

        // getMessages returns array where missing entries are undefined
        const result = await client.getMessages(entity, { ids: numericIds });

        const found: MessageItem[] = [];
        const notFound: number[] = [];

        // Iterate by index to preserve input order
        for (let i = 0; i < numericIds.length; i++) {
          const msg = result[i];
          if (msg) {
            // Use _sender populated by gramjs _finishInit
            const senderEntity = (msg as any)._sender;
            found.push(serializeMessage(msg, senderEntity));
          } else {
            notFound.push(numericIds[i]);
          }
        }

        outputSuccess({ messages: found, notFound });
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
