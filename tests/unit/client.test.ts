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

import { withClient, createClientForAuth } from '../../src/lib/client.js';

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

  it('sets a safety timeout that is cleared on success', async () => {
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const fn = vi.fn().mockResolvedValue('ok');

    await withClient(opts, fn);

    // setTimeout should have been called with 30_000
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    // clearTimeout should have been called
    expect(clearTimeoutSpy).toHaveBeenCalled();

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
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
