import type { TelegramClient } from 'telegram';
import { runOutsideDaemonContext } from './execution-context.js';

// These SDK methods create/cache transport objects, retain callbacks or change
// the shared connection. They must never retain the lifetime of one request.
// Once started, their maintenance finishes even if that request is cancelled.
const SHARED_LIFETIME_METHODS = new Set<PropertyKey>([
  'getSender', '_borrowExportedSender', '_createExportedSender', '_connectSender',
  '_switchDC', 'connect', '_disconnect', 'disconnect', 'destroy',
  '_authKeyCallback', '_cleanupExportedSender', '_handleReconnect',
]);

/** SDK view and outstanding work owned by one daemon command. */
export interface RequestClient {
  client: TelegramClient;
  /** Wait for every already-started SDK promise, including detached calls. */
  settled(): Promise<void>;
}

/**
 * A request-local client view: cancellation never destroys the shared client.
 * Calls keep this view as `this`, so SDK helpers that make another client call
 * after an await also observe cancellation. Shared transport maintenance keeps
 * the real client as `this`; it must complete and its retained callbacks must
 * remain usable after this request ends. Lazy iterators and sender queue entry
 * points are guarded as well. Existing RPCs remain tracked until settled.
 */
export function createRequestClient(client: TelegramClient, signal: AbortSignal): RequestClient {
  const pending = new Set<Promise<unknown>>();
  const views = new WeakMap<object, object>();
  let reconnectRequired = false;

  const track = (promise: PromiseLike<unknown>, transform: (value: unknown) => unknown): Promise<unknown> => {
    const tracked = Promise.resolve(promise).then(transform);
    pending.add(tracked);
    // Both branches handle rejection even if an SDK helper detaches its promise.
    void tracked.then(() => pending.delete(tracked), () => pending.delete(tracked));
    return tracked;
  };

  const wrapResult = (value: unknown, sender = false): unknown => {
    if (value == null || (typeof value !== 'object' && typeof value !== 'function')) return value;
    if (typeof (value as PromiseLike<unknown>).then === 'function') {
      return track(value as PromiseLike<unknown>, (result) => wrapResult(result, sender));
    }
    if (sender || typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function'
      || typeof (value as Iterator<unknown>).next === 'function') {
      return wrap(value as object, sender ? 'sender' : 'iterator');
    }
    return value;
  };

  const wrap = (target: object, kind: 'client' | 'sender' | 'iterator'): object => {
    const existing = views.get(target);
    if (existing) return existing;
    const functions = new Map<PropertyKey, { original: Function; guarded: Function }>();
    const view = new Proxy(target, {
      get(object, key, receiver) {
        // Avoid SDK request replay without changing the shared client's options.
        if (kind === 'client' && key === '_requestRetries') { signal.throwIfAborted(); return 1; }
        if (kind === 'client' && key === 'floodSleepThreshold') return 0;
        const value = Reflect.get(object, key, receiver);
        if (kind === 'client' && key === '_sender' && value) return wrap(value, 'sender');
        if (kind === 'client' && (key === '_connection' || key === 'networkSocket')) return value;
        if (typeof value !== 'function' || key === 'constructor') return value;
        const cached = functions.get(key);
        if (cached && cached.original === value) return cached.guarded;
        // SDK properties also include classes such as MarkdownParser. A
        // function proxy preserves their static APIs and constructor behavior.
        const guarded = new Proxy(value, {
          apply(fn, _thisArg, args: unknown[]) {
            // SDK invoke repairs CONNECTION_NOT_INITED with disconnect(), a
            // delay, then connect(). Complete that repair across cancellation;
            // the next user RPC still passes through the guarded sender queue.
            if (!(kind === 'client' && key === 'connect' && reconnectRequired)) signal.throwIfAborted();
            if (kind === 'client' && key === 'disconnect') reconnectRequired = true;
            const sharedLifetime = kind === 'client' && SHARED_LIFETIME_METHODS.has(key);
            const result = sharedLifetime
              ? runOutsideDaemonContext(() => Reflect.apply(fn, object, args))
              : Reflect.apply(fn, receiver, args);
            if (kind === 'client' && key === 'connect') reconnectRequired = false;
            return wrapResult(result, kind === 'client' && (
              key === 'getSender' || key === '_borrowExportedSender' || key === '_createExportedSender' || key === '_connectSender'
            ));
          },
          construct(fn, args, newTarget) {
            signal.throwIfAborted();
            return Reflect.construct(fn, args, newTarget);
          },
        });
        functions.set(key, { original: value, guarded });
        return guarded;
      },
      set(object, key, value) {
        return Reflect.set(object, key, value, object);
      },
    });
    views.set(target, view);
    views.set(view, view);
    return view;
  };

  return {
    client: wrap(client, 'client') as TelegramClient,
    async settled() {
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
    },
  };
}
