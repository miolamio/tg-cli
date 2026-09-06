import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lock } from 'proper-lockfile';
import { SessionStore } from '../../src/lib/session-store.js';
import { withClient } from '../../src/lib/client.js';

const mocks = vi.hoisted(() => ({ connect: vi.fn(), destroy: vi.fn() }));
vi.mock('telegram', () => ({
  sessions: { StringSession: class {} },
  TelegramClient: class { connect = mocks.connect; destroy = mocks.destroy; },
}));

/** Independent composition checks: real profile lock, controlled SDK lifecycle. */
describe('deferred ownership after request completion', () => {
  let dir: string;
  let store: SessionStore;
  const releases: Array<() => Promise<void>> = [];
  const opts = { apiId: 1, apiHash: 'synthetic', sessionString: 'synthetic' };

  beforeEach(async () => {
    mocks.connect.mockReset().mockResolvedValue(undefined);
    mocks.destroy.mockReset().mockResolvedValue(undefined);
    dir = await mkdtemp(join(tmpdir(), 'tg-hold-cross-'));
    store = new SessionStore(dir);
    const acquire = store.acquireLock.bind(store);
    vi.spyOn(store, 'acquireLock').mockImplementation(async profile => {
      const release = await acquire(profile);
      releases.push(release);
      return release;
    });
  });

  afterEach(async () => {
    // Explicit fixture disposal also handles the intentionally fail-closed case;
    // never remove a directory while proper-lockfile still has its heartbeat.
    for (const release of releases.splice(0)) await release().catch(() => {});
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  async function probe() {
    const release = await lock(store.filePath('fixture'), { realpath: false, retries: 0 });
    await release();
  }

  it('an operation failure with successful cleanup releases ownership', async () => {
    const operation = store.withLock('fixture', async (_session, holdUntil) =>
      withClient(opts, async () => { throw new Error('Read failed'); }, { holdUntil }));
    await expect(operation).rejects.toThrow('Read failed');
    await vi.waitFor(async () => { await probe(); });
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it('an already rejected teardown fails closed without losing the original operation result', async () => {
    const result = await store.withLock('fixture', async (_session, holdUntil) => {
      holdUntil(Promise.reject(new Error('Teardown failed')));
      return 'result';
    });
    expect(result).toBe('result');
    await expect(probe()).rejects.toMatchObject({ code: 'ELOCKED' });
  });

  it('timeout retains ownership across late callback failure and its final destruction', async () => {
    let failOperation!: (error: Error) => void;
    let finishDestroy!: () => void;
    const inFlight = new Promise<never>((_resolve, reject) => { failOperation = reject; });
    const finalDestroy = new Promise<void>(resolve => { finishDestroy = resolve; });
    mocks.destroy.mockResolvedValueOnce(undefined).mockReturnValueOnce(finalDestroy);
    const operation = store.withLock('fixture', async (_session, holdUntil) =>
      withClient(opts, async () => inFlight, { timeout: 20, holdUntil }));
    try {
      await expect(operation).rejects.toMatchObject({ code: 'TIMEOUT' });
      await expect(probe()).rejects.toMatchObject({ code: 'ELOCKED' });
      failOperation(new Error('Late read failure'));
      await vi.waitFor(() => expect(mocks.destroy).toHaveBeenCalledTimes(2));
      await expect(probe()).rejects.toMatchObject({ code: 'ELOCKED' });
      finishDestroy();
      await vi.waitFor(async () => { await probe(); });
    } finally {
      failOperation(new Error('Fixture teardown'));
      finishDestroy();
    }
  });

  it('multiple cleanup holds release only after the last successful teardown', async () => {
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const first = new Promise<void>(resolve => { finishFirst = resolve; });
    const second = new Promise<void>(resolve => { finishSecond = resolve; });
    try {
      await store.withLock('fixture', async (_session, holdUntil) => {
        holdUntil(Promise.resolve());
        holdUntil(first);
        holdUntil(second);
      });
      finishFirst();
      await expect(probe()).rejects.toMatchObject({ code: 'ELOCKED' });
      finishSecond();
      await vi.waitFor(async () => { await probe(); });
    } finally {
      finishFirst();
      finishSecond();
    }
  });
});
