import { createConnection, type Socket } from 'node:net';
import { encodeRequest, parseMessage } from './protocol.js';
import { JsonLineDecoder } from './frames.js';
import { isDaemonExecutionResult, validateDaemonCommand, type DaemonCommandOptions, type DaemonExecutionResult } from './command-protocol.js';

/** Preserve the daemon's JSON-RPC code and structured error details. */
export class DaemonRpcError extends Error {
  constructor(readonly code: number, message: string, readonly data?: unknown) {
    super(message);
    this.name = 'DaemonRpcError';
  }
}

/** JSON-RPC client. Each call or subscription owns a separate Unix socket. */
export class DaemonClient {
  private nextId = 1;
  private readonly pending = new Set<() => void>();

  constructor(private readonly socketPath: string) {}

  /** Execute a known CLI operation on the daemon's existing MTProto connection. */
  async execute(argv: string[], opts?: DaemonCommandOptions): Promise<DaemonExecutionResult> {
    const request = validateDaemonCommand({ argv, ...opts });
    // The server owns the operation deadline; leave a small response grace period.
    const result = await this.call('execute', { ...request }, { timeoutMs: (request.timeoutMs ?? 120_000) + 5_000 });
    if (!isDaemonExecutionResult(result)) throw new Error('Invalid daemon execute response');
    return result;
  }

  /** Send a request with one deadline covering both connection and response. */
  async call(
    method: string,
    params: Record<string, unknown>,
    opts?: { timeoutMs?: number },
  ): Promise<unknown> {
    return this.exchange(method, params, opts?.timeoutMs ?? 30_000);
  }

  /**
   * Deliver notifications after the subscribe ack. Unexpected EOF/error rejects;
   * close() is intentional cancellation and resolves the subscription cleanly.
   * The deadline covers connection and ack, not the lifetime of the stream.
   */
  async watch(
    params: Record<string, unknown>,
    onMessage: (payload: Record<string, unknown>) => void,
    opts?: { timeoutMs?: number },
  ): Promise<void> {
    await this.exchange('subscribe', params, opts?.timeoutMs ?? 30_000, onMessage);
  }

  private exchange(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
    onMessage?: (payload: Record<string, unknown>) => void,
  ): Promise<unknown> {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 2_147_483_647) {
      return Promise.reject(new Error('Invalid daemon timeout'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      let socket: Socket | undefined;
      let settled = false;
      let connected = false;
      let acked = false;
      const decoder = new JsonLineDecoder();
      const finish = (err?: unknown, result?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.pending.delete(cancel);
        // Keep the error handler until close: already queued socket errors must
        // remain contained even when a response or cancellation wins the race.
        socket?.destroy();
        if (err !== undefined) reject(err);
        else resolve(result);
      };
      const cancel = () => finish(onMessage ? undefined : new Error('Daemon request cancelled'));
      const timeout = setTimeout(() => {
        const label = timeoutMs % 1000 === 0 ? `${timeoutMs / 1000}s` : `${timeoutMs}ms`;
        finish(new Error(`Daemon ${onMessage ? 'subscribe' : 'request'} timed out (${label})`));
      }, timeoutMs);
      this.pending.add(cancel);

      try {
        socket = createConnection(this.socketPath);
        socket.on('error', (err) => finish(connected ? err : new Error(
          `Cannot connect to daemon at ${this.socketPath}: ${err.message}`,
        )));
        const disconnected = () => finish(new Error(onMessage
          ? acked ? 'Daemon disconnected while watching' : 'Daemon closed before subscribe ack'
          : 'Daemon closed before response'));
        socket.on('end', disconnected);
        socket.on('close', disconnected);
        socket.on('connect', () => {
          if (settled) return;
          connected = true;
          socket!.write(encodeRequest(method, params, id) + '\n');
        });
        socket.on('data', (chunk: Buffer) => {
          if (settled) return;
          try {
            decoder.push(chunk, (line) => {
              if (settled) return;
              const msg = parseMessage(line);
              if (msg.type === 'response' || msg.type === 'error') {
                // Ignore unrelated responses; they cannot satisfy this request
                // or disable its deadline, including unrelated RPC errors.
                if (msg.id !== id) return;
                if (msg.type === 'error') {
                  finish(new DaemonRpcError(msg.error.code, msg.error.message, msg.error.data));
                } else if (onMessage) {
                  acked = true;
                  clearTimeout(timeout);
                } else {
                  finish(undefined, msg.result);
                }
              } else if (msg.type === 'notification') {
                if (acked && onMessage && msg.method === 'message') onMessage(msg.params);
              } else {
                finish(new Error('Unexpected request from daemon'));
              }
            });
          } catch (err) {
            finish(err);
          }
        });
      } catch (err) {
        finish(err);
      }
    });
  }

  /** Cancel all active requests/subscriptions and release their sockets. */
  close(): void {
    for (const cancel of [...this.pending]) cancel();
  }
}
