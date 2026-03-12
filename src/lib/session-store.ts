import { lock } from 'proper-lockfile';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';

/**
 * Manages session file persistence with proper-lockfile locking.
 * Session files are stored as `<profile>.session` under a `sessions/` subdirectory.
 */
export class SessionStore {
  private readonly dir: string;

  constructor(configDir: string) {
    this.dir = join(configDir, 'sessions');
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  /**
   * Load a session string for the given profile.
   * Returns empty string if the session file does not exist.
   */
  async load(profile: string): Promise<string> {
    const file = this.filePath(profile);
    if (!existsSync(file)) return '';

    const release = await lock(file, { retries: { retries: 3, minTimeout: 100 } });
    try {
      return readFileSync(file, 'utf-8').trim();
    } finally {
      await release();
    }
  }

  /**
   * Save a session string for the given profile.
   * Creates the file if it does not exist (proper-lockfile requires an existing file).
   */
  async save(profile: string, sessionString: string): Promise<void> {
    const file = this.filePath(profile);
    // Create empty file if it doesn't exist (proper-lockfile needs existing file)
    if (!existsSync(file)) {
      writeFileSync(file, '', 'utf-8');
    }
    const release = await lock(file, { retries: { retries: 3, minTimeout: 100 } });
    try {
      writeFileSync(file, sessionString, 'utf-8');
    } finally {
      await release();
    }
  }

  /**
   * Delete the session file for the given profile.
   * Uses file locking to prevent races with concurrent save/load.
   * No-op if the file does not exist.
   */
  async delete(profile: string): Promise<void> {
    const file = this.filePath(profile);
    if (!existsSync(file)) return;

    const release = await lock(file, { retries: { retries: 3, minTimeout: 100 } });
    await release();
    unlinkSync(file);
  }

  /**
   * Delete the session file without acquiring a lock.
   * ONLY call this from within a withLock() callback where the lock is already held.
   * No-op if the file does not exist.
   */
  deleteUnlocked(profile: string): void {
    const file = this.filePath(profile);
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }

  /**
   * Load a session and hold the file lock for the entire callback lifecycle.
   * Prevents concurrent processes from using the same session simultaneously.
   * Returns the callback result. If no session file exists, calls fn with ''.
   */
  async withLock<T>(profile: string, fn: (sessionString: string) => Promise<T>): Promise<T> {
    const file = this.filePath(profile);
    if (!existsSync(file)) return fn('');

    const release = await lock(file, { retries: { retries: 3, minTimeout: 100 } });
    try {
      const session = readFileSync(file, 'utf-8').trim();
      return await fn(session);
    } finally {
      await release();
    }
  }

  /**
   * Get the file path for a given profile's session file.
   */
  filePath(profile: string): string {
    return join(this.dir, `${basename(profile)}.session`);
  }
}
