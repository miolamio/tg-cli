import type { Command } from 'commander';
import { Api } from 'telegram';
import { withAuth } from '../../lib/with-auth.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { extractInviteHash } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Action handler for `tg chat invite-info <link>`.
 *
 * Checks invite link info without joining.
 * Handles three result types:
 * - ChatInviteAlready: already a member
 * - ChatInvite: preview info (title, about, member count)
 * - ChatInvitePeek: temporary peek with expiry
 */
export async function chatInviteInfoAction(this: Command, link: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;

  await withAuth(opts, async (client) => {
    const hash = extractInviteHash(link);
    const result = await client.invoke(
      new Api.messages.CheckChatInvite({ hash }),
    );

    if (result instanceof Api.ChatInviteAlready) {
      const chat = (result as any).chat;
      outputSuccess({
        alreadyMember: true,
        chat: {
          id: bigIntToString(chat?.id),
          title: chat?.title ?? '',
        },
      });
    } else if (result instanceof Api.ChatInvitePeek) {
      const chat = (result as any).chat;
      outputSuccess({
        alreadyMember: false,
        chat: {
          id: bigIntToString(chat?.id),
          title: chat?.title ?? '',
        },
        expires: new Date((result as any).expires * 1000).toISOString(),
      });
    } else if (result instanceof Api.ChatInvite) {
      outputSuccess({
        alreadyMember: false,
        title: (result as any).title,
        about: (result as any).about ?? null,
        participantsCount: (result as any).participantsCount ?? 0,
        channel: !!(result as any).channel,
        broadcast: !!(result as any).broadcast,
      });
    } else {
      outputError('Unknown invite result type', 'UNKNOWN_INVITE_TYPE');
      return;
    }
  });
}
