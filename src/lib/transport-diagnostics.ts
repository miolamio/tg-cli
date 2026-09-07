import type { TelegramClient } from 'telegram';
import { Socket } from 'node:net';
import type { Logger } from 'telegram/extensions/Logger.js';
import { ConnectionTCPFull } from 'telegram/network/index.js';
import { InvalidBufferError, InvalidChecksumError, TypeNotFoundError, SecurityError } from 'telegram/errors/Common.js';

const NETWORK_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH',
  'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'ERR_SOCKET_CLOSED',
]);

/** Read data properties only; diagnostics must not invoke SDK object getters. */
function ownValue(error: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(error, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

/** Fixed labels and bounded codes only: never interpolate messages or payloads. */
export function describeTransportError(error: unknown): string {
  try {
    if (!error || typeof error !== 'object') return 'UNKNOWN_ERROR';
    if (error instanceof InvalidBufferError) {
      const code = ownValue(error, 'code');
      return typeof code === 'number' && Number.isInteger(code) && code >= 100 && code <= 599
        ? `INVALID_BUFFER (code=${code})` : 'INVALID_BUFFER';
    }
    if (error instanceof InvalidChecksumError) return 'INVALID_CHECKSUM';
    if (error instanceof TypeNotFoundError) return 'UNKNOWN_CONSTRUCTOR';
    if (error instanceof SecurityError) return 'SECURITY_CHECK_FAILED';
    const code = ownValue(error, 'code');
    if (typeof code === 'string' && NETWORK_CODES.has(code)) return code;
    const message = ownValue(error, 'message');
    if (message === 'NetSocket was closed' || message === 'WebSocket was closed' || message === 'Not connected' || message === 'no data received') {
      return 'CONNECTION_CLOSED';
    }
    if (message === 'TIMEOUT' || message === 'Timeout') return 'TIMEOUT';
  } catch { /* Even unusual error objects must not break transport cleanup. */ }
  return 'UNKNOWN_ERROR';
}

/** Capture the receive failure before gramjs replaces it with "Not connected". */
export class DiagnosticTCPFull extends ConnectionTCPFull {
  private socketFailure?: string;

  override async _connect(): Promise<void> {
    this.socketFailure = undefined;
    try {
      await super._connect();
      // gramjs can reduce a socket error to its generic closed-read error.
      // Keep only the safe category, not the Error or its attached objects.
      const socket = ownValue(this.socket, 'client');
      if (socket instanceof Socket) {
        socket.once('error', error => {
          if (ownValue(this.socket, 'client') === socket) {
            this.socketFailure = describeTransportError(error);
          }
        });
      }
    }
    catch (error) {
      this._log.error(`Transport connect failed: ${describeTransportError(error)}`);
      throw error;
    }
  }

  override async _recv(): Promise<Buffer> {
    try { return await super._recv(); }
    catch (error) {
      // Intentional shutdown closes the socket after clearing this flag.
      if (this.isConnected()) {
        this._log.error(`Transport receive failed: ${this.socketFailure ?? describeTransportError(error)}`);
      }
      throw error;
    }
  }

  override toString(): string {
    return `${this._ip}:${this._port}/TCPFull`;
  }
}

/** SDK errors outside the receive loop also get a safe stderr diagnostic. */
export function installClientErrorDiagnostics(client: TelegramClient, logger: Logger): void {
  client.onError = async error => {
    logger.error(`Telegram client failed: ${describeTransportError(error)}`);
  };
}
