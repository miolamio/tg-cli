import { describe, it, expect } from 'vitest';
import { validateProfile, validatePagination, parseMessageIds, parseMessageId, parseIsoDate, parseTopicId, parseIntegerOption, MAX_TL_INT } from '../../src/lib/validate.js';
import { ErrorCode } from '../../src/lib/error-codes.js';

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

  it('uses a custom default limit', () => {
    expect(validatePagination({}, 20)).toEqual({ limit: 20, offset: 0 });
  });
});

describe('parseMessageIds', () => {
  it('parses a single id', () => {
    expect(parseMessageIds('42')).toEqual([42]);
  });

  it('parses comma-separated ids', () => {
    expect(parseMessageIds('1, 2, 3')).toEqual([1, 2, 3]);
  });

  it('rejects 12abc (no silent parseInt truncation)', () => {
    try {
      parseMessageIds('12abc');
      throw new Error('expected throw');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.INVALID_MESSAGE_ID);
    }
  });

  it('rejects zero and negative', () => {
    expect(() => parseMessageIds('0')).toThrow();
    expect(() => parseMessageIds('-1')).toThrow();
  });

  it('rejects empty input', () => {
    try {
      parseMessageIds('');
      throw new Error('expected throw');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.INVALID_MESSAGE_ID);
    }
  });

  it('rejects more than max ids', () => {
    const input = Array.from({ length: 101 }, (_, i) => String(i + 1)).join(',');
    try {
      parseMessageIds(input);
      throw new Error('expected throw');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.TOO_MANY_IDS);
    }
  });
});

describe('parseIsoDate', () => {
  it('parses ISO 8601', () => {
    expect(parseIsoDate('2024-03-12T00:00:00Z', '--since').toISOString()).toBe('2024-03-12T00:00:00.000Z');
  });

  it('rejects garbage', () => {
    try {
      parseIsoDate('not-a-date', '--since');
      throw new Error('expected throw');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.message).toContain('--since');
    }
  });
});

describe('parseMessageId', () => {
  it.each(['1,', ',1', '1,,', '1,2'])('rejects list syntax for a single ID: %s', (input) => {
    expect(() => parseMessageId(input)).toThrow();
  });
  it('returns a single positive id', () => {
    expect(parseMessageId('7')).toBe(7);
  });

  it('rejects a list', () => {
    expect(() => parseMessageId('1,2')).toThrow();
  });
});

describe('parseTopicId', () => {
  it('parses a positive integer', () => {
    expect(parseTopicId('12')).toBe(12);
  });

  it('rejects parseInt truncation like 12x', () => {
    try {
      parseTopicId('12x');
      throw new Error('expected throw');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.INVALID_TOPIC_ID);
    }
  });

  it('rejects zero, negative, and floats', () => {
    expect(() => parseTopicId('0')).toThrow();
    expect(() => parseTopicId('-1')).toThrow();
    expect(() => parseTopicId('1.5')).toThrow();
  });
});

describe('integer boundaries', () => {
  it.each(['12junk', '0', '-1', '1.5', '1e3', '2147483648', '9007199254740993', '9'.repeat(400)])('rejects unsafe message/topic ID %s', (input) => {
    expect(() => parseMessageId(input)).toThrow();
    expect(() => parseTopicId(input)).toThrow();
  });

  it('accepts the signed TL integer upper boundary', () => {
    expect(parseMessageId(String(MAX_TL_INT))).toBe(MAX_TL_INT);
    expect(parseTopicId(String(MAX_TL_INT))).toBe(MAX_TL_INT);
  });

  it.each(['', ' ', '1e3', '0x10', '1.5', '2147483648'])('rejects coercion or overflow in pagination: %s', input => {
    expect(() => validatePagination({ limit: input })).toThrow();
    expect(() => validatePagination({ offset: input })).toThrow();
  });

  it('allows zero only when the option domain permits it', () => {
    expect(parseIntegerOption('0', 'timeout')).toBe(0);
    expect(() => parseIntegerOption('0', 'ID', { min: 1 })).toThrow();
    expect(parseIntegerOption('2147483', 'seconds', { max: 2147483 })).toBe(2147483);
    expect(() => parseIntegerOption('2147484', 'seconds', { max: 2147483 })).toThrow();
  });
});
