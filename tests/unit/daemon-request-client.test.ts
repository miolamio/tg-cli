import { describe, expect, it, vi } from 'vitest';
import { createRequestClient } from '../../src/lib/daemon/request-client.js';
import { getDaemonContext, runWithDaemonContext } from '../../src/lib/daemon/execution-context.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

describe('daemon request cancellation proxy', () => {
  it('guards captured methods and nested SDK calls after an await', async () => {
    const controller = new AbortController();
    const gate = deferred<void>();
    const underlying = {
      invoke: vi.fn(async () => 'written'),
      async sendMessage() { await gate.promise; return this.invoke(); },
    };
    const view = createRequestClient(underlying as any, controller.signal);
    const captured = view.client.invoke;
    const sent = view.client.sendMessage('unused', { message: 'text' });
    const rejected = expect(sent).rejects.toThrow('cancelled');
    controller.abort(new Error('cancelled'));
    expect(() => captured({} as any)).toThrow('cancelled');
    gate.resolve();
    await rejected;
    await view.settled();
    expect(underlying.invoke).not.toHaveBeenCalled();
  });

  it('tracks an in-flight lazy iterator step but prevents the following next call', async () => {
    const controller = new AbortController();
    const gate = deferred<IteratorResult<number>>();
    const next = vi.fn(() => gate.promise);
    const underlying = { iterMessages: () => ({ [Symbol.asyncIterator]: () => ({ next }) }) };
    const view = createRequestClient(underlying as any, controller.signal);
    const iterator = view.client.iterMessages(undefined, {})[Symbol.asyncIterator]();
    const first = iterator.next();
    controller.abort(new Error('cancelled'));
    let settled = false;
    const completion = view.settled().then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    gate.resolve({ done: false, value: 1 });
    await first;
    expect(() => iterator.next()).toThrow('cancelled');
    await completion;
    expect(next).toHaveBeenCalledOnce();
  });

  it('retains detached SDK promises without an unhandled rejection', async () => {
    const controller = new AbortController();
    const gate = deferred<void>();
    const underlying = { invoke: vi.fn(async () => { await gate.promise; throw new Error('Late RPC error'); }) };
    const view = createRequestClient(underlying as any, controller.signal);
    void view.client.invoke({} as any);
    let settled = false;
    const completion = view.settled().then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    gate.resolve();
    await completion;
    expect(settled).toBe(true);
  });

  it('protects sender queues and exported senders captured before cancellation', async () => {
    const controller = new AbortController();
    const sender = { addStateToQueue: vi.fn(), send: vi.fn(async () => 'sent') };
    const underlying = { _sender: sender, getSender: async () => sender };
    const view = createRequestClient(underlying as any, controller.signal);
    const main = (view.client as any)._sender;
    const exported = await (view.client as any).getSender();
    controller.abort(new Error('cancelled'));
    expect(() => main.addStateToQueue({})).toThrow('cancelled');
    expect(() => exported.send({})).toThrow('cancelled');
    await view.settled();
    expect(sender.addStateToQueue).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('sets request-local retry policy while preserving shared options and SDK migration calls', async () => {
    const controller = new AbortController();
    const underlying = {
      _requestRetries: 9,
      floodSleepThreshold: 60,
      connect: vi.fn(async () => true),
      async _switchDC() { return this.connect(); },
    };
    const view = createRequestClient(underlying as any, controller.signal);
    expect((view.client as any)._requestRetries).toBe(1);
    expect(view.client.floodSleepThreshold).toBe(0);
    await expect((view.client as any)._switchDC()).resolves.toBe(true);
    await view.settled();
    expect(underlying.connect).toHaveBeenCalledOnce();
    expect(underlying._requestRetries).toBe(9);
    expect(underlying.floodSleepThreshold).toBe(60);
  });

  it('starts shared transport maintenance outside the request context while keeping command calls isolated', async () => {
    const controller = new AbortController();
    const gate = deferred<void>();
    const observed: unknown[] = [];
    const underlying = {
      async getSender() {
        observed.push(getDaemonContext());
        await gate.promise;
        observed.push(getDaemonContext());
        return { send: vi.fn() };
      },
      invoke: vi.fn(async () => getDaemonContext()),
    };
    const view = createRequestClient(underlying as any, controller.signal);
    const context = { client: view.client, signal: controller.signal, profile: 'fixture', exitCode: 0 };
    const running = runWithDaemonContext(context, async () => {
      const sender = view.client.getSender(2);
      expect(getDaemonContext()).toBe(context);
      expect(await view.client.invoke({} as any)).toBe(context);
      return sender;
    });
    gate.resolve();
    await running;
    await view.settled();
    expect(observed).toEqual([undefined, undefined]);
    expect(getDaemonContext()).toBeUndefined();
  });
});
