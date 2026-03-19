import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock errors module (import actual)
vi.mock('../../src/lib/errors.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/errors.js')>('../../src/lib/errors.js');
  return actual;
});

// Mock telegram module
vi.mock('telegram', () => ({
  Api: {
    messages: {
      CheckChatInvite: vi.fn().mockImplementation((args: any) => ({ hash: args.hash, className: 'messages.CheckChatInvite' })),
    },
  },
}));

import { resolveEntity, extractInviteHash, assertForum } from '../../src/lib/peer.js';
import { TgError } from '../../src/lib/errors.js';

describe('extractInviteHash', () => {
  it('extracts hash from t.me/+HASH format', () => {
    expect(extractInviteHash('https://t.me/+abc123')).toBe('abc123');
  });

  it('extracts hash from t.me/joinchat/HASH format', () => {
    expect(extractInviteHash('https://t.me/joinchat/abc123')).toBe('abc123');
  });

  it('extracts hash from telegram.me/+HASH format', () => {
    expect(extractInviteHash('https://telegram.me/+xyz789')).toBe('xyz789');
  });

  it('handles links without https:// prefix', () => {
    expect(extractInviteHash('t.me/+abc123')).toBe('abc123');
  });

  it('handles hashes with dashes and underscores', () => {
    expect(extractInviteHash('https://t.me/+abc_123-def')).toBe('abc_123-def');
  });

  it('throws TgError for invalid invite link', () => {
    expect(() => extractInviteHash('https://example.com/something')).toThrow(TgError);
    expect(() => extractInviteHash('not a link at all')).toThrow(TgError);
  });

  it('throws with INVALID_INVITE code', () => {
    try {
      extractInviteHash('invalid');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as TgError).code).toBe('INVALID_INVITE');
    }
  });
});

describe('resolveEntity', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      getEntity: vi.fn().mockResolvedValue({ id: 123, className: 'User' }),
      invoke: vi.fn().mockResolvedValue({ chat: { id: 456, className: 'Channel' } }),
    };
  });

  it('resolves username without @ prefix', async () => {
    await resolveEntity(mockClient, 'testuser');
    expect(mockClient.getEntity).toHaveBeenCalledWith('testuser');
  });

  it('strips @ prefix from @username', async () => {
    await resolveEntity(mockClient, '@testuser');
    expect(mockClient.getEntity).toHaveBeenCalledWith('testuser');
  });

  it('parses positive numeric ID and calls getEntity with number', async () => {
    await resolveEntity(mockClient, '12345');
    expect(mockClient.getEntity).toHaveBeenCalledWith(12345);
  });

  it('parses negative numeric ID for channel/group', async () => {
    await resolveEntity(mockClient, '-1001234567');
    expect(mockClient.getEntity).toHaveBeenCalledWith(-1001234567);
  });

  it('handles phone number input starting with +digits', async () => {
    await resolveEntity(mockClient, '+15551234567');
    expect(mockClient.getEntity).toHaveBeenCalledWith('+15551234567');
  });

  it('uses CheckChatInvite for t.me/+HASH invite links', async () => {
    await resolveEntity(mockClient, 'https://t.me/+abc123');
    expect(mockClient.invoke).toHaveBeenCalledOnce();
    // Should have invoked with a CheckChatInvite-like object
    const invokeArg = mockClient.invoke.mock.calls[0][0];
    expect(invokeArg.hash).toBe('abc123');
  });

  it('uses CheckChatInvite for t.me/joinchat/HASH invite links', async () => {
    await resolveEntity(mockClient, 'https://t.me/joinchat/xyz789');
    expect(mockClient.invoke).toHaveBeenCalledOnce();
    const invokeArg = mockClient.invoke.mock.calls[0][0];
    expect(invokeArg.hash).toBe('xyz789');
  });

  it('wraps getEntity errors in TgError with PEER_NOT_FOUND', async () => {
    mockClient.getEntity.mockRejectedValue(new Error('entity not found'));
    await expect(resolveEntity(mockClient, 'nonexistent')).rejects.toThrow(TgError);
    try {
      await resolveEntity(mockClient, 'nonexistent');
    } catch (err) {
      expect((err as TgError).code).toBe('PEER_NOT_FOUND');
    }
  });

  it('wraps invoke errors in TgError with INVALID_INVITE', async () => {
    mockClient.invoke.mockRejectedValue(new Error('invite hash invalid'));
    await expect(resolveEntity(mockClient, 'https://t.me/+badHash')).rejects.toThrow(TgError);
    try {
      await resolveEntity(mockClient, 'https://t.me/+badHash');
    } catch (err) {
      expect((err as TgError).code).toBe('INVALID_INVITE');
    }
  });

  it('returns the entity from getEntity call', async () => {
    const mockEntity = { id: 999, className: 'Channel' };
    mockClient.getEntity.mockResolvedValue(mockEntity);
    const result = await resolveEntity(mockClient, 'somechannel');
    expect(result).toBe(mockEntity);
  });

  it('wraps phone number getEntity errors in TgError with PEER_NOT_FOUND', async () => {
    mockClient.getEntity.mockRejectedValue(new Error('phone not found'));
    try {
      await resolveEntity(mockClient, '+15551234567');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TgError);
      expect((err as TgError).code).toBe('PEER_NOT_FOUND');
      expect((err as TgError).message).toContain('phone not found');
    }
  });

  it('re-throws TgError as-is from phone number resolution', async () => {
    const original = new TgError('custom error', 'CUSTOM');
    mockClient.getEntity.mockRejectedValue(original);
    try {
      await resolveEntity(mockClient, '+15551234567');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBe(original);
    }
  });

  it('wraps numeric ID getEntity errors in TgError with PEER_NOT_FOUND', async () => {
    mockClient.getEntity.mockRejectedValue(new Error('id not found'));
    try {
      await resolveEntity(mockClient, '12345');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TgError);
      expect((err as TgError).code).toBe('PEER_NOT_FOUND');
      expect((err as TgError).message).toContain('id not found');
    }
  });

  it('re-throws TgError as-is from numeric ID resolution', async () => {
    const original = new TgError('custom error', 'CUSTOM');
    mockClient.getEntity.mockRejectedValue(original);
    try {
      await resolveEntity(mockClient, '-1001234567');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBe(original);
    }
  });

  it('re-throws TgError as-is from username resolution', async () => {
    const original = new TgError('custom error', 'CUSTOM');
    mockClient.getEntity.mockRejectedValue(original);
    try {
      await resolveEntity(mockClient, '@someone');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBe(original);
    }
  });

  it('re-throws TgError as-is from invite link resolution', async () => {
    const original = new TgError('custom error', 'CUSTOM');
    mockClient.invoke.mockRejectedValue(original);
    try {
      await resolveEntity(mockClient, 'https://t.me/+abc123');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBe(original);
    }
  });
});

describe('assertForum', () => {
  it('does nothing when topicId is undefined', async () => {
    await expect(assertForum({}, undefined)).resolves.toBeUndefined();
  });

  it('throws NOT_A_FORUM when entity has no className', async () => {
    await expect(assertForum({}, 7)).rejects.toThrow(TgError);
    try {
      await assertForum({}, 7);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as TgError).code).toBe('NOT_A_FORUM');
    }
  });

  it('throws NOT_A_FORUM when entity is not a Channel', async () => {
    await expect(assertForum({ className: 'Chat' }, 7)).rejects.toThrow(TgError);
  });

  it('throws NOT_A_FORUM when Channel has forum === false', async () => {
    await expect(assertForum({ className: 'Channel', forum: false }, 7)).rejects.toThrow(TgError);
  });

  it('passes when entity is a Channel without forum === false', async () => {
    await expect(assertForum({ className: 'Channel', forum: true }, 7)).resolves.toBeUndefined();
  });
});
