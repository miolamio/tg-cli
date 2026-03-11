import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the telegram module before importing our code
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockDestroy = vi.fn().mockResolvedValue(undefined);
const mockClient = {
  connect: mockConnect,
  destroy: mockDestroy,
};

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClient),
}));

vi.mock('telegram/sessions', () => ({
  StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
}));

import { withClient, createClientForAuth } from '../../src/lib/client.js';

describe('withClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const opts = { apiId: 123, apiHash: 'abc', sessionString: 'sess' };

  it('calls connect then runs callback then destroys', async () => {
    const fn = vi.fn().mockResolvedValue('result');

    const resultPromise = withClient(opts, fn);
    // Advance past any pending microtasks
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    expect(mockConnect).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(mockClient);
    expect(mockDestroy).toHaveBeenCalledOnce();
    expect(result).toBe('result');
  });

  it('calls destroy even when callback throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('oops'));

    const resultPromise = withClient(opts, fn);
    await vi.advanceTimersByTimeAsync(0);
    await expect(resultPromise).rejects.toThrow('oops');

    expect(mockDestroy).toHaveBeenCalledOnce();
  });

  it('sets a safety timeout that is cleared on success', async () => {
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const fn = vi.fn().mockResolvedValue('ok');

    const resultPromise = withClient(opts, fn);
    await vi.advanceTimersByTimeAsync(0);
    await resultPromise;

    // setTimeout should have been called with 30_000
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    // clearTimeout should have been called
    expect(clearTimeoutSpy).toHaveBeenCalled();
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
