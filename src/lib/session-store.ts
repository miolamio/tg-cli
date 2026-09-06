import { lock } from 'proper-lockfile';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, chmodSync, realpathSync } from 'node:fs';
import { join, basename } from 'node:path';

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/** Register successful teardown that must finish before releasing ownership. */
export type SessionHoldUntil = (cleanup: Promise<unknown>) => void;

/** chmod after create: write/mkdir mode is still masked by umask. */
function chmodPrivate(path: string, mode: number): void {
  try {
    chmodSync(path, mode);
  } catch {
    // Windows and some FS ignore POSIX modes
  }
}

/**
 * Manages session persistence and exclusive ownership for each profile.
 * Every reader, writer and connected client shares `<profile>.session.lock`,
 * including when the session has not been created or was deleted under lock.
 */
export class SessionStore {
  private readonly dir: string;
  private readonly lockDir: string;

  constructor(configDir: string) {
    const dir = join(configDir, 'sessions');
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    chmodPrivate(dir, DIR_MODE);
    // Resolve directory aliases without requiring a session file to exist.
    this.dir = dir;
    this.lockDir = realpathSync(dir);
  }

  /** Acquire profile ownership. Release only after the connected client is destroyed. */
  async acquireLock(profile: string): Promise<() => Promise<void>> {
    return lock(join(this.lockDir, `${basename(profile)}.session`), {
      realpath: false,
      retries: { retries: 3, minTimeout: 100 },
    });
  }

  /** Load a session while holding exclusive profile ownership. */
  async load(profile: string): Promise<string> {
    return this.withLock(profile, async (session) => session);
  }

  /** Persist a session while holding exclusive profile ownership. */
  async save(profile: string, sessionString: string): Promise<void> {
    await this.withLock(profile, async () => this.saveUnlocked(profile, sessionString));
  }

  /** Delete a session before releasing profile ownership. */
  async delete(profile: string): Promise<void> {
    await this.withLock(profile, async () => this.deleteUnlocked(profile));
  }

  /** Read without re-locking. Caller must already own the profile lock. */
  loadUnlocked(profile: string): string {
    const file = this.filePath(profile);
    if (!existsSync(file)) return '';
    chmodPrivate(file, FILE_MODE);
    return readFileSync(file, 'utf-8').trim();
  }

  /** Save without re-locking. ONLY use inside withLock or after acquireLock. */
  saveUnlocked(profile: string, sessionString: string): void {
    const file = this.filePath(profile);
    writeFileSync(file, sessionString, { encoding: 'utf-8', mode: FILE_MODE });
    chmodPrivate(file, FILE_MODE);
  }

  /** Delete without re-locking. ONLY use inside withLock or after acquireLock. */
  deleteUnlocked(profile: string): void {
    const file = this.filePath(profile);
    if (existsSync(file)) unlinkSync(file);
  }

  /**
   * Hold ownership for the callback, even for an absent session. A callback may
   * register asynchronous teardown with holdUntil before returning. Its result
   * still settles promptly, but ownership remains until every teardown succeeds.
   * Rejected teardown keeps the lock until process exit: a failed cleanup does
   * not prove the transport is closed. Cleanup rejections are always handled.
   */
  async withLock<T>(profile: string, fn: (sessionString: string, holdUntil: SessionHoldUntil) => Promise<T>): Promise<T> {
    const release = await this.acquireLock(profile);
    const pending = new Set<Promise<void>>();
    let cleanupFailed = false;
    let callbackDone = false;
    const holdUntil: SessionHoldUntil = (cleanup) => {
      if (callbackDone) throw new Error('Register session cleanup before the callback completes');
      // Attach the rejection handler immediately, including when a caller gives
      // us an already rejected promise. The tracking promise never rejects.
      const tracked = Promise.resolve(cleanup).then(
        () => {},
        () => { cleanupFailed = true; },
      ).then(() => { pending.delete(tracked); });
      pending.add(tracked);
    };
    try {
      return await fn(this.loadUnlocked(profile), holdUntil);
    } finally {
      callbackDone = true;
      if (pending.size === 0) {
        if (!cleanupFailed) await release();
      } else {
        // A timed-out operation can return while its SDK transport is still
        // settling. Never release early and never create an unhandled rejection
        // (or a second CLI output envelope) from background teardown/release.
        void Promise.all(pending).then(async () => {
          if (!cleanupFailed) await release();
        }).catch(() => {});
      }
    }
  }

  /** Get the file path for a profile's session file. */
  filePath(profile: string): string {
    return join(this.dir, `${basename(profile)}.session`);
  }
}
