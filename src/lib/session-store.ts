import { lock } from 'proper-lockfile';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

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
   * No-op if the file does not exist.
   */
  async delete(profile: string): Promise<void> {
    const file = this.filePath(profile);
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }

  /**
   * Get the file path for a given profile's session file.
   */
  filePath(profile: string): string {
    return join(this.dir, `${profile}.session`);
  }
}
