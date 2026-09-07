import { ConnectionTCPObfuscated } from 'telegram/network/index.js';
import { PromisedWebSockets } from 'telegram/extensions/PromisedWebSockets.js';
import { describeTransportError } from './transport-diagnostics.js';
import { TgError } from './errors.js';
import { ErrorCode } from './error-codes.js';

const DC_NAMES = ['pluto', 'venus', 'aurora', 'vesta', 'flora'] as const;

/** Official Telegram WSS endpoints require a hostname for TLS and routing. */
export function wssHost(dcId: number): string {
  if (!Number.isInteger(dcId) || dcId < 1 || dcId > DC_NAMES.length) {
    throw new TgError('This Telegram data center does not support the WSS transport', ErrorCode.CONNECTION_FAILED);
  }
  return `${DC_NAMES[dcId - 1]}.web.telegram.org`;
}

/** Bound TLS/upgrade waits and cancel an upgrade when the client is destroyed. */
export class WssSocket extends PromisedWebSockets {
  private current?: PromisedWebSockets;
  private cancelConnect?: () => void;
  private generation = 0;

  override async connect(port: number, ip: string, testServers = false): Promise<unknown> {
    const closing = this.close();
    const generation = this.generation;
    await closing;
    if (generation !== this.generation) throw new Error('WebSocket was closed');
    // The SDK's close/message handlers mutate their socket wrapper. Isolate
    // each attempt so a late callback cannot mark a new connection as closed.
    const socket = new PromisedWebSockets();
    this.current = socket;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interrupted = new Promise<never>((_resolve, reject) => {
      this.cancelConnect = () => reject(new Error('WebSocket was closed'));
      timer = setTimeout(() => reject(new Error('TIMEOUT')), 10_000);
    });
    try {
      return await Promise.race([socket.connect(port, ip, testServers), interrupted]);
    } catch (error) {
      await socket.close().catch(() => {});
      throw error;
    } finally {
      clearTimeout(timer);
      if (this.current === socket) this.cancelConnect = undefined;
    }
  }

  override async close(): Promise<void> {
    this.generation++;
    this.cancelConnect?.();
    await this.current?.close();
  }

  private activeSocket(): PromisedWebSockets {
    if (!this.current) throw new Error('WebSocket was closed');
    return this.current;
  }

  override readExactly(length: number): Promise<Buffer> { return this.activeSocket().readExactly(length); }
  override read(length: number): Promise<Buffer> { return this.activeSocket().read(length); }
  override readAll(): Promise<Buffer> { return this.activeSocket().readAll(); }
  override write(data: Buffer): void { this.activeSocket().write(data); }
}

/** Map every connection by DC, including migration and borrowed media senders. */
export class DiagnosticWSS extends ConnectionTCPObfuscated {
  constructor(params: ConstructorParameters<typeof ConnectionTCPObfuscated>[0]) {
    if (params.proxy) {
      throw new TgError('WSS transport does not support an explicit proxy', ErrorCode.INVALID_OPTIONS);
    }
    super({ ...params, ip: wssHost(params.dcId), port: 443, socket: WssSocket });
  }

  override async _connect(): Promise<void> {
    try { await super._connect(); }
    catch (error) {
      this._log.error(`Transport connect failed: ${describeTransportError(error)}`);
      await this.socket.close().catch(() => {});
      throw error;
    }
  }

  override async _recv(): Promise<Buffer> {
    try { return await super._recv(); }
    catch (error) {
      if (this.isConnected()) this._log.error(`Transport receive failed: ${describeTransportError(error)}`);
      throw error;
    }
  }

  override async disconnect(): Promise<void> {
    // gramjs's base implementation skips an in-progress TLS/WS connection.
    try { await super.disconnect(); }
    finally { await this.socket.close(); }
  }

  override toString(): string {
    return `${this._ip}:443/WSS`;
  }
}
