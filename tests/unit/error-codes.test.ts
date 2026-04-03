import { describe, it, expect } from 'vitest';
import { ErrorCode } from '../../src/lib/error-codes.js';

describe('ErrorCode', () => {
  it('exports NOT_AUTHENTICATED constant', () => {
    expect(ErrorCode.NOT_AUTHENTICATED).toBe('NOT_AUTHENTICATED');
  });

  it('exports all expected codes as frozen object', () => {
    expect(Object.isFrozen(ErrorCode)).toBe(true);
    expect(typeof ErrorCode.PEER_NOT_FOUND).toBe('string');
    expect(typeof ErrorCode.TIMEOUT).toBe('string');
    expect(typeof ErrorCode.NOT_A_FORUM).toBe('string');
  });

  it('has values equal to keys (convention)', () => {
    for (const [key, value] of Object.entries(ErrorCode)) {
      expect(value).toBe(key);
    }
  });
});
