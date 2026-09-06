import { describe, it, expect } from 'vitest';
import { buildEntityMap } from '../../src/lib/entity-map.js';

describe('buildEntityMap', () => {
  it('builds map from users and chats arrays', () => {
    const result = {
      users: [
        { id: { toString: () => '100' }, firstName: 'Alice' },
        { id: { toString: () => '200' }, firstName: 'Bob' },
      ],
      chats: [
        { id: { toString: () => '300' }, title: 'Group', className: 'Chat' },
      ],
    };

    const map = buildEntityMap(result);
    expect(map.size).toBe(3);
    expect(map.get('100')?.firstName).toBe('Alice');
    expect(map.get('200')?.firstName).toBe('Bob');
    expect(map.get('-300')?.title).toBe('Group');
  });

  it('handles undefined users', () => {
    const result = { chats: [{ id: { toString: () => '1' }, title: 'C', className: 'Channel' }] };
    const map = buildEntityMap(result);
    expect(map.size).toBe(1);
    expect(map.get('-1001')?.title).toBe('C');
  });

  it('handles undefined chats', () => {
    const result = { users: [{ id: { toString: () => '1' }, firstName: 'A' }] };
    const map = buildEntityMap(result);
    expect(map.size).toBe(1);
    expect(map.get('1')?.firstName).toBe('A');
  });

  it('handles both undefined', () => {
    const map = buildEntityMap({});
    expect(map.size).toBe(0);
  });

  it('handles empty arrays', () => {
    const map = buildEntityMap({ users: [], chats: [] });
    expect(map.size).toBe(0);
  });

  it('uses BigInteger-style id.toString()', () => {
    const bigIntLike = { toString: () => '9007199254740993' };
    const result = {
      users: [{ id: bigIntLike, firstName: 'Big' }],
    };
    const map = buildEntityMap(result);
    expect(map.has('9007199254740993')).toBe(true);
  });

  it('keeps users, chats and channels with the same raw ID distinct', () => {
    const result = {
      users: [{ id: { toString: () => '1' }, firstName: 'User' }],
      chats: [{ id: { toString: () => '1' }, title: 'Chat', className: 'Chat' }, { id: { toString: () => '1' }, title: 'Channel', className: 'Channel' }],
    };
    const map = buildEntityMap(result);
    expect(map.size).toBe(3);
    expect(map.get('1')?.firstName).toBe('User');
    expect(map.get('-1')?.title).toBe('Chat');
    expect(map.get('-1001')?.title).toBe('Channel');
  });
});
