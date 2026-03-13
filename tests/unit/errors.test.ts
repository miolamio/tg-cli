import { describe, it, expect } from 'vitest';
import { translateTelegramError, formatError, TgError } from '../../src/lib/errors.js';

describe('translateTelegramError', () => {
  // Known RPCError mappings
  it('maps MESSAGE_EDIT_TIME_EXPIRED to human-readable message', () => {
    const err = { errorMessage: 'MESSAGE_EDIT_TIME_EXPIRED' };
    const result = translateTelegramError(err);
    expect(result).toEqual({
      message: 'Cannot edit: 48-hour edit window has expired',
      code: 'MESSAGE_EDIT_TIME_EXPIRED',
    });
  });

  it('maps MESSAGE_AUTHOR_REQUIRED to human-readable message', () => {
    const err = { errorMessage: 'MESSAGE_AUTHOR_REQUIRED' };
    const result = translateTelegramError(err);
    expect(result).toEqual({
      message: 'Cannot edit: you can only edit your own messages',
      code: 'MESSAGE_AUTHOR_REQUIRED',
    });
  });

  it('maps MESSAGE_DELETE_FORBIDDEN to human-readable message', () => {
    const err = { errorMessage: 'MESSAGE_DELETE_FORBIDDEN' };
    const result = translateTelegramError(err);
    expect(result).toEqual({
      message: 'Cannot delete this message',
      code: 'MESSAGE_DELETE_FORBIDDEN',
    });
  });

  it('maps CHAT_ADMIN_REQUIRED to human-readable message', () => {
    const err = { errorMessage: 'CHAT_ADMIN_REQUIRED' };
    const result = translateTelegramError(err);
    expect(result).toEqual({
      message: 'Admin privileges required',
      code: 'CHAT_ADMIN_REQUIRED',
    });
  });

  it('maps MESSAGE_ID_INVALID to human-readable message', () => {
    const err = { errorMessage: 'MESSAGE_ID_INVALID' };
    const result = translateTelegramError(err);
    expect(result).toEqual({
      message: 'Message not found',
      code: 'MESSAGE_ID_INVALID',
    });
  });

  it('maps MESSAGE_NOT_MODIFIED to human-readable message', () => {
    const err = { errorMessage: 'MESSAGE_NOT_MODIFIED' };
    const result = translateTelegramError(err);
    expect(result).toEqual({
      message: 'Message content unchanged',
      code: 'MESSAGE_NOT_MODIFIED',
    });
  });

  it('maps PEER_ID_INVALID to human-readable message', () => {
    const err = { errorMessage: 'PEER_ID_INVALID' };
    const result = translateTelegramError(err);
    expect(result).toEqual({
      message: 'Chat not found',
      code: 'PEER_ID_INVALID',
    });
  });

  // Unknown RPCError passthrough
  it('passes through unknown RPCError errorMessage as both message and code', () => {
    const err = { errorMessage: 'SOME_UNKNOWN_ERROR' };
    const result = translateTelegramError(err);
    expect(result).toEqual({
      message: 'SOME_UNKNOWN_ERROR',
      code: 'SOME_UNKNOWN_ERROR',
    });
  });

  // Non-RPCError fallback to formatError
  it('falls back to formatError for non-RPCError Error instances', () => {
    const err = new Error('Connection failed');
    const result = translateTelegramError(err);
    expect(result).toEqual({
      message: 'Connection failed',
      code: 'UNKNOWN_ERROR',
    });
  });

  it('falls back to formatError for TgError instances', () => {
    const err = new TgError('Session expired', 'SESSION_ERROR');
    const result = translateTelegramError(err);
    expect(result).toEqual({
      message: 'Session expired',
      code: 'SESSION_ERROR',
    });
  });

  it('falls back to formatError for plain string errors', () => {
    const result = translateTelegramError('something broke');
    expect(result).toEqual({
      message: 'something broke',
      code: 'UNKNOWN_ERROR',
    });
  });
});
