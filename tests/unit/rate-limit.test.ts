import { describe, it, expect, vi } from 'vitest';
import { withRateLimit, RateLimitError } from '../../src/lib/rate-limit.js';

describe('withRateLimit', () => {
  it('passes through successful result', async () => {
    const fn = vi.fn().mockResolvedValue('data');
    const result = await withRateLimit(fn, 'test');
    expect(result).toBe('data');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('catches FloodWaitError and throws structured RateLimitError', async () => {
    // Simulate gramjs FloodWaitError (has seconds property)
    const floodError = new Error('A wait of 120 seconds is required');
    (floodError as any).seconds = 120;

    const fn = vi.fn().mockRejectedValue(floodError);

    await expect(withRateLimit(fn, 'test')).rejects.toThrow(RateLimitError);

    try {
      await withRateLimit(vi.fn().mockRejectedValue(floodError), 'test');
    } catch (e: any) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect(e.seconds).toBe(120);
      expect(e.code).toBe('FLOOD_WAIT');
    }
  });

  it('rethrows non-flood errors as-is', async () => {
    const normalError = new Error('Something broke');
    const fn = vi.fn().mockRejectedValue(normalError);

    await expect(withRateLimit(fn, 'test')).rejects.toThrow('Something broke');
    await expect(withRateLimit(fn, 'test')).rejects.not.toBeInstanceOf(RateLimitError);
  });

  it('rethrows non-Error values as-is', async () => {
    const fn = vi.fn().mockRejectedValue('string error');
    await expect(withRateLimit(fn, 'test')).rejects.toBe('string error');
  });
});
