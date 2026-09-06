import { afterEach, describe, expect, it, vi } from 'vitest';
import { Api, TelegramClient, sessions, errors } from 'telegram';
import bigInt from 'big-integer';
import { Logger, LogLevel } from 'telegram/extensions/Logger.js';
import { createRequestClient } from '../../src/lib/daemon/request-client.js';
import { DaemonServer } from '../../src/lib/daemon/server.js';
import { DaemonPaths } from '../../src/lib/daemon/pid.js';
import { executeDaemonCommand } from '../../src/lib/daemon/execute.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function sharedClient() {
  const logger = new Logger(LogLevel.NONE);
  const client = new TelegramClient(new sessions.StringSession(''), 1, 'synthetic', { baseLogger: logger });
  client.session.setDC(4, '127.0.0.1', 80);
  (client as any)._connectedDeferred.resolve();
  return client;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('independent real SDK daemon client review', () => {
  it('serializes a real SDK dialog message initialized with the default Markdown parse mode', async () => {
    const shared = sharedClient();
    const peer = new Api.PeerUser({ userId: bigInt(7) });
    const response = new Api.messages.Dialogs({
      users: [new Api.User({ id: bigInt(7), accessHash: bigInt(8), firstName: 'Fixture' })],
      chats: [],
      messages: [new Api.Message({
        id: 9, peerId: peer, date: 1700000000, message: 'Bold fixture',
        entities: [new Api.MessageEntityBold({ offset: 0, length: 4 })],
      })],
      dialogs: [new Api.Dialog({
        peer, topMessage: 9, readInboxMaxId: 0, readOutboxMaxId: 0,
        unreadCount: 0, unreadMentionsCount: 0, unreadReactionsCount: 0,
        notifySettings: new Api.PeerNotifySettings({}),
      })],
    });
    const enqueue = vi.fn((state: any) => state.resolve(response));
    (shared as any)._sender = { isConnected: () => true, addStateToQueue: enqueue };
    const signal = new AbortController().signal;
    const view = createRequestClient(shared, signal);
    const result = await executeDaemonCommand(view.client, 'fixture', { argv: ['chat', 'list', '--limit', '1'] }, signal);
    // The SDK returns TotalList subclasses; compare the API's serialized wire shape.
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({ output: { ok: true, data: { chats: [{ id: '7' }], total: 1 } }, exitCode: 0 });
    expect(response.messages[0].text).toBe('**Bold** fixture');
    expect(enqueue).toHaveBeenCalledOnce();
    await view.settled();
  });

  it('uses real SDK default Markdown parsing and initializes the sent message response', async () => {
    const shared = sharedClient();
    const enqueue = vi.fn((state: any) => {
      expect(state.request).toBeInstanceOf(Api.messages.SendMessage);
      state.resolve(new Api.UpdateShortSentMessage({
        id: 77, pts: 1, ptsCount: 1, date: 1700000000, out: true,
        entities: state.request.entities,
      }));
    });
    (shared as any)._sender = { isConnected: () => true, addStateToQueue: enqueue };
    const view = createRequestClient(shared, new AbortController().signal);
    const peer = new Api.InputPeerUser({ userId: bigInt(7), accessHash: bigInt(8) });
    const sent = await view.client.sendMessage(peer, { message: '**Bold** and __italic__' });
    expect(sent.id).toBe(77);
    expect(sent.message).toBe('Bold and italic');
    expect(sent.text).toBe('**Bold** and __italic__');
    const request = enqueue.mock.calls[0][0].request;
    expect(request.message).toBe('Bold and italic');
    expect(request.entities[0]).toBeInstanceOf(Api.MessageEntityBold);
    expect(request.entities[1]).toBeInstanceOf(Api.MessageEntityItalic);
    expect(enqueue).toHaveBeenCalledOnce();
    await view.settled();
  });

  it('preserves connection and socket constructors required by real SDK media sender setup', async () => {
    vi.useFakeTimers();
    const shared = sharedClient();
    const controller = new AbortController();
    // Replace transport connection only; _connectSender itself is the installed SDK.
    const sender = {
      authKey: { getKey: () => Buffer.alloc(256) },
      connect: vi.fn(async () => true), disconnect: vi.fn(async () => {}),
      _authenticated: true,
    };
    vi.spyOn(shared, 'getDC').mockResolvedValue({ id: 4, ipAddress: '127.0.0.1', port: 80 } as any);
    const errorsSeen: unknown[] = [];
    (shared as any)._errorHandler = async (error: unknown) => {
      errorsSeen.push(error);
      controller.abort(error);
    };
    const view = createRequestClient(shared, controller.signal);
    const result = (view.client as any)._connectSender(sender, 4).then(
      (value: unknown) => ({ value }), (error: unknown) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toMatchObject({ value: { dcId: 4, _authenticated: true, userDisconnected: false } });
    expect(errorsSeen).toEqual([]);
    expect(sender.connect).toHaveBeenCalledOnce();
    await view.settled();
  });

  it('does not store cancelled request callbacks in a reusable exported MTProtoSender', async () => {
    vi.useFakeTimers();
    const shared = sharedClient();
    const controller = new AbortController();
    // Real sender creation, callback binding and exported-sender cache; no network.
    vi.spyOn(shared as any, '_connectSender').mockImplementation(async (sender: any) => {
      sender._userConnected = true;
      return sender;
    });
    const view = createRequestClient(shared, controller.signal);
    await view.client.getSender(2);
    const sender = await (shared as any)._exportedSenderPromises.get(2);
    const setAuthKey = vi.spyOn(shared.session, 'setAuthKey');
    controller.abort(new Error('The originating request ended'));
    await view.settled();

    // A later key rotation or connection-break callback belongs to the shared
    // transport, even if the command which first borrowed it has timed out.
    const callback = Promise.resolve().then(() => sender._authKeyCallback(sender.authKey, 2));
    await expect(callback).resolves.toBeUndefined();
    expect(setAuthKey).toHaveBeenCalledWith(sender.authKey, 2);
    const next = createRequestClient(shared, new AbortController().signal);
    await expect(next.client.getSender(2)).resolves.toBeDefined();
    await next.settled();
  });

  it('completes an already-started SDK DC switch when the initiating request aborts during disconnect', async () => {
    const shared = sharedClient();
    const controller = new AbortController();
    const disconnectStarted = deferred<void>();
    const disconnectFinish = deferred<void>();
    const oldSender = {
      authKey: { setKey: vi.fn(async () => {}) },
      isConnected: () => true,
    };
    (shared as any)._sender = oldSender;
    vi.spyOn(shared, 'getDC').mockResolvedValue({ id: 2, ipAddress: '127.0.0.1', port: 80 } as any);
    vi.spyOn(shared as any, '_disconnect').mockImplementation(async () => {
      disconnectStarted.resolve();
      await disconnectFinish.promise;
    });
    const connect = vi.spyOn(shared, 'connect').mockImplementation(async function () {
      (this as any)._sender = { isConnected: () => true };
      return true;
    });
    const view = createRequestClient(shared, controller.signal);
    const switching = (view.client as any)._switchDC(2).catch(() => undefined);
    await disconnectStarted.promise;
    controller.abort(new Error('Request timed out'));
    disconnectFinish.resolve();
    await switching;
    await view.settled();
    expect(connect).toHaveBeenCalledOnce();
    expect(shared.connected).toBe(true);
    const subsequent = createRequestClient(shared, new AbortController().signal);
    expect(subsequent.client.connected).toBe(true);
  });

  it('runs real message iterators and getters on a fresh request after cancelling another one', async () => {
    const shared = sharedClient();
    const response = new Api.messages.Messages({
      messages: [new Api.Message({ id: 7, peerId: new Api.PeerUser({ userId: bigInt(1) }), date: 1700000000, message: 'fixture' })],
      chats: [], users: [],
    });
    const enqueue = vi.fn((state: any) => state.resolve(response));
    (shared as any)._sender = { isConnected: () => true, addStateToQueue: enqueue };
    const controller = new AbortController();
    const first = createRequestClient(shared, controller.signal);
    const peer = new Api.InputPeerUser({ userId: bigInt(1), accessHash: bigInt(2) });
    const iterator = first.client.iterMessages(peer, { ids: [7] })[Symbol.asyncIterator]();
    expect((await iterator.next()).value?.id).toBe(7);
    controller.abort(new Error('cancelled'));
    expect(() => iterator.next()).toThrow('cancelled');
    await first.settled();
    const second = createRequestClient(shared, new AbortController().signal);
    expect(second.client.connected).toBe(true);
    const messages = await second.client.getMessages(peer, { ids: [7] });
    expect(Array.from(messages, message => message.id)).toEqual([7]);
    expect(enqueue).toHaveBeenCalledTimes(2);
    await second.settled();
  });

  it('recovers the shared connection if a request aborts inside SDK CONNECTION_NOT_INITED backoff', async () => {
    vi.useFakeTimers();
    const shared = sharedClient();
    let connected = true;
    const enqueue = vi.fn((state: any) => state.reject(new Error('CONNECTION_NOT_INITED')));
    (shared as any)._sender = { isConnected: () => connected, addStateToQueue: enqueue };
    const disconnect = vi.spyOn(shared, 'disconnect').mockImplementation(async () => { connected = false; });
    const connect = vi.spyOn(shared, 'connect').mockImplementation(async () => { connected = true; return true; });
    const controller = new AbortController();
    const view = createRequestClient(shared, controller.signal);
    const invoking = view.client.invoke(new Api.help.GetConfig()).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(disconnect).toHaveBeenCalledOnce();
    controller.abort(new Error('request timeout during recovery delay'));
    await vi.advanceTimersByTimeAsync(2000);
    await invoking;
    await view.settled();
    expect(connect).toHaveBeenCalledOnce();
    expect(shared.connected).toBe(true);
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('destroys a transport which late maintenance reopens before releasing the daemon session lease', async () => {
    const shared = sharedClient();
    const controller = new AbortController();
    const disconnectStarted = deferred<void>();
    const disconnectFinish = deferred<void>();
    let connected = true;
    (shared as any)._sender = {
      authKey: { setKey: vi.fn(async () => {}) }, isConnected: () => connected,
    };
    vi.spyOn(shared, 'getDC').mockResolvedValue({ id: 2, ipAddress: '127.0.0.1', port: 80 } as any);
    vi.spyOn(shared as any, '_disconnect').mockImplementation(async () => {
      disconnectStarted.resolve();
      await disconnectFinish.promise;
    });
    vi.spyOn(shared, 'connect').mockImplementation(async function () {
      connected = true;
      (this as any)._sender = { isConnected: () => connected };
      return true;
    });
    const destroy = vi.spyOn(shared, 'destroy').mockImplementation(async () => { connected = false; });
    const view = createRequestClient(shared, controller.signal);
    const operation = (view.client as any)._switchDC(2).catch(() => undefined);
    const done = operation.then(() => view.settled());
    const server = new DaemonServer(new DaemonPaths('/synthetic-unused', 'fixture'), { apiId: 1, apiHash: 'synthetic' });
    (server as any).client = shared;
    (server as any).activeRequests.add({ controller, done });
    let connectedAtRelease: boolean | undefined;
    const release = vi.fn(async () => { connectedAtRelease = connected; });
    (server as any).releaseSession = release;
    await disconnectStarted.promise;
    const stopping = server.stop();
    await vi.waitFor(() => expect(destroy).toHaveBeenCalled());
    expect(release).not.toHaveBeenCalled();
    disconnectFinish.resolve();
    await stopping;
    expect(connectedAtRelease).toBe(false);
    expect(connected).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it('prevents actual SDK server-error replay after cancellation without altering shared retry settings', async () => {
    vi.useFakeTimers();
    const shared = sharedClient();
    const initialRetries = (shared as any)._requestRetries;
    const enqueue = vi.fn((state: any) => state.reject({ errorMessage: 'RPC_CALL_FAIL' }));
    (shared as any)._sender = { addStateToQueue: enqueue };
    const controller = new AbortController();
    const view = createRequestClient(shared, controller.signal);
    const request = view.client.invoke(new Api.help.GetConfig());
    const rejected = expect(request).rejects.toThrow('cancelled');
    await vi.advanceTimersByTimeAsync(0);
    expect(enqueue).toHaveBeenCalledOnce();
    controller.abort(new Error('cancelled'));
    await vi.advanceTimersByTimeAsync(2000);
    await rejected;
    await view.settled();
    expect(enqueue).toHaveBeenCalledOnce();
    expect((shared as any)._requestRetries).toBe(initialRetries);
  });

  it('surfaces the SDK FloodWait error immediately instead of sleeping or replaying a write', async () => {
    const shared = sharedClient();
    const request = new Api.help.GetConfig();
    const flood = new errors.FloodWaitError({ capture: 30, request });
    const enqueue = vi.fn((state: any) => state.reject(flood));
    (shared as any)._sender = { addStateToQueue: enqueue };
    const view = createRequestClient(shared, new AbortController().signal);
    await expect(view.client.invoke(request)).rejects.toBe(flood);
    await view.settled();
    expect(enqueue).toHaveBeenCalledOnce();
    expect(shared.floodSleepThreshold).toBe(60);
  });
});
