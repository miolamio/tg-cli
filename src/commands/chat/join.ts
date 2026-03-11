import type { Command } from 'commander';
import { Api } from 'telegram';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
import { resolveEntity, extractInviteHash } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Detect if a target string looks like an invite link (contains /+ or /joinchat/).
 */
function isInviteLink(target: string): boolean {
  return /(?:t\.me|telegram\.me)\/(?:joinchat\/|\+)/.test(target);
}

/**
 * Action handler for `tg chat join <target>`.
 *
 * Joins a group or channel by username or invite link.
 * - Username/ID: resolves entity, calls JoinChannel
 * - Invite link: extracts hash, calls ImportChatInvite
 */
export async function chatJoinAction(this: Command, target: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile } = opts;

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
        if (isInviteLink(target)) {
          // Join via invite link
          const hash = extractInviteHash(target);
          try {
            const result = await client.invoke(
              new Api.messages.ImportChatInvite({ hash }),
            );
            const chat = (result as any)?.chats?.[0];
            outputSuccess({
              joined: true,
              chat: chat ? {
                id: bigIntToString(chat.id),
                title: chat.title ?? '',
              } : { id: '', title: '' },
            });
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            if (errMsg.includes('USER_ALREADY_PARTICIPANT')) {
              outputError('You are already a member of this chat', 'USER_ALREADY_PARTICIPANT');
              return;
            }
            throw err;
          }
        } else {
          // Join by username/ID
          const entity = await resolveEntity(client, target);
          try {
            const inputEntity = await client.getInputEntity(entity);
            await client.invoke(
              new Api.channels.JoinChannel({ channel: inputEntity as any }),
            );
            outputSuccess({
              joined: true,
              chat: {
                id: bigIntToString((entity as any).id),
                title: (entity as any).title ?? '',
              },
            });
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            if (errMsg.includes('USER_ALREADY_PARTICIPANT')) {
              outputError('You are already a member of this chat', 'USER_ALREADY_PARTICIPANT');
              return;
            }
            if (errMsg.includes('CHANNELS_TOO_MUCH')) {
              outputError('Cannot join: you have reached the channel/supergroup limit', 'CHANNELS_TOO_MUCH');
              return;
            }
            throw err;
          }
        }
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
