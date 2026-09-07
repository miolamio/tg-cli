import type { Command } from 'commander';
import { Api } from 'telegram';
import { CustomFile } from 'telegram/client/uploads.js';
import { readFileSync, statSync } from 'node:fs';
import { resolve, basename, isAbsolute } from 'node:path';
import { withAuth } from '../../lib/with-auth.js';
import { resolveEntity } from '../../lib/peer.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { bigIntToString } from '../../lib/serialize.js';
import { ErrorCode } from '../../lib/error-codes.js';
import { getDaemonContext } from '../../lib/daemon/execution-context.js';
import type { GlobalOptions, ContactPhotoResult } from '../../lib/types.js';

/** Set a personal contact photo visible only to the current account. */
export async function contactSetPhotoAction(this: Command, user: string, file: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const context = getDaemonContext();
  if (context && (!context.cwd || !isAbsolute(context.cwd))) {
    outputError('Contact photo commands through the daemon require an absolute cwd', ErrorCode.INVALID_OPTIONS);
    return;
  }
  const filePath = resolve(context?.cwd ?? process.cwd(), file);
  let bytes: Buffer;
  try {
    if (!statSync(filePath).isFile()) throw new Error('Not a regular file');
    bytes = readFileSync(filePath);
  } catch {
    outputError('Photo must be a readable regular file', ErrorCode.FILE_NOT_FOUND);
    return;
  }
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!jpeg && !png) {
    outputError('Photo must contain a JPEG or PNG image', ErrorCode.INVALID_PHOTO);
    return;
  }
  await withAuth(opts, async client => {
    const entity = await resolveEntity(client, user);
    if (!(entity instanceof Api.User)) {
      outputError('Personal photos require a user contact', ErrorCode.NOT_A_USER);
      return;
    }
    const uploaded = await client.uploadFile({ file: new CustomFile(basename(filePath), bytes.length, filePath, bytes), workers: 1 });
    const result = await client.invoke(new Api.photos.UploadContactProfilePhoto({
      userId: entity, file: uploaded, save: true, suggest: false,
    }));
    const photoId = bigIntToString(result.photo?.id);
    if (!photoId) {
      outputError('Telegram did not return the personal photo result; verify before retrying', ErrorCode.PHOTO_RESULT_UNAVAILABLE);
      return;
    }
    const data: ContactPhotoResult = { userId: bigIntToString(entity.id)!, photoId, personal: true, size: bytes.length };
    outputSuccess(data);
  });
}
