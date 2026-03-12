import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { SessionStore } from '../../src/lib/session-store.js';

describe('SessionStore', () => {
  let tmpDir: string;
  let store: SessionStore;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `tg-test-${randomUUID()}`);
    store = new SessionStore(tmpDir);
  });

  afterEach(async () => {
    // Small delay to let any proper-lockfile cleanup finish
    await new Promise((r) => setTimeout(r, 50));
    try {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it('creates sessions directory on construction', () => {
    expect(existsSync(join(tmpDir, 'sessions'))).toBe(true);
  });

  it('save then load returns the session string', async () => {
    await store.save('default', 'abc123');
    const loaded = await store.load('default');
    expect(loaded).toBe('abc123');
  });

  it('load returns empty string for missing profile', async () => {
    const loaded = await store.load('nonexistent');
    expect(loaded).toBe('');
  });

  it('delete removes the session file', async () => {
    await store.save('default', 'abc123');
    const filePath = join(tmpDir, 'sessions', 'default.session');
    expect(existsSync(filePath)).toBe(true);

    await store.delete('default');
    expect(existsSync(filePath)).toBe(false);
  });

  it('delete does not throw for missing profile', async () => {
    await expect(store.delete('nonexistent')).resolves.not.toThrow();
  });

  it('save overwrites existing session', async () => {
    await store.save('default', 'first');
    await store.save('default', 'second');
    const loaded = await store.load('default');
    expect(loaded).toBe('second');
  });

  it('sequential save/load with same profile does not throw', async () => {
    await store.save('default', 'session1');
    const v1 = await store.load('default');
    await store.save('default', 'session2');
    const v2 = await store.load('default');
    expect(v1).toBe('session1');
    expect(v2).toBe('session2');
  });

  it('filePath returns correct path', async () => {
    const expectedPath = join(tmpDir, 'sessions', 'myprofile.session');
    await store.save('myprofile', 'data');
    expect(existsSync(expectedPath)).toBe(true);
    expect(readFileSync(expectedPath, 'utf-8')).toBe('data');
  });

  it('filePath sanitizes path traversal attempts', () => {
    const safePath = store.filePath('../../etc/evil');
    expect(safePath).toBe(join(tmpDir, 'sessions', 'evil.session'));
    expect(safePath).not.toContain('..');
  });

  it('delete uses file locking (lockfile is created during delete)', async () => {
    await store.save('locked', 'data');
    const file = store.filePath('locked');
    expect(existsSync(file)).toBe(true);

    // Delete should succeed with locking
    await store.delete('locked');
    expect(existsSync(file)).toBe(false);
  });

  it('withLock returns empty string when session file does not exist', async () => {
    const result = await store.withLock('missing', async (session) => {
      return session;
    });
    expect(result).toBe('');
  });

  it('withLock provides session string and holds lock during callback', async () => {
    await store.save('locked-profile', 'my-session');

    const result = await store.withLock('locked-profile', async (session) => {
      expect(session).toBe('my-session');
      // Session file should still be readable inside lock
      const raw = readFileSync(store.filePath('locked-profile'), 'utf-8');
      expect(raw).toBe('my-session');
      return 'callback-result';
    });

    expect(result).toBe('callback-result');
  });

  it('withLock releases lock after callback completes', async () => {
    await store.save('relock', 'data');

    await store.withLock('relock', async () => {
      // Lock is held here
    });

    // Should be able to acquire lock again
    const loaded = await store.load('relock');
    expect(loaded).toBe('data');
  });

  it('withLock releases lock even if callback throws', async () => {
    await store.save('throw-profile', 'data');

    await expect(
      store.withLock('throw-profile', async () => {
        throw new Error('callback failed');
      }),
    ).rejects.toThrow('callback failed');

    // Lock should be released — load should succeed
    const loaded = await store.load('throw-profile');
    expect(loaded).toBe('data');
  });

  it('deleteUnlocked removes file without acquiring lock', async () => {
    await store.save('unlocked-del', 'data');
    const file = store.filePath('unlocked-del');
    expect(existsSync(file)).toBe(true);

    store.deleteUnlocked('unlocked-del');
    expect(existsSync(file)).toBe(false);
  });

  it('deleteUnlocked is a no-op for missing profile', () => {
    // Should not throw
    store.deleteUnlocked('nonexistent');
  });

  it('deleteUnlocked works inside withLock without deadlock', async () => {
    await store.save('nested-del', 'data');
    const file = store.filePath('nested-del');

    await store.withLock('nested-del', async (session) => {
      expect(session).toBe('data');
      // This would deadlock if it tried to acquire the lock
      store.deleteUnlocked('nested-del');
      expect(existsSync(file)).toBe(false);
    });
  });
});
