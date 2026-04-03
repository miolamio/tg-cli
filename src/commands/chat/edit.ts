import type { Command } from 'commander';
import { Api } from 'telegram';
import { withAuth } from '../../lib/with-auth.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { resolveEntity } from '../../lib/peer.js';
import { bigIntToString } from '../../lib/serialize.js';
import { ErrorCode } from '../../lib/error-codes.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Action handler for `tg chat edit <chat>`.
 *
 * Edits a chat's title and/or description.
 * At least one of --title or --description is required.
 */
export async function chatEditAction(this: Command, chatInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { title?: string; description?: string };

  if (!opts.title && !opts.description) {
    outputError('At least one of --title or --description is required', ErrorCode.INVALID_INPUT);
    return;
  }

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, chatInput);

    if (entity instanceof Api.Channel) {
      if (opts.title) {
        await client.invoke(new Api.channels.EditTitle({ channel: entity, title: opts.title }));
      }
      if (opts.description) {
        await client.invoke(new Api.channels.EditAbout({ channel: entity, about: opts.description }));
      }
    } else if (entity instanceof Api.Chat) {
      if (opts.title) {
        await client.invoke(new Api.messages.EditChatTitle({ chatId: entity.id, title: opts.title }));
      }
      if (opts.description) {
        await client.invoke(new Api.messages.EditChatAbout({ peer: entity, about: opts.description }));
      }
    } else {
      outputError('Cannot edit a user chat', ErrorCode.INVALID_CHAT_TYPE);
      return;
    }

    outputSuccess({
      chatId: bigIntToString((entity as any).id),
      updated: true,
      title: opts.title ?? null,
      description: opts.description ?? null,
    });
  });
}
