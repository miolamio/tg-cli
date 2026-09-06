import type { Command } from 'commander';
import { withAuth } from '../../lib/with-auth.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { resolveEntity } from '../../lib/peer.js';
import { serializeMember } from '../../lib/serialize.js';
import { validatePagination } from '../../lib/validate.js';
import { formatError } from '../../lib/errors.js';
import type { GlobalOptions } from '../../lib/types.js';
import type { Api } from 'telegram';

/**
 * Action handler for `tg chat members <chat>`.
 *
 * Lists members of a group or channel with pagination and search.
 * Options: --limit (default 50), --offset (default 0), --search <query>
 */
export async function chatMembersAction(this: Command, chatInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { limit: string; offset: string; search?: string };

  let limit: number;
  let offset: number;
  try {
    ({ limit, offset } = validatePagination({ limit: opts.limit, offset: opts.offset }));
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
    return;
  }

  await withAuth(opts, async (client) => {
    const entity = await resolveEntity(client, chatInput);

    const participants = await client.getParticipants(entity, {
      limit,
      offset,
      search: opts.search,
    });

    const members = participants.map((p: any) => serializeMember(p as Api.User));

    outputSuccess({
      members,
      total: (participants as any).total ?? 0,
    });
  });
}
