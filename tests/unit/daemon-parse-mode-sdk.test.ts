import { describe, expect, it, vi } from 'vitest';
import { Api, TelegramClient, sessions } from 'telegram';
import bigInt from 'big-integer';
import { Logger, LogLevel } from 'telegram/extensions/Logger.js';
import { createRequestClient } from '../../src/lib/daemon/request-client.js';
import { executeDaemonCommand } from '../../src/lib/daemon/execute.js';
import { serializeMessage } from '../../src/lib/serialize.js';

function fixture() {
  const client = new TelegramClient(new sessions.StringSession(''), 1, 'synthetic', {
    baseLogger: new Logger(LogLevel.NONE),
  });
  (client as any)._connectedDeferred.resolve();
  const user = new Api.User({ id: bigInt(7), accessHash: bigInt(8), firstName: 'Fixture' });
  const message = () => new Api.Message({
    id: 9, peerId: new Api.PeerUser({ userId: user.id }), date: 1700000000,
    message: 'hello', entities: [new Api.MessageEntityBold({ offset: 0, length: 5 })],
  });
  const enqueue = vi.fn((state: any) => {
    if (state.request instanceof Api.messages.GetDialogs) {
      state.resolve(new Api.messages.Dialogs({
        dialogs: [new Api.Dialog({
          peer: new Api.PeerUser({ userId: user.id }), topMessage: 9,
          readInboxMaxId: 9, readOutboxMaxId: 9, unreadCount: 0, unreadMentionsCount: 0,
          unreadReactionsCount: 0, notifySettings: new Api.PeerNotifySettings({}),
          draft: new Api.DraftMessage({
            message: 'draft', date: 1700000000,
            entities: [new Api.MessageEntityItalic({ offset: 0, length: 5 })],
          }),
        })],
        messages: [message()], users: [user], chats: [],
      }));
    } else if (state.request instanceof Api.messages.GetMessages) {
      state.resolve(new Api.messages.Messages({ messages: [message()], users: [user], chats: [] }));
    } else {
      state.reject(new Error(`Unexpected offline request: ${state.request.className}`));
    }
  });
  (client as any)._sender = { isConnected: () => true, addStateToQueue: enqueue };
  return { client, user, enqueue };
}

describe('real SDK parse mode through the daemon request view', () => {
  it('executes chat list with the default MarkdownParser and real SDK dialog/draft construction', async () => {
    const shared = fixture();
    const controller = new AbortController();
    const view = createRequestClient(shared.client, controller.signal);
    const result = await executeDaemonCommand(view.client, 'fixture', { argv: ['chat', 'list', '--limit', '3'] }, controller.signal);
    await view.settled();
    // GramJS TotalList is an Array subclass; compare the actual wire DTO.
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({
      output: { ok: true, data: { chats: [{ id: '7', title: 'Fixture', type: 'user' }], total: 1 } }, exitCode: 0,
    });
    expect(shared.enqueue).toHaveBeenCalledOnce();
    expect(shared.client.parseMode!.unparse('draft', [new Api.MessageEntityItalic({ offset: 0, length: 5 })])).toBe('__draft__');
  });

  it('preserves real message text parsing and serialization before and after another request is cancelled', async () => {
    const shared = fixture();
    const peer = new Api.InputPeerUser({ userId: shared.user.id, accessHash: bigInt(8) });
    for (const cancelled of [true, false]) {
      const controller = new AbortController();
      const view = createRequestClient(shared.client, controller.signal);
      const messages = await view.client.getMessages(peer, { ids: [9] });
      await view.settled();
      if (cancelled) controller.abort(new Error('request ended'));
      // These are pure SDK getters on an already-returned message.
      expect(messages[0].text).toBe('**hello**');
      expect(serializeMessage(messages[0])).toMatchObject({ id: 9, text: '**hello**' });
      const [text, entities] = view.client.parseMode!.parse('__changed__');
      expect(text).toBe('changed');
      expect(entities).toHaveLength(1);
      expect(entities[0]).toBeInstanceOf(Api.MessageEntityItalic);
      expect(entities[0].offset).toBe(0);
      expect(entities[0].length).toBe(7);
    }
    expect(shared.enqueue).toHaveBeenCalledTimes(2);
  });

  it('preserves callable metadata, static properties and construction without bypassing cancellation of calls', () => {
    class Resource {
      static version = 'fixture';
      constructor(readonly label: string) {}
    }
    function method(this: { label: string }, suffix: string) { return this.label + suffix; }
    Object.defineProperty(method, 'metadata', { value: { enabled: true }, writable: false });
    const underlying = { Resource, method, label: 'value' };
    const controller = new AbortController();
    const view = createRequestClient(underlying as any, controller.signal).client as any;
    const resource = new view.Resource('instance');
    expect(resource).toBeInstanceOf(Resource);
    expect(resource.label).toBe('instance');
    expect(view.Resource.version).toBe('fixture');
    expect(view.method.name).toBe('method');
    expect(view.method.length).toBe(1);
    expect(view.method.metadata).toEqual({ enabled: true });
    expect(view.method('!')).toBe('value!');
    controller.abort(new Error('cancelled'));
    expect(() => view.method('!')).toThrow('cancelled');
    expect(() => new view.Resource('late')).toThrow('cancelled');
  });
});
