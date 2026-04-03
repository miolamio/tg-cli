// src/lib/daemon/protocol.ts

/**
 * JSON-RPC 2.0 message types for daemon IPC.
 * Messages are newline-delimited JSON over Unix domain sockets.
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, unknown>;
  id: number;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result: unknown;
  id: number;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  error: { code: number; message: string; data?: unknown };
  id: number | null;
}

export type JsonRpcMessage =
  | { type: 'request'; method: string; params: Record<string, unknown>; id: number }
  | { type: 'response'; result: unknown; id: number }
  | { type: 'error'; error: { code: number; message: string; data?: unknown }; id: number | null };

export function encodeRequest(method: string, params: Record<string, unknown>, id: number): string {
  return JSON.stringify({ jsonrpc: '2.0', method, params, id });
}

export function encodeResponse(result: unknown, id: number): string {
  return JSON.stringify({ jsonrpc: '2.0', result, id });
}

export function encodeError(code: number, message: string, data: unknown, id: number | null): string {
  return JSON.stringify({ jsonrpc: '2.0', error: { code, message, data }, id });
}

export function parseMessage(raw: string): JsonRpcMessage {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON: ${raw.slice(0, 100)}`);
  }

  if (msg.jsonrpc !== '2.0') {
    throw new Error('Invalid JSON-RPC: missing jsonrpc 2.0 field');
  }

  if ('method' in msg) {
    return { type: 'request', method: msg.method, params: msg.params ?? {}, id: msg.id };
  }
  if ('result' in msg) {
    return { type: 'response', result: msg.result, id: msg.id };
  }
  if ('error' in msg) {
    return { type: 'error', error: msg.error, id: msg.id };
  }

  throw new Error('Invalid JSON-RPC message: neither request, response, nor error');
}
