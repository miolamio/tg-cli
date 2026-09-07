import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the telegram module before importing our code
// vi.hoisted lets us define variables that are accessible inside vi.mock factories
const { mockConnect, mockDestroy, mockClient } = vi.hoisted(() => {
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockDestroy = vi.fn().mockResolvedValue(undefined);
  const mockClient = {
    connect: mockConnect,
    destroy: mockDestroy,
  };
  return { mockConnect, mockDestroy, mockClient };
});

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClient),
  sessions: {
    StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
  },
}));

vi.mock('../../src/lib/errors.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/errors.js')>('../../src/lib/errors.js');
  return actual;
});

import { withClient, createClientForAuth } from '../../src/lib/client.js';
import { TgError } from '../../src/lib/errors.js';

describe('withClient', () => {
  const opts = { apiId: 123, apiHash: 'abc', sessionString: 'sess' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    mockConnect.mockResolvedValue(undefined);
  });

  it('calls connect then runs callback then destroys', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const result = await withClient(opts, fn);

    expect(mockConnect).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(mockClient, expect.any(AbortSignal));
    expect(mockDestroy).toHaveBeenCalledOnce();
    expect(result).toBe('result');
  });

  it('calls destroy even when callback throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('oops'));

    await expect(withClient(opts, fn)).rejects.toThrow('oops');
    expect(mockDestroy).toHaveBeenCalledOnce();
  });

  it('does not execute the action when the SDK exhausts connection retries', async () => {
    mockConnect.mockResolvedValueOnce(false);
    const action = vi.fn();
    await expect(withClient(opts, action)).rejects.toMatchObject({ code: 'CONNECTION_FAILED' });
    expect(action).not.toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalledOnce();
  });

  it('sets a safety timeout that defaults to 120_000 and is cleared on success', async () => {
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const fn = vi.fn().mockResolvedValue('ok');

    await withClient(opts, fn);

    // setTimeout should have been called with 120_000 (default timeout)
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 120_000);
    // clearTimeout should have been called
    expect(clearTimeoutSpy).toHaveBeenCalled();

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it('accepts custom timeout via options parameter', async () => {
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const fn = vi.fn().mockResolvedValue('ok');

    await withClient(opts, fn, { timeout: 60_000 });

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);

    setTimeoutSpy.mockRestore();
  });

  it('rejects with TgError TIMEOUT instead of calling process.exit', async () => {
    vi.useFakeTimers();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // fn that never resolves (simulates a hung operation)
    const fn = vi.fn().mockReturnValue(new Promise(() => {}));

    // Attach catch handler before advancing timers to prevent unhandled rejection
    let caughtError: unknown;
    const promise = withClient(opts, fn).catch((err) => { caughtError = err; });

    // Advance past the 120s default timeout
    await vi.advanceTimersByTimeAsync(120_000);
    await promise;

    expect(caughtError).toBeInstanceOf(TgError);
    expect((caughtError as TgError).message).toBe('Client operation timed out after 120 seconds');
    expect((caughtError as TgError).code).toBe('TIMEOUT');

    // Must NOT call process.exit
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
    vi.useRealTimers();
  });

  it('rejects with TIMEOUT when connect() hangs', async () => {
    vi.useFakeTimers();

    // connect() that never resolves
    mockConnect.mockReturnValue(new Promise(() => {}));

    const fn = vi.fn().mockResolvedValue('should not reach');

    let caughtError: unknown;
    const promise = withClient(opts, fn).catch((err) => { caughtError = err; });

    await vi.advanceTimersByTimeAsync(120_000);
    await promise;

    expect(caughtError).toBeInstanceOf(TgError);
    expect((caughtError as TgError).code).toBe('TIMEOUT');
    // The callback should never have been called since connect hung
    expect(fn).not.toHaveBeenCalled();

    mockConnect.mockResolvedValue(undefined);
    vi.useRealTimers();
  });

  it('uses custom timeout value in error message', async () => {
    vi.useFakeTimers();

    const fn = vi.fn().mockReturnValue(new Promise(() => {}));

    let caughtError: unknown;
    const promise = withClient(opts, fn, { timeout: 30_000 }).catch((err) => { caughtError = err; });

    await vi.advanceTimersByTimeAsync(30_000);
    await promise;

    expect(caughtError).toBeInstanceOf(TgError);
    expect((caughtError as TgError).message).toBe('Client operation timed out after 30 seconds');

    vi.useRealTimers();
  });

  it('retries on network error up to configured retries', async () => {
    const networkErr = new Error('ECONNRESET');
    (networkErr as any).code = 'ECONNRESET';
    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) throw networkErr;
      return 'success';
    });

    const result = await withClient(opts, fn, { retries: 3, retryDelay: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors', async () => {
    const { TgError: ActualTgError } = await import('../../src/lib/errors.js');
    const tgErr = new ActualTgError('Peer not found', 'PEER_NOT_FOUND');
    const fn = vi.fn().mockRejectedValue(tgErr);

    await expect(withClient(opts, fn, { retries: 3, retryDelay: 10 })).rejects.toThrow('Peer not found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting all retries', async () => {
    const networkErr = new Error('ECONNRESET');
    (networkErr as any).code = 'ECONNRESET';
    const fn = vi.fn().mockRejectedValue(networkErr);

    await expect(withClient(opts, fn, { retries: 2, retryDelay: 10 })).rejects.toThrow('ECONNRESET');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('defaults to no retries when retries option is not set', async () => {
    const networkErr = new Error('ECONNRESET');
    (networkErr as any).code = 'ECONNRESET';
    const fn = vi.fn().mockRejectedValue(networkErr);

    await expect(withClient(opts, fn)).rejects.toThrow('ECONNRESET');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry FloodWait errors', async () => {
    const flood = new Error('A wait of 120 seconds is required');
    (flood as any).seconds = 120;
    const fn = vi.fn().mockRejectedValue(flood);

    await expect(withClient(opts, fn, { retries: 3, retryDelay: 10 })).rejects.toThrow(
      'A wait of 120 seconds is required',
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries exactly once when retries is 1', async () => {
    const failure = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    const fn = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue('recovered');
    await expect(withClient(opts, fn, { retries: 1, retryDelay: 0 })).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending backoff at timeout and never invokes a later retry', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
    const result = withClient(opts, fn, { timeout: 10, retries: 2, retryDelay: 80 });
    const rejected = expect(result).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    expect(mockDestroy).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('does not call the callback when connect resolves after the deadline', async () => {
    vi.useFakeTimers();
    let finishConnect!: () => void;
    mockConnect.mockImplementationOnce(() => new Promise<void>((resolve) => { finishConnect = resolve; }));
    const fn = vi.fn().mockResolvedValue('too late');
    const rejected = expect(withClient(opts, fn, { timeout: 10 })).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    finishConnect();
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).not.toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalledTimes(2);
  });

  it('signals an in-flight callback so it can avoid work after the deadline', async () => {
    vi.useFakeTimers();
    const write = vi.fn();
    let resume!: () => void;
    let callbackSignal!: AbortSignal;
    const fn = vi.fn(async (_client, signal: AbortSignal) => {
      callbackSignal = signal;
      await new Promise<void>((resolve) => { resume = resolve; });
      signal.throwIfAborted();
      write();
    });
    const rejected = expect(withClient(opts, fn, { timeout: 10, retries: 2 })).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    expect(callbackSignal.aborted).toBe(true);
    resume();
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('does not retry a late in-flight network rejection', async () => {
    vi.useFakeTimers();
    let fail!: (err: Error) => void;
    const fn = vi.fn(() => new Promise((_resolve, reject) => { fail = reject; }));
    const rejected = expect(withClient(opts, fn, { timeout: 10, retries: 2 })).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    fail(Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
    await vi.advanceTimersByTimeAsync(10000);
    expect(fn).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([{ retries: -1 }, { retries: 0.5 }, { timeout: Infinity }, { timeout: 0 }, { retryDelay: -1 }])(
    'rejects invalid timeout/retry options before connecting: %j', async (options) => {
      await expect(withClient(opts, vi.fn(), options)).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
      expect(mockConnect).not.toHaveBeenCalled();
    },
  );

  it('registers ownership cleanup before starting connect and resolves it after teardown', async () => {
    const holdUntil = vi.fn();
    mockConnect.mockImplementationOnce(async () => {
      expect(holdUntil).toHaveBeenCalledOnce();
    });
    await expect(withClient(opts, async () => 'ok', { holdUntil })).resolves.toBe('ok');
    await expect(holdUntil.mock.calls[0][0]).resolves.toBeUndefined();
    expect(mockDestroy).toHaveBeenCalledOnce();
  });

  it('returns TIMEOUT promptly while ownership cleanup waits for in-flight work and final destroy', async () => {
    vi.useFakeTimers();
    let finishWork!: () => void;
    let cleanupFinished = false;
    let cleanup!: Promise<unknown>;
    const holdUntil = vi.fn((pending: Promise<unknown>) => {
      cleanup = pending;
      pending.then(() => { cleanupFinished = true; });
    });
    const fn = vi.fn(() => new Promise<void>(resolve => { finishWork = resolve; }));
    const rejected = expect(withClient(opts, fn, { timeout: 10, holdUntil })).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    expect(cleanupFinished).toBe(false);
    expect(mockDestroy).toHaveBeenCalledOnce();
    finishWork();
    await cleanup;
    expect(cleanupFinished).toBe(true);
    expect(mockDestroy).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('resolves ownership cleanup even when the operation rejects normally', async () => {
    const holdUntil = vi.fn();
    await expect(withClient(opts, async () => { throw new Error('operation failed'); }, { holdUntil })).rejects.toThrow('operation failed');
    await expect(holdUntil.mock.calls[0][0]).resolves.toBeUndefined();
    expect(mockDestroy).toHaveBeenCalledOnce();
  });

  it('reports failed destruction to the ownership hook', async () => {
    mockDestroy.mockRejectedValueOnce(new Error('teardown failed'));
    const holdUntil = vi.fn();
    await withClient(opts, async () => 'ok', { holdUntil });
    await expect(holdUntil.mock.calls[0][0]).rejects.toThrow('teardown failed');
  });
});

describe('createClientForAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a client instance without connecting', async () => {
    const client = await createClientForAuth(123, 'abc');

    expect(client).toBeDefined();
    // Should NOT have called connect
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
