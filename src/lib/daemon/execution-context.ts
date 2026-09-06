import { AsyncLocalStorage } from 'node:async_hooks';
import type { TelegramClient } from 'telegram';
import type { OutputEnvelope } from '../types.js';

/** State belonging to one command on the daemon's existing Telegram client. */
export interface DaemonExecutionContext {
  client: TelegramClient;
  profile: string;
  signal: AbortSignal;
  stdin?: string;
  cwd?: string;
  output?: OutputEnvelope<unknown>;
  exitCode: number;
}

const contexts = new AsyncLocalStorage<DaemonExecutionContext>();

/** Keep async continuations attached to their request, including concurrent commands. */
export async function runWithDaemonContext<T>(
  context: DaemonExecutionContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  return contexts.run(context, fn);
}

/** Undefined outside a daemon command; direct CLI and library calls keep their behavior. */
export function getDaemonContext(): DaemonExecutionContext | undefined {
  return contexts.getStore();
}

/** Shared SDK timers and transport loops must outlive requests without retaining their DTOs. */
export function runOutsideDaemonContext<T>(fn: () => T): T {
  return contexts.exit(fn);
}

/** A failed command must not change the exit status of the daemon hosting it. */
export function markExitFailure(): void {
  const context = getDaemonContext();
  if (context) context.exitCode = 1;
  else process.exitCode = 1;
}

/** Capture raw DTOs before formatting. Later output cannot replace the first response. */
export function captureDaemonOutput(envelope: OutputEnvelope<unknown>): boolean {
  const context = getDaemonContext();
  if (!context) return false;
  context.output ??= envelope;
  return true;
}
