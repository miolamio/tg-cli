import { lstatSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type Conf from 'conf';
import { sessions } from 'telegram';
import { desktopKeyFingerprint } from './desktop-session.js';
import { SessionStore } from './session-store.js';
import { TgError } from './errors.js';
import { ErrorCode } from './error-codes.js';
import type { TgConfig } from './types.js';

const PROFILE = /^[a-zA-Z0-9_-]{1,64}$/;

function sessionProfiles(config: Conf<TgConfig>): string[] {
  try {
    return readdirSync(join(dirname(config.path), 'sessions'))
      .filter(name => name.toLowerCase().endsWith('.session')).map(name => name.slice(0, -8));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new TgError('Cannot inspect existing CLI sessions.', ErrorCode.SESSION_ERROR);
  }
}

/** Case aliases must not create different metadata for the same APFS session. */
export function assertUnusedDesktopProfile(config: Conf<TgConfig>, profile: string): void {
  const names = [...Object.keys(config.get('profiles') ?? {}), ...sessionProfiles(config)];
  if (profile.toLowerCase() === 'default' || names.some(name => name.toLowerCase() === profile.toLowerCase())) {
    throw new TgError('Desktop import requires a new, non-default profile. Choose an unused --profile name.', ErrorCode.FILE_EXISTS);
  }
}

/** Best-effort duplicate protection within this config directory, before connecting. */
export async function assertNoDesktopDuplicate(config: Conf<TgConfig>, store: SessionStore, fingerprints: string[]): Promise<void> {
  for (const profile of sessionProfiles(config)) {
    try {
      if (!PROFILE.test(profile)) throw new Error();
      const stat = lstatSync(store.filePath(profile));
      if (!stat.isFile() || stat.size > 4096) throw new Error();
      await store.withLock(profile, async value => {
        if (!value) return;
        const session = new sessions.StringSession(value);
        await session.load();
        const key = session.authKey?.getKey();
        if (!key || key.length !== 256) throw new Error();
        if (fingerprints.includes(desktopKeyFingerprint(key))) {
          throw new TgError('This Desktop authorization is already stored in another CLI profile. Use that profile instead.', ErrorCode.FILE_EXISTS);
        }
      });
    } catch (error) {
      if (error instanceof TgError && error.code === ErrorCode.FILE_EXISTS) throw error;
      throw new TgError('Cannot check an existing CLI profile for duplicate authorizations. Stop its daemon or other CLI operations and check its session file, then retry.', ErrorCode.SESSION_ERROR);
    }
  }
}
