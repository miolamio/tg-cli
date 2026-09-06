import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  withAuth,
  resolveEntity,
  withClient,
  SessionStore,
  outputSuccess,
  outputError,
  TgError,
} from '../../src/index.js';

describe('public library exports', () => {
  it('re-exports ErrorCode, withAuth, and resolveEntity', () => {
    expect(ErrorCode.NOT_AUTHENTICATED).toBe('NOT_AUTHENTICATED');
    expect(typeof withAuth).toBe('function');
    expect(typeof resolveEntity).toBe('function');
  });

  it('re-exports client, session, output, and error helpers', () => {
    expect(typeof withClient).toBe('function');
    expect(typeof SessionStore).toBe('function');
    expect(typeof outputSuccess).toBe('function');
    expect(typeof outputError).toBe('function');
    expect(new TgError('x', 'Y')).toBeInstanceOf(Error);
  });
});
