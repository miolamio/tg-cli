/** Offline transport for the multi-process ownership regression suite. */
export { Api } from 'telegram/tl/api.js';

export const sessions = {
  StringSession: class StringSession {
    constructor(private readonly value: string) {}
    save(): string { return this.value || 'synthetic-new-session'; }
  },
};

export class TelegramClient {
  connected = false;
  private destroyCount = 0;
  constructor(readonly session: { save(): string }) {}
  async connect(): Promise<void> {
    await (globalThis as any).ownershipBarrier('connecting');
    this.connected = true;
    process.send?.({ event: 'connected' });
  }
  async start(): Promise<void> { if (!this.connected) await this.connect(); }
  async checkAuthorization(): Promise<boolean> { return true; }
  async destroy(): Promise<void> {
    this.connected = false;
    const suffix = (globalThis as any).ownershipTimeoutRole ? `-${++this.destroyCount}` : '';
    await (globalThis as any).ownershipBarrier(`destroying${suffix}`);
    process.send?.({ event: `destroyed${suffix}` });
  }
}
