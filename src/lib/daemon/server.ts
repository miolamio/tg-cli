// src/lib/daemon/server.ts
import { createServer, type Server, type Socket } from 'node:net';
import { chmodSync } from 'node:fs';
import type { TelegramClient } from 'telegram';
import { NewMessage } from 'telegram/events/NewMessage.js';
import { DaemonPaths } from './pid.js';
import { cleanupStaleDaemon, daemonPidAlive, pingDaemon } from './guard.js';
import { encodeResponse, encodeError, encodeNotification, parseMessage } from './protocol.js';
import { resolveEntity } from '../peer.js';
import { markedPeerId, messagePeerMarkedId, serializeMessage } from '../serialize.js';
import { parseTopicId } from '../validate.js';
import { messageMatchesTopic } from './topic-filter.js';
import { SessionStore } from '../session-store.js';
import { JsonLineDecoder, MAX_FRAME_BYTES } from './frames.js';
import { createGramjsLogger } from '../gramjs-logger.js';
import { installClientErrorDiagnostics } from '../transport-diagnostics.js';
import { connectionOptions } from '../connection-options.js';
import type { Transport } from '../types.js';
import { connectOrThrow } from '../connect.js';
import { createRequestClient } from './request-client.js';
import { executeDaemonCommand } from './execute.js';
import { TgError } from '../errors.js';
import { ErrorCode } from '../error-codes.js';

const MAX_ACTIVE_REQUESTS = 16;
const MAX_EXECUTION_TIMEOUT = 120_000;

interface ActiveRequest {
  controller: AbortController;
  done: Promise<void>;
  socket: Socket;
}

interface DaemonClientOpts {
  apiId: number;
  apiHash: string;
  transport?: Transport;
  /** Optional in-memory session for library callers; CLI always reads under lock. */
  sessionString?: string;
}

interface DaemonServerOpts {
  /** Idle timeout in ms before auto-shutdown. Default: 300_000 (5 min). */
  idleTimeout?: number;
  /** Called after stop() from idle timeout or shutdown RPC (not from explicit stop()). */
  onIdle?: () => void;
  /** Parent already `writePidExclusive(child.pid)` — wait for that file, never stale-clean it. */
  pidPreclaimed?: boolean;
}

/**
 * Daemon server that holds a persistent TelegramClient connection
 * and accepts JSON-RPC 2.0 requests over a Unix domain socket.
 */
export class DaemonServer {
  private readonly paths: DaemonPaths;
  private readonly clientOpts: DaemonClientOpts;
  private readonly idleTimeout: number;
  private readonly onIdle?: () => void;
  private readonly pidPreclaimed: boolean;
  private server: Server | null = null;
  private client: TelegramClient | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private startTime: number = 0;
  private stopping: Promise<void> | null = null;
  private starting: Promise<void> | null = null;
  private releaseSession: (() => Promise<void>) | null = null;
  private stopRequested = false;
  private ownsPid = false;
  private readonly sockets = new Set<Socket>();
  private readonly activeRequests = new Set<ActiveRequest>();

  constructor(paths: DaemonPaths, clientOpts: DaemonClientOpts, opts?: DaemonServerOpts) {
    this.paths = paths;
    this.clientOpts = clientOpts;
    this.idleTimeout = opts?.idleTimeout ?? 300_000;
    if (!Number.isSafeInteger(this.idleTimeout) || this.idleTimeout < 0 || this.idleTimeout > 2_147_483_647) {
      throw new Error('Daemon idle timeout must be an integer from 0 to 2147483647 milliseconds');
    }
    this.onIdle = opts?.onIdle;
    this.pidPreclaimed = opts?.pidPreclaimed ?? false;
  }

  async start(): Promise<void> {
    if (this.stopping) throw new Error('Daemon is stopping');
    if (this.starting) return this.starting;
    this.starting = this.doStart();
    return this.starting;
  }

  private async doStart(): Promise<void> {
    this.paths.ensureDir();
    this.paths.validateSocketPath();

    if (this.pidPreclaimed) {
      const deadline = Date.now() + 2_000;
      while (this.paths.readPid() !== process.pid && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 10));
      }
    }

    const weOwnPid = this.paths.readPid() === process.pid;

    if (!weOwnPid) {
      if (this.pidPreclaimed) {
        throw new Error('Daemon already running');
      }
      if (daemonPidAlive(this.paths) || await pingDaemon(this.paths)) {
        throw new Error('Daemon already running');
      }
      if (!cleanupStaleDaemon(this.paths)) {
        throw new Error('Daemon already running');
      }
      if (!this.paths.writePidExclusive(process.pid)) {
        throw new Error('Daemon already running');
      }
      this.ownsPid = true;
    } else if (await pingDaemon(this.paths)) {
      throw new Error('Daemon already running');
    }

    try {
      this.throwIfStopping();
      const store = new SessionStore(this.paths.configDir);
      this.releaseSession = await store.acquireLock(this.paths.profile);
      // A preclaimed PID belongs to this instance only after it also owns the
      // session. Another instance in this process may own the same PID already.
      this.ownsPid = true;
      this.throwIfStopping();
      const sessionString = this.clientOpts.sessionString ?? store.loadUnlocked(this.paths.profile);
      if (!sessionString) throw new Error('Not logged in. Run: tg auth login');
      this.paths.unlinkSocket();

      const { TelegramClient, sessions } = await import('telegram');
      this.throwIfStopping();
      const session = new sessions.StringSession(sessionString);
      const logger = createGramjsLogger([this.clientOpts.apiHash, sessionString]);
      this.client = new TelegramClient(session, this.clientOpts.apiId, this.clientOpts.apiHash, {
        connectionRetries: 3,
        retryDelay: 1000,
        floodSleepThreshold: 60,
        baseLogger: logger,
        ...connectionOptions(this.clientOpts.transport),
      });
      installClientErrorDiagnostics(this.client, logger);
      await connectOrThrow(this.client);
      this.throwIfStopping();

      this.server = createServer((socket) => this.handleConnection(socket));
      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.paths.socketPath, () => resolve());
        this.server!.on('error', reject);
      });

      chmodSync(this.paths.socketPath, 0o600);

      this.startTime = Date.now();
      this.resetIdle();
    } catch (err) {
      // Failed destruction cannot prove the session is safe for another owner.
      // Retain the lease and PID if teardown itself rejects.
      await this.client?.destroy();
      this.client = null;
      if (this.server) {
        const server = this.server;
        this.server = null;
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      this.cleanupPid();
      await this.releaseOwnership();
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopRequested = true;
    this.stopping = this.doStop();
    return this.stopping;
  }

  private async doStop(): Promise<void> {
    for (const request of this.activeRequests) {
      request.controller.abort(new TgError('Daemon is stopping; the outcome of submitted Telegram operations may be unknown.', ErrorCode.DAEMON_STOPPING));
    }
    // Closing transport is what interrupts an SDK connection attempt. Waiting
    // for start() first would prevent SIGTERM from ever initiating that cleanup.
    if (!this.server && this.client) await this.client.destroy();
    await this.starting?.catch(() => {});
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();

    const server = this.server;
    this.server = null;
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }

    if (this.client) {
      const started = [...this.activeRequests].map(request => request.done);
      await this.client.destroy();
      // Cancelling the RPC reply does not cancel a request already sent to
      // Telegram. Keep ownership until its command and all SDK work settle.
      await Promise.all(started);
      // A DC migration already in progress may reconnect after the first
      // destroy. Tear down its late transport before handing over the lease.
      if (started.length > 0) await this.client.destroy();
      this.client = null;
    }

    this.cleanupPid();
    await this.releaseOwnership();
  }

  private async releaseOwnership(): Promise<void> {
    const release = this.releaseSession;
    this.releaseSession = null;
    await release?.();
  }

  private throwIfStopping(): void {
    if (this.stopRequested) throw new Error('Daemon start cancelled');
  }

  private cleanupPid(): void {
    if (this.ownsPid) this.paths.cleanupOwned(process.pid);
    this.ownsPid = false;
  }

  getClient(): TelegramClient | null {
    return this.client;
  }

  private resetIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (this.stopping) return;
    if (this.idleTimeout <= 0) return;
    if (this.sockets.size > 0) return;
    if (this.activeRequests.size > 0) return;
    this.idleTimer = setTimeout(() => {
      void this.stop().then(() => this.onIdle?.()).catch(() => {});
    }, this.idleTimeout);
  }

  private handleConnection(socket: Socket): void {
    this.sockets.add(socket);
    this.resetIdle();
    socket.on('close', () => {
      for (const request of this.activeRequests) {
        if (request.socket === socket) request.controller.abort(new TgError(
          'Caller disconnected; the outcome of submitted Telegram operations may be unknown.', ErrorCode.DAEMON_CANCELLED,
        ));
      }
      this.sockets.delete(socket);
      this.resetIdle();
    });

    // A peer's reset, oversized frame or failed write belongs to that peer only.
    socket.on('error', () => socket.destroy());
    const decoder = new JsonLineDecoder();
    const write = (line: string) => {
      if (!socket.destroyed && socket.writable) socket.write(line + '\n');
    };
    const handleLine = async (line: string) => {
      if (socket.destroyed) return;
      this.resetIdle();

      let id: number | null = null;
      try {
        const msg = parseMessage(line);
        if (msg.type !== 'request') {
          write(encodeError(-32600, 'Expected request', null, null));
          return;
        }

        id = msg.id;
        const result = await this.dispatch(msg.method, msg.params, socket);
        const response = encodeResponse(result, id);
        if (Buffer.byteLength(response, 'utf-8') > MAX_FRAME_BYTES) {
          throw new TgError('Command completed but its response is too large. Narrow the requested data; do not blindly repeat writes.', ErrorCode.DAEMON_RESPONSE_TOO_LARGE);
        }
        write(response);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const code = err instanceof Error && 'code' in err ? (err as any).code : -32000;
        const data = err instanceof Error && 'code' in err && typeof (err as any).code === 'string'
          ? { tgCode: (err as any).code }
          : undefined;
        write(encodeError(typeof code === 'number' ? code : -32000, message, data, id));
      }
    };
    socket.on('data', (chunk: Buffer) => {
      try {
        decoder.push(chunk, (line) => {
          void handleLine(line).catch(() => socket.destroy());
        });
      } catch {
        socket.destroy();
      }
    });
  }

  private async dispatch(
    method: string,
    params: Record<string, unknown>,
    socket: Socket,
  ): Promise<unknown> {
    switch (method) {
      case 'ping':
        return 'pong';

      case 'status':
        return {
          running: true,
          pid: process.pid,
          uptime: Math.round((Date.now() - this.startTime) / 1000),
          idleTimeout: this.idleTimeout / 1000,
          connected: this.client != null && (this.client.connected ?? true),
          transport: this.clientOpts.transport ?? 'tcp',
          activeRequests: this.activeRequests.size,
          apiVersion: 1,
          capabilities: ['execute', 'subscribe'],
        };

      case 'shutdown':
        setTimeout(() => {
          void this.stop().then(() => this.onIdle?.()).catch(() => {});
        }, 100);
        return { shuttingDown: true };

      case 'subscribe':
        return this.subscribe(params, socket);

      case 'execute':
        return this.execute(params, socket);

      default:
        throw Object.assign(new Error(`Unknown method: ${method}`), { code: -32601 });
    }
  }

  /** Execute one allowlisted command against the already-connected client. */
  private async execute(params: Record<string, unknown>, socket: Socket): Promise<unknown> {
    if (params == null || typeof params !== 'object' || Array.isArray(params)) {
      throw new TgError('execute params must be an object', ErrorCode.INVALID_INPUT);
    }
    const timeoutMs = params.timeoutMs === undefined ? MAX_EXECUTION_TIMEOUT : params.timeoutMs;
    if (typeof timeoutMs !== 'number' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_EXECUTION_TIMEOUT) {
      throw new TgError('timeoutMs must be an integer from 1 to 120000', ErrorCode.INVALID_INPUT);
    }
    return this.runRequest(socket, timeoutMs, (client, signal) =>
      executeDaemonCommand(client, this.paths.profile, params, signal));
  }

  /** Bound active SDK work, while allowing the caller to stop waiting sooner. */
  private async runRequest<T>(
    socket: Socket,
    timeoutMs: number,
    work: (client: TelegramClient, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (this.stopRequested || !this.client) {
      throw new TgError('Daemon is stopping or has no connected client', ErrorCode.DAEMON_STOPPING);
    }
    if (this.activeRequests.size >= MAX_ACTIVE_REQUESTS) {
      throw new TgError('Daemon is busy (16 commands are still running). Wait for active work to finish.', ErrorCode.DAEMON_BUSY);
    }
    if (socket.destroyed) throw new TgError('Caller disconnected before execution', ErrorCode.DAEMON_CANCELLED);

    const controller = new AbortController();
    const view = createRequestClient(this.client, controller.signal);
    const request: ActiveRequest = { controller, done: Promise.resolve(), socket };
    this.activeRequests.add(request);
    this.resetIdle();
    const timer = setTimeout(() => controller.abort(new TgError(
      'Daemon request timed out. The outcome of submitted Telegram operations is unknown; check before repeating writes.', ErrorCode.TIMEOUT,
    )), timeoutMs);
    let rejectAborted!: (reason: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = reject; });
    const onAbort = () => rejectAborted(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });

    const operation = Promise.resolve().then(async () => {
      controller.signal.throwIfAborted();
      const result = await work(view.client, controller.signal);
      controller.signal.throwIfAborted();
      return result;
    });
    request.done = operation.then(() => {}, () => {}).then(() => view.settled()).finally(() => {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
      this.activeRequests.delete(request);
      this.resetIdle();
    });
    // The caller can stop waiting before work finishes; keep cleanup handled.
    void request.done.catch(() => {});
    try {
      return await Promise.race([operation, aborted]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Ack the subscribe RPC, then push `message` notifications on this socket
   * until it closes. Matching is by resolved peer id (+ optional topic).
   */
  private async subscribe(params: Record<string, unknown>, socket: Socket): Promise<unknown> {
    if (params == null || typeof params !== 'object' || Array.isArray(params)) {
      throw new TgError('subscribe params must be an object', ErrorCode.INVALID_INPUT);
    }
    return this.runRequest(socket, MAX_EXECUTION_TIMEOUT, (client, signal) =>
      this.prepareSubscription(params, socket, client, signal));
  }

  private async prepareSubscription(
    params: Record<string, unknown>, socket: Socket, client: TelegramClient, signal: AbortSignal,
  ): Promise<unknown> {
    const chat = String(params.chat ?? '').trim();
    if (!chat) {
      throw new Error('chat is required');
    }

    let topic: number | undefined;
    if (params.topic != null) {
      topic = parseTopicId(String(params.topic));
    }

    const entity = await resolveEntity(client, chat);
    signal.throwIfAborted();
    if (socket.destroyed || !this.client) throw new Error('Subscriber disconnected');
    const wantId = markedPeerId(entity);
    if (!wantId) {
      throw new Error(`Could not resolve chat id for ${chat}`);
    }

    const handler = (event: any) => {
      try {
        const msg = event?.message ?? event;
        if (!msg || msg.id == null) return;

        const chatId = messagePeerMarkedId(msg);
        if (!chatId || chatId !== wantId) return;

        if (topic != null && !messageMatchesTopic(msg, topic)) return;

        const payload = serializeMessage(msg, msg._sender) as unknown as Record<string, unknown>;
        if (!socket.destroyed) {
          this.resetIdle();
          socket.write(encodeNotification('message', payload) + '\n');
        }
      } catch {
        // Never throw into gramjs _updateLoop
      }
    };

    const builder = new NewMessage({});
    // After the acknowledgement, this handler belongs to the shared transport
    // and socket, independent of the request view used to prepare it.
    const sharedClient = this.client;
    sharedClient.addEventHandler(handler, builder);
    socket.once('close', () => {
      try {
        sharedClient.removeEventHandler(handler, builder);
      } catch {
        // gramjs removeEventHandler is best-effort
      }
    });

    return { subscribed: true, chat, topic: topic ?? null };
  }
}
