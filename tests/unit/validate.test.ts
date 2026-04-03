import { describe, it, expect } from 'vitest';
import { validateProfile, validatePagination } from '../../src/lib/validate.js';

describe('validateProfile', () => {
  it('accepts valid profile names', () => {
    expect(validateProfile('default')).toBe('default');
    expect(validateProfile('my-profile_01')).toBe('my-profile_01');
  });

  it('rejects empty string', () => {
    expect(() => validateProfile('')).toThrow();
  });

  it('rejects path traversal attempts', () => {
    expect(() => validateProfile('../etc/passwd')).toThrow();
    expect(() => validateProfile('foo/bar')).toThrow();
  });

  it('rejects special characters', () => {
    expect(() => validateProfile('hello world')).toThrow();
    expect(() => validateProfile('name;rm -rf')).toThrow();
  });

  it('rejects names longer than 64 characters', () => {
    expect(() => validateProfile('a'.repeat(65))).toThrow();
  });
});

describe('validatePagination', () => {
  it('returns parsed limit and offset with defaults', () => {
    expect(validatePagination({})).toEqual({ limit: 50, offset: 0 });
  });

  it('parses string values', () => {
    expect(validatePagination({ limit: '20', offset: '10' })).toEqual({ limit: 20, offset: 10 });
  });

  it('rejects negative limit', () => {
    expect(() => validatePagination({ limit: '-1' })).toThrow();
  });

  it('rejects zero limit', () => {
    expect(() => validatePagination({ limit: '0' })).toThrow();
  });

  it('rejects negative offset', () => {
    expect(() => validatePagination({ offset: '-5' })).toThrow();
  });

  it('rejects non-numeric values', () => {
    expect(() => validatePagination({ limit: 'abc' })).toThrow();
  });
});
