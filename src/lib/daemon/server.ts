// src/lib/daemon/server.ts
import { createServer, type Server, type Socket } from 'node:net';
import { chmodSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { TelegramClient } from 'telegram';
import { DaemonPaths } from './pid.js';
import { encodeResponse, encodeError, parseMessage } from './protocol.js';

interface DaemonClientOpts {
  apiId: number;
  apiHash: string;
  sessionString: string;
}

interface DaemonServerOpts {
  /** Idle timeout in ms before auto-shutdown. Default: 300_000 (5 min). */
  idleTimeout?: number;
}

/**
 * Daemon server that holds a persistent TelegramClient connection
 * and accepts JSON-RPC 2.0 requests over a Unix domain socket.
 */
export class DaemonServer {
  private readonly paths: DaemonPaths;
  private readonly clientOpts: DaemonClientOpts;
  private readonly idleTimeout: number;
  private server: Server | null = null;
  private client: TelegramClient | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private startTime: number = 0;

  constructor(paths: DaemonPaths, clientOpts: DaemonClientOpts, opts?: DaemonServerOpts) {
    this.paths = paths;
    this.clientOpts = clientOpts;
    this.idleTimeout = opts?.idleTimeout ?? 300_000;
  }

  async start(): Promise<void> {
    this.paths.ensureDir();
    this.paths.validateSocketPath();

    // Clean stale socket
    this.paths.cleanup();

    // Connect Telegram client
    const { TelegramClient, sessions } = await import('telegram');
    const session = new sessions.StringSession(this.clientOpts.sessionString);
    this.client = new TelegramClient(session, this.clientOpts.apiId, this.clientOpts.apiHash, {
      connectionRetries: 3,
      retryDelay: 1000,
      floodSleepThreshold: 60,
    });
    await this.client.connect();

    // Start Unix socket server
    this.server = createServer((socket) => this.handleConnection(socket));
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.paths.socketPath, () => resolve());
      this.server!.on('error', reject);
    });

    // Restrict socket to owner-only access (prevent other local users from connecting)
    chmodSync(this.paths.socketPath, 0o600);

    this.paths.writePid(process.pid);
    this.startTime = Date.now();
    this.resetIdle();
  }

  async stop(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    if (this.client) {
      await this.client.destroy().catch(() => {});
      this.client = null;
    }

    this.paths.cleanup();
  }

  getClient(): TelegramClient | null {
    return this.client;
  }

  private resetIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.stop(), this.idleTimeout);
  }

  private handleConnection(socket: Socket): void {
    // Guard against oversized messages (local DoS via memory exhaustion)
    const MAX_LINE_BYTES = 1_048_576; // 1 MB
    let bytesReceived = 0;
    socket.on('data', (chunk) => {
      bytesReceived += chunk.length;
      if (bytesReceived > MAX_LINE_BYTES) {
        socket.destroy(new Error('Message too large'));
      }
    });

    const rl = createInterface({ input: socket });

    rl.on('line', async (line) => {
      bytesReceived = 0; // Reset after line is consumed
      this.resetIdle();

      let id: number | null = null;
      try {
        const msg = parseMessage(line);
        if (msg.type !== 'request') {
          socket.write(encodeError(-32600, 'Expected request', null, null) + '\n');
          return;
        }

        id = msg.id;
        const result = await this.dispatch(msg.method, msg.params);
        socket.write(encodeResponse(result, id) + '\n');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const code = err instanceof Error && 'code' in err ? (err as any).code : -32000;
        const data = err instanceof Error && 'code' in err && typeof (err as any).code === 'string'
          ? { tgCode: (err as any).code }
          : undefined;
        socket.write(encodeError(typeof code === 'number' ? code : -32000, message, data, id) + '\n');
      }
    });

    rl.on('close', () => socket.destroy());
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'ping':
        return 'pong';

      case 'status':
        return {
          running: true,
          pid: process.pid,
          uptime: Math.round((Date.now() - this.startTime) / 1000),
          idleTimeout: this.idleTimeout / 1000,
        };

      case 'shutdown':
        setTimeout(() => this.stop(), 100);
        return { shuttingDown: true };

      case 'subscribe':
        return { subscribed: true, chat: params.chat, topic: params.topic ?? null };

      default:
        throw Object.assign(new Error(`Unknown method: ${method}`), { code: -32601 });
    }
  }
}
