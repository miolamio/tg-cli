import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const { mockCreateConnection } = vi.hoisted(() => ({ mockCreateConnection: vi.fn() }));
vi.mock('node:net', () => ({ createConnection: mockCreateConnection }));
import { DaemonClient } from '../../src/lib/daemon/client.js';

class PendingSocket extends EventEmitter {
  write = vi.fn();
  destroy = vi.fn(() => this);
}

describe('DaemonClient connection deadline', () => {
  afterEach(() => vi.useRealTimers());

  it.each(['call', 'watch'] as const)('bounds a stalled %s connection and destroys it', async (mode) => {
    vi.useFakeTimers();
    const socket = new PendingSocket();
    mockCreateConnection.mockReturnValue(socket);
    const client = new DaemonClient('/unused');
    const pending = mode === 'call'
      ? client.call('ping', {}, { timeoutMs: 100 })
      : client.watch({}, () => {}, { timeoutMs: 100 });
    const assertion = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(socket.destroy).toHaveBeenCalledOnce();
    expect(socket.write).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('contains post-connect errors and clears pending deadlines', async () => {
    vi.useFakeTimers();
    const socket = new PendingSocket();
    mockCreateConnection.mockReturnValue(socket);
    const pending = new DaemonClient('/unused').call('ping', {});
    const assertion = expect(pending).rejects.toThrow('Socket failed');
    socket.emit('connect');
    socket.emit('error', new Error('Socket failed'));
    await assertion;
    socket.emit('error', new Error('Late error'));
    expect(socket.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
