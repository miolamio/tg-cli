import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelegramClient } from 'telegram';
import {
  captureDaemonOutput, getDaemonContext, markExitFailure, runWithDaemonContext, runOutsideDaemonContext,
  type DaemonExecutionContext,
} from '../../src/lib/daemon/execution-context.js';
import {
  outputSuccess, outputError, logStatus, logVerbose,
  setOutputMode, setJsonlMode, setToonMode, setFieldSelection,
} from '../../src/lib/output.js';
import { setQuietMode, setVerboseMode, isQuietMode, isVerboseMode } from '../../src/lib/cli-mode.js';
import { outputBatchResult } from '../../src/lib/batch-results.js';
import { TgError } from '../../src/lib/errors.js';

const forbidden = vi.hoisted(() => ({
  config: vi.fn(() => { throw new Error('Unexpected config access'); }),
  credentials: vi.fn(() => { throw new Error('Unexpected credential access'); }),
  session: vi.fn(() => { throw new Error('Unexpected session access'); }),
  client: vi.fn(() => { throw new Error('Unexpected client creation'); }),
}));
vi.mock('../../src/lib/config.js', () => ({ createConfig: forbidden.config, getCredentialsOrThrow: forbidden.credentials }));
vi.mock('../../src/lib/session-store.js', () => ({ SessionStore: forbidden.session }));
vi.mock('../../src/lib/client.js', () => ({ withClient: forbidden.client }));

import { withAuth } from '../../src/lib/with-auth.js';

function context(profile = 'default'): DaemonExecutionContext {
  return {
    profile,
    signal: new AbortController().signal,
    client: { connect: vi.fn(), destroy: vi.fn() } as unknown as TelegramClient,
    exitCode: 0,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

let originalExitCode: typeof process.exitCode;
beforeEach(() => {
  originalExitCode = process.exitCode;
  process.exitCode = 0;
  vi.clearAllMocks();
});
afterEach(() => {
  process.exitCode = originalExitCode;
  setOutputMode(false);
  setJsonlMode(false);
  setToonMode(false);
  setFieldSelection(null);
  setQuietMode(false);
  setVerboseMode(false);
  vi.restoreAllMocks();
  for (const fn of Object.values(forbidden)) expect(fn).not.toHaveBeenCalled();
});

describe('daemon execution context', () => {
  it('isolates overlapping async outputs and partial failures without touching process streams or exit code', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const first = context('first');
    const second = context('second');
    const firstReady = deferred();
    const secondDone = deferred();

    await Promise.all([
      runWithDaemonContext(first, async () => {
        firstReady.resolve();
        await secondDone.promise;
        expect(getDaemonContext()).toBe(first);
        outputBatchResult({ messages: [{ id: 7 }] }, [{ input: '8', code: 'PEER_ID_INVALID', error: 'Peer not found' }]);
      }),
      runWithDaemonContext(second, async () => {
        await firstReady.promise;
        expect(getDaemonContext()).toBe(second);
        outputSuccess({ id: 'second', nested: { untouched: true } });
        secondDone.resolve();
      }),
    ]);

    expect(first.output).toEqual({ ok: true, data: { messages: [{ id: 7 }], partial: true, errors: [{ input: '8', code: 'PEER_ID_INVALID', error: 'Peer not found' }] } });
    expect(first.exitCode).toBe(1);
    expect(second.output).toEqual({ ok: true, data: { id: 'second', nested: { untouched: true } } });
    expect(second.exitCode).toBe(0);
    expect(process.exitCode).toBe(0);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
    expect(getDaemonContext()).toBeUndefined();
  });

  it.each(['json', 'jsonl', 'toon', 'human'])('captures raw DTOs before %s formatting and field selection', async mode => {
    setJsonlMode(mode === 'jsonl');
    setToonMode(mode === 'toon');
    setOutputMode(mode === 'human');
    setFieldSelection(['id']);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const current = context();
    const dto = { users: [{ id: '123', name: 'Kept' }], total: 1 };
    await runWithDaemonContext(current, () => outputSuccess(dto));
    expect(current.output).toEqual({ ok: true, data: dto });
    expect((current.output as any).data).toBe(dto);
    expect(stdout).not.toHaveBeenCalled();
  });

  it('captures one structured error, retains it across late output, and keeps the daemon alive', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const current = context();
    await runWithDaemonContext(current, async () => {
      outputError('Request expired', 'TIMEOUT');
      await Promise.resolve();
      outputSuccess({ late: true });
    });
    expect(current.output).toEqual({ ok: false, error: 'Request expired', code: 'TIMEOUT' });
    expect(current.exitCode).toBe(1);
    expect(process.exitCode).toBe(0);
    expect(stdout).not.toHaveBeenCalled();
  });

  it('suppresses status and verbose logging even with explicit quiet=false, then restores local logging flags', async () => {
    setVerboseMode(true);
    setQuietMode(false);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    await runWithDaemonContext(context(), async () => {
      expect(isQuietMode()).toBe(true);
      expect(isVerboseMode()).toBe(false);
      logStatus('request progress', false);
      logVerbose('request detail');
    });
    expect(stderr).not.toHaveBeenCalled();
    expect(isQuietMode()).toBe(false);
    expect(isVerboseMode()).toBe(true);
    logStatus('direct progress');
    expect(stderr).toHaveBeenCalledWith('direct progress\n');
  });

  it('restores outer contexts after nesting and rejection', async () => {
    const outer = context('outer');
    const inner = context('inner');
    await runWithDaemonContext(outer, async () => {
      await expect(runWithDaemonContext(inner, async () => {
        await Promise.resolve();
        expect(getDaemonContext()).toBe(inner);
        throw new Error('nested failure');
      })).rejects.toThrow('nested failure');
      expect(getDaemonContext()).toBe(outer);
    });
    expect(getDaemonContext()).toBeUndefined();
    expect(captureDaemonOutput({ ok: true, data: null })).toBe(false);
    markExitFailure();
    expect(process.exitCode).toBe(1);
  });

  it('starts shared async maintenance without retaining the originating request and restores its caller', async () => {
    const current = context();
    const resume = deferred();
    let maintenance!: Promise<DaemonExecutionContext | undefined>;
    await runWithDaemonContext(current, () => {
      maintenance = runOutsideDaemonContext(async () => {
        expect(getDaemonContext()).toBeUndefined();
        await resume.promise;
        return getDaemonContext();
      });
      expect(getDaemonContext()).toBe(current);
      expect(() => runOutsideDaemonContext(() => { throw new Error('maintenance setup failed'); })).toThrow('maintenance setup failed');
      expect(getDaemonContext()).toBe(current);
      outputSuccess({ id: 'original response' });
    });
    resume.resolve();
    await expect(maintenance).resolves.toBeUndefined();
    expect(current.output).toEqual({ ok: true, data: { id: 'original response' } });
    expect(getDaemonContext()).toBeUndefined();
  });
});

describe('withAuth on the persistent daemon client', () => {
  it('reuses the existing client across commands without config, session, connect, destroy, or daemon discovery', async () => {
    const current = context();
    const callback = vi.fn(async client => { expect(client).toBe(current.client); });
    await runWithDaemonContext(current, async () => {
      await withAuth({ profile: 'default', daemon: true, config: '/must/not/read' }, callback);
      await withAuth({ profile: 'default' }, callback);
    });
    expect(callback).toHaveBeenCalledTimes(2);
    expect(current.client.connect).not.toHaveBeenCalled();
    expect(current.client.destroy).not.toHaveBeenCalled();
    expect(current.exitCode).toBe(0);
  });

  it.each([['other', 'INVALID_OPTIONS'], ['', 'INVALID_INPUT'], ['../profile', 'INVALID_INPUT']])('rejects a mismatched or invalid profile %j before callback', async (profile, code) => {
    const current = context();
    const callback = vi.fn();
    await runWithDaemonContext(current, () => withAuth({ profile }, callback));
    expect(callback).not.toHaveBeenCalled();
    expect(current.output).toMatchObject({ ok: false, code });
    expect(current.exitCode).toBe(1);
    expect(process.exitCode).toBe(0);
  });

  it('does not invoke callbacks on already cancelled requests', async () => {
    const current = context();
    current.signal = AbortSignal.abort(new TgError('Request timed out', 'TIMEOUT'));
    const callback = vi.fn();
    await runWithDaemonContext(current, () => withAuth({ profile: 'default' }, callback));
    expect(callback).not.toHaveBeenCalled();
    expect(current.output).toEqual({ ok: false, error: 'Request timed out', code: 'TIMEOUT' });
  });

  it('captures cancellation during the callback and translates RPC errors with the usual codes', async () => {
    const controller = new AbortController();
    const cancelled = context();
    cancelled.signal = controller.signal;
    await runWithDaemonContext(cancelled, () => withAuth({ profile: 'default' }, async () => {
      controller.abort(new TgError('Request timed out', 'TIMEOUT'));
    }));
    expect(cancelled.output).toMatchObject({ ok: false, code: 'TIMEOUT' });

    const denied = context();
    await runWithDaemonContext(denied, () => withAuth({ profile: 'default' }, async () => {
      await Promise.resolve();
      throw { errorMessage: 'CHAT_ADMIN_REQUIRED' };
    }));
    expect(denied.output).toEqual({ ok: false, error: 'Admin privileges required', code: 'CHAT_ADMIN_REQUIRED' });
    expect(process.exitCode).toBe(0);
  });
});
