import type { Command } from 'commander';
import { Api } from 'telegram';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { withAuth } from '../../lib/with-auth.js';
import { resolveEntity } from '../../lib/peer.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { bigIntToString } from '../../lib/serialize.js';
import { ErrorCode } from '../../lib/error-codes.js';
import { getDaemonContext } from '../../lib/daemon/execution-context.js';
import type { GlobalOptions, UserPhotoDownloadResult } from '../../lib/types.js';

/** Download the current visible profile photo; preserve existing files unless --force. */
export async function userDownloadPhotoAction(this: Command, user: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { output: string; force?: boolean };
  const context = getDaemonContext();
  if (context && (!context.cwd || !isAbsolute(context.cwd))) {
    outputError('Profile photo commands through the daemon require an absolute cwd', ErrorCode.INVALID_OPTIONS);
    return;
  }
  const target = resolve(context?.cwd ?? process.cwd(), opts.output);
  if (existsSync(target) && !opts.force) {
    outputError('Output file exists (use --force to overwrite)', ErrorCode.FILE_EXISTS);
    return;
  }
  await withAuth(opts, async client => {
    const entity = await resolveEntity(client, user);
    if (!(entity instanceof Api.User)) {
      outputError('Profile photo download requires a user', ErrorCode.NOT_A_USER);
      return;
    }
    const buffer = await client.downloadProfilePhoto(entity, { isBig: true });
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      outputError('No visible profile photo available', ErrorCode.NO_PROFILE_PHOTO);
      return;
    }
    try {
      // wx also closes the race between the initial existence check and download.
      writeFileSync(target, buffer, { flag: opts.force ? 'w' : 'wx', mode: 0o600 });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        outputError('Output file exists (use --force to overwrite)', ErrorCode.FILE_EXISTS);
        return;
      }
      throw err;
    }
    const data: UserPhotoDownloadResult = { userId: bigIntToString(entity.id)!, path: target, size: buffer.length, profilePhoto: true };
    outputSuccess(data);
  });
}
