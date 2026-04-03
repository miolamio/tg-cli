// src/lib/daemon/client.ts
import { createConnection, type Socket } from 'node:net';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { encodeRequest, parseMessage } from './protocol.js';

/**
 * JSON-RPC client for communicating with the daemon over Unix socket.
 * Creates a new connection for each call (simple, reliable).
 */
export class DaemonClient {
  private readonly socketPath: string;
  private socket: Socket | null = null;
  private nextId = 1;

  constructor(socketPath: string) {
    this.socketPath = socketPath;
  }

  /**
   * Send a JSON-RPC request and wait for the response.
   */
  async call(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const socket = createConnection(this.socketPath);

    try {
      await once(socket, 'connect');
    } catch (err) {
      socket.destroy();
      throw new Error(`Cannot connect to daemon at ${this.socketPath}: ${(err as Error).message}`);
    }

    const rl = createInterface({ input: socket });

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        rl.close();
        socket.destroy();
        reject(new Error('Daemon request timed out (30s)'));
      }, 30_000);

      rl.on('line', (line) => {
        clearTimeout(timeout);
        rl.close();
        socket.destroy();

        try {
          const msg = parseMessage(line);
          if (msg.type === 'response') {
            resolve(msg.result);
          } else if (msg.type === 'error') {
            reject(new Error(msg.error.message));
          } else {
            reject(new Error('Unexpected message type from daemon'));
          }
        } catch (err) {
          reject(err);
        }
      });

      socket.write(encodeRequest(method, params, id) + '\n');
    });
  }

  /** Close any held resources. */
  close(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}
