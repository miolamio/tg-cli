import { describe, it, expect } from 'vitest';
import { pickFields, applyFieldSelection, extractListItems } from '../../src/lib/fields.js';

describe('pickFields', () => {
  it('picks flat fields from an object', () => {
    const result = pickFields({ id: 1, text: 'hi', date: '2026-01-01' }, ['id', 'text']);
    expect(result).toEqual({ id: 1, text: 'hi' });
  });

  it('picks dot-notation nested fields', () => {
    const obj = { id: 1, media: { filename: 'a.jpg', fileSize: 100 } };
    const result = pickFields(obj, ['id', 'media.filename']);
    expect(result).toEqual({ id: 1, media: { filename: 'a.jpg' } });
  });

  it('silently omits nonexistent fields', () => {
    const result = pickFields({ id: 1, text: 'hi' }, ['nonexistent']);
    expect(result).toEqual({});
  });

  it('handles missing intermediate paths without crashing', () => {
    const result = pickFields({ id: 1 }, ['nested.deep.field']);
    expect(result).toEqual({});
  });

  it('picks multiple flat fields', () => {
    const result = pickFields({ a: 1, b: 2, c: 3 }, ['a', 'c']);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('returns empty object when fields array is empty', () => {
    const result = pickFields({ id: 1, text: 'hi' }, []);
    expect(result).toEqual({});
  });

  it('picks deeply nested dot-notation fields', () => {
    const obj = { a: { b: { c: { d: 42 } } } };
    const result = pickFields(obj, ['a.b.c.d']);
    expect(result).toEqual({ a: { b: { c: { d: 42 } } } });
  });

  it('handles null values at intermediate paths', () => {
    const obj = { a: null } as Record<string, unknown>;
    const result = pickFields(obj, ['a.b']);
    expect(result).toEqual({});
  });
});

describe('applyFieldSelection', () => {
  it('filters array items and preserves metadata', () => {
    const data = {
      messages: [{ id: 1, text: 'hi', date: '2026-01-01' }],
      total: 5,
    };
    const result = applyFieldSelection(data, ['id']);
    expect(result).toEqual({ messages: [{ id: 1 }], total: 5 });
  });

  it('preserves non-array data with field filtering on scalar entries', () => {
    const data = { status: 'ok' };
    const result = applyFieldSelection(data, ['status']);
    expect(result).toEqual({ status: 'ok' });
  });

  it('returns null unchanged', () => {
    const result = applyFieldSelection(null, ['id']);
    expect(result).toBeNull();
  });

  it('returns non-object unchanged', () => {
    const result = applyFieldSelection('hello', ['id']);
    expect(result).toBe('hello');
  });

  it('preserves multiple metadata fields', () => {
    const data = {
      messages: [{ id: 1, text: 'hi' }],
      total: 10,
      count: 1,
    };
    const result = applyFieldSelection(data, ['id']);
    expect(result).toEqual({ messages: [{ id: 1 }], total: 10, count: 1 });
  });

  it('handles multiple list items', () => {
    const data = {
      chats: [
        { id: '1', title: 'Chat 1', type: 'group' },
        { id: '2', title: 'Chat 2', type: 'channel' },
      ],
      total: 2,
    };
    const result = applyFieldSelection(data, ['id', 'title']);
    expect(result).toEqual({
      chats: [
        { id: '1', title: 'Chat 1' },
        { id: '2', title: 'Chat 2' },
      ],
      total: 2,
    });
  });
});

describe('extractListItems', () => {
  it('extracts messages array', () => {
    const msg1 = { id: 1, text: 'a' };
    const msg2 = { id: 2, text: 'b' };
    expect(extractListItems({ messages: [msg1, msg2] })).toEqual([msg1, msg2]);
  });

  it('extracts chats array', () => {
    const c1 = { id: '1', title: 'Chat' };
    expect(extractListItems({ chats: [c1] })).toEqual([c1]);
  });

  it('extracts members array', () => {
    const m1 = { id: '1', username: 'alice' };
    expect(extractListItems({ members: [m1] })).toEqual([m1]);
  });

  it('extracts topics array', () => {
    const t1 = { id: 1, title: 'Topic' };
    expect(extractListItems({ topics: [t1] })).toEqual([t1]);
  });

  it('extracts files array', () => {
    const f1 = { path: '/tmp/file.txt' };
    expect(extractListItems({ files: [f1] })).toEqual([f1]);
  });

  it('returns null for non-list data', () => {
    expect(extractListItems({ status: 'ok' })).toBeNull();
  });

  it('returns null for null input', () => {
    expect(extractListItems(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(extractListItems(undefined)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(extractListItems('hello')).toBeNull();
  });
});
