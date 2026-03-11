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

  it('calls connect then runs callback then destroys', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const result = await withClient(opts, fn);

    expect(mockConnect).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(mockClient);
    expect(mockDestroy).toHaveBeenCalledOnce();
    expect(result).toBe('result');
  });

  it('calls destroy even when callback throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('oops'));

    await expect(withClient(opts, fn)).rejects.toThrow('oops');
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
