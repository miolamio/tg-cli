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

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
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

  it('filePath returns correct path', () => {
    // Access via save then check file exists at expected path
    const expectedPath = join(tmpDir, 'sessions', 'myprofile.session');
    // We test indirectly by saving and checking the file
    store.save('myprofile', 'data').then(() => {
      expect(existsSync(expectedPath)).toBe(true);
      expect(readFileSync(expectedPath, 'utf-8')).toBe('data');
    });
  });
});
