// src/lib/daemon/pid.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

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

  constructor(readonly configDir: string, readonly profile: string) {
    const daemonDir = join(configDir, 'daemon');
    const safe = basename(profile);
    this.socketPath = join(daemonDir, `${safe}.sock`);
    this.pidPath = join(daemonDir, `${safe}.pid`);
    this.logPath = join(daemonDir, `${safe}.log`);
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

  /** Ensure the daemon directory exists with owner-only access. */
  ensureDir(): void {
    const dir = dirname(this.socketPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  /** Write the current process PID. */
  writePid(pid: number): void {
    this.ensureDir();
    writeFileSync(this.pidPath, String(pid), { encoding: 'utf-8', mode: 0o600 });
  }

  /** Create the PID file exclusively. False if it already exists. */
  writePidExclusive(pid: number): boolean {
    this.ensureDir();
    try {
      writeFileSync(this.pidPath, String(pid), { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
      return true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw err;
    }
  }

  unlinkSocket(): void {
    if (existsSync(this.socketPath)) {
      try { unlinkSync(this.socketPath); } catch { /* stale socket */ }
    }
  }

  /** Read the stored PID, or null if file doesn't exist or PID is invalid. */
  readPid(): number | null {
    if (!existsSync(this.pidPath)) return null;
    const content = readFileSync(this.pidPath, 'utf-8').trim();
    const pid = /^\d+$/.test(content) ? Number(content) : NaN;
    // Reject non-positive, NaN, and implausibly large PIDs to prevent
    // process.kill(0) (kill process group) or kill(-1) (kill all user procs)
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 4_194_304) return null;
    return pid;
  }

  /** Check whether the socket file exists. */
  socketExists(): boolean {
    return existsSync(this.socketPath);
  }

  /** Remove PID file and socket file. Caller must have checked nothing live owns them. */
  cleanup(): void {
    for (const p of [this.pidPath, this.socketPath]) {
      if (existsSync(p)) {
        try { unlinkSync(p); } catch {}
      }
    }
  }

  /**
   * Unlink socket then pid, each only if the pid file still contains `pid`.
   * Socket first: unlinking pid first lets a successor take `wx` and then
   * get its socket deleted. No-op when another process owns the files.
   */
  cleanupOwned(pid: number): void {
    if (this.readPid() === pid) this.unlinkSocket();
    if (this.readPid() === pid) {
      try { unlinkSync(this.pidPath); } catch { /* gone */ }
    }
  }
}
