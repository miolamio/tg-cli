// tests/unit/daemon-protocol.test.ts
import { describe, it, expect } from 'vitest';
import {
  encodeRequest,
  encodeResponse,
  encodeError,
  parseMessage,
} from '../../src/lib/daemon/protocol.js';

describe('daemon protocol', () => {
  it('encodes a JSON-RPC request', () => {
    const msg = encodeRequest('ping', {}, 1);
    const parsed = JSON.parse(msg);
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.method).toBe('ping');
    expect(parsed.id).toBe(1);
  });

  it('encodes a JSON-RPC success response', () => {
    const msg = encodeResponse({ ok: true, data: { chats: [] } }, 1);
    const parsed = JSON.parse(msg);
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.result.ok).toBe(true);
    expect(parsed.id).toBe(1);
  });

  it('encodes a JSON-RPC error response', () => {
    const msg = encodeError(-32000, 'Peer not found', { tgCode: 'PEER_NOT_FOUND' }, 1);
    const parsed = JSON.parse(msg);
    expect(parsed.error.code).toBe(-32000);
    expect(parsed.error.message).toBe('Peer not found');
    expect(parsed.error.data.tgCode).toBe('PEER_NOT_FOUND');
  });

  it('parses a valid JSON-RPC request', () => {
    const raw = JSON.stringify({ jsonrpc: '2.0', method: 'ping', params: {}, id: 1 });
    const msg = parseMessage(raw);
    expect(msg.type).toBe('request');
    expect((msg as any).method).toBe('ping');
  });

  it('parses a valid JSON-RPC response', () => {
    const raw = JSON.stringify({ jsonrpc: '2.0', result: { ok: true }, id: 1 });
    const msg = parseMessage(raw);
    expect(msg.type).toBe('response');
  });

  it('parses a valid JSON-RPC error', () => {
    const raw = JSON.stringify({ jsonrpc: '2.0', error: { code: -1, message: 'err' }, id: 1 });
    const msg = parseMessage(raw);
    expect(msg.type).toBe('error');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseMessage('not json{')).toThrow();
  });

  it('throws on missing jsonrpc field', () => {
    expect(() => parseMessage(JSON.stringify({ method: 'ping' }))).toThrow();
  });
});
