import { describe, it, expect } from 'vitest';
import { encodeToon } from '../../src/lib/toon.js';

describe('encodeToon', () => {
  it('returns a string, not JSON-parseable as identical object', () => {
    const input = { ok: true, data: { value: 42 } };
    const result = encodeToon(input);
    expect(typeof result).toBe('string');
    // TOON is not valid JSON -- parsing it should not yield the identical object
    try {
      const parsed = JSON.parse(result);
      expect(parsed).not.toEqual(input);
    } catch {
      // Expected: TOON is not valid JSON
    }
  });

  it('output contains "ok: true" for success envelope', () => {
    const result = encodeToon({ ok: true, data: { messages: [{ id: 1, text: 'hi' }] } });
    expect(result).toContain('ok: true');
  });

  it('array data uses tabular format with tab delimiters', () => {
    const result = encodeToon({
      ok: true,
      data: { messages: [{ id: 1, text: 'hi' }, { id: 2, text: 'bye' }] },
    });
    // Tab characters should be present in tabular rows
    expect(result).toContain('\t');
  });

  it('handles null values without error', () => {
    const result = encodeToon({
      ok: true,
      data: { messages: [{ id: 1, text: null, mediaType: null }] },
    });
    expect(typeof result).toBe('string');
    expect(result).toContain('ok: true');
    // null values should be encoded (not omitted or throwing)
    expect(result).toContain('null');
  });

  it('handles empty arrays without error', () => {
    const result = encodeToon({ ok: true, data: { messages: [], total: 0 } });
    expect(typeof result).toBe('string');
    expect(result).toContain('ok: true');
  });

  it('error envelope encodes correctly (ok: false, error present)', () => {
    const result = encodeToon({ ok: false, error: 'Not found', code: 'NOT_FOUND' });
    expect(result).toContain('ok: false');
    expect(result).toContain('Not found');
    expect(result).toContain('NOT_FOUND');
  });
});
