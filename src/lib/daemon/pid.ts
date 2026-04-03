// src/lib/daemon/pid.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Manages daemon PID file and socket path for a given profile.
 *
 * Paths:
 *   Socket: {configDir}/daemon/{profile}.sock
 *   PID:    {configDir}/daemon/{profile}.pid
 */
export class DaemonPaths {
  readonly socketPath: string;
  readonly pidPath: string;
  readonly logPath: string;

  constructor(configDir: string, profile: string) {
    const daemonDir = join(configDir, 'daemon');
    this.socketPath = join(daemonDir, `${profile}.sock`);
    this.pidPath = join(daemonDir, `${profile}.pid`);
    this.logPath = join(daemonDir, `${profile}.log`);
  }

  /**
   * Validate that the socket path fits within AF_UNIX limits.
   * macOS: 104 bytes, Linux: 108 bytes. Use 104 for portability.
   */
  validateSocketPath(): void {
    if (Buffer.byteLength(this.socketPath, 'utf-8') > 104) {
      throw new Error(
        `Socket path too long (${this.socketPath.length} chars, max 104). ` +
        'Use --config to set a shorter config directory path.',
      );
    }
  }

  /** Ensure the daemon directory exists. */
  ensureDir(): void {
    const dir = dirname(this.socketPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /** Write the current process PID. */
  writePid(pid: number): void {
    this.ensureDir();
    writeFileSync(this.pidPath, String(pid), 'utf-8');
  }

  /** Read the stored PID, or null if file doesn't exist. */
  readPid(): number | null {
    if (!existsSync(this.pidPath)) return null;
    const content = readFileSync(this.pidPath, 'utf-8').trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  }

  /** Check whether the socket file exists. */
  socketExists(): boolean {
    return existsSync(this.socketPath);
  }

  /** Remove PID file and socket file. */
  cleanup(): void {
    for (const p of [this.pidPath, this.socketPath]) {
      if (existsSync(p)) {
        try { unlinkSync(p); } catch {}
      }
    }
  }
}
