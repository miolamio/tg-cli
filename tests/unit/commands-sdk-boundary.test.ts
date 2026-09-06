import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Logger, LogLevel } from 'telegram/extensions/Logger.js';
import bigInt from 'big-integer';
import { getInputPeer } from 'telegram/Utils.js';

// Keep actual Api constructors, serialization, entity resolution and gramjs message
// iteration/deletion. Only authentication and the network transport are replaced.
const state = vi.hoisted(() => ({ client: undefined as any, success: vi.fn(), error: vi.fn() }));
vi.mock('../../src/lib/with-auth.js', () => ({ withAuth: async (_opts: any, fn: any) => fn(state.client) }));
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => state.success(...args),
  outputError: (...args: any[]) => state.error(...args),
  logStatus: vi.fn(),
}));

import { messageDeleteAction } from '../../src/commands/message/delete.js';
import { messageSearchAction } from '../../src/commands/message/search.js';
import { messageRepliesAction } from '../../src/commands/message/replies.js';
import { mediaSendAction } from '../../src/commands/media/send.js';
import { chatCreateAction } from '../../src/commands/chat/create.js';
import { contactListAction } from '../../src/commands/contact/list.js';
import { contactAddAction } from '../../src/commands/contact/add.js';
import { contactSearchAction } from '../../src/commands/contact/search.js';
import { userProfileAction } from '../../src/commands/user/profile.js';

const channel = (id = 1234567890) => new Api.Channel({
  id: bigInt(id), accessHash: bigInt(10), title: `Channel ${id}`,
  forum: true, megagroup: true, photo: new Api.ChatPhotoEmpty(), date: 1700000000,
});
const user = (id = 7) => new Api.User({ id: bigInt(id), accessHash: bigInt(20), firstName: `User ${id}` });
const message = (id: number, chat = channel(), text = 'needle') => new Api.Message({
  id, date: 1700000000 + id, message: text,
  peerId: new Api.PeerChannel({ channelId: chat.id }),
  fromId: new Api.PeerUser({ userId: bigInt(7) }),
});
const context = (opts: Record<string, unknown> = {}, args: string[] = []) => ({
  optsWithGlobals: () => ({ profile: 'fixture', limit: '50', offset: '0', ...opts }), args,
}) as any;
const rpcError = (code: string) => Object.assign(new Error(code), { errorMessage: code });

describe('command boundaries against installed gramjs (offline transport)', () => {
  let client: TelegramClient;
  const originalExitCode = process.exitCode;
  let fixtures: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new TelegramClient(new StringSession(''), 1, 'synthetic', {
      baseLogger: new Logger(LogLevel.NONE),
    });
    state.client = client;
    vi.spyOn(client, 'getEntity').mockResolvedValue(channel());
    vi.spyOn(client, 'getInputEntity').mockImplementation(async entity => getInputPeer(entity as any));
    vi.spyOn(client, 'invoke').mockRejectedValue(new Error('Unexpected offline RPC'));
  });

  afterEach(async () => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    await client.destroy();
    if (fixtures) await rm(fixtures, { recursive: true, force: true });
    fixtures = undefined;
  });

  it.each([false, true])('blocks --for-me on channel megagroup=%s before delete RPC', async megagroup => {
    const entity = channel();
    entity.megagroup = megagroup;
    vi.mocked(client.getEntity).mockResolvedValue(entity);
    await messageDeleteAction.call(context({ forMe: true }), '@fixture', '42');
    expect(client.invoke).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
    expect(state.error).toHaveBeenCalledWith(expect.stringContaining('not supported'), 'INVALID_OPTIONS');
  });

  it('retains explicit revoke on a channel in the actual delete request', async () => {
    vi.mocked(client.invoke).mockImplementation(async (request: any) => {
      expect(request).toBeInstanceOf(Api.channels.DeleteMessages);
      expect(request.id).toEqual([42, 47]);
      expect(request.getBytes().length).toBeGreaterThan(0);
      return new Api.messages.AffectedMessages({ pts: 1, ptsCount: 2 }) as any;
    });
    await messageDeleteAction.call(context({ revoke: true }), '@fixture', '42,47');
    expect(client.invoke).toHaveBeenCalledOnce();
    expect(state.success).toHaveBeenCalledWith({ deleted: [42, 47], failed: [], mode: 'revoke' });
  });

  it.each(['user', 'group'])('retains for-me for a supported %s', async kind => {
    const entity = kind === 'user' ? user() : new Api.Chat({
      id: bigInt(99), title: 'Group', photo: new Api.ChatPhotoEmpty(), participantsCount: 2, date: 0, version: 1,
    });
    vi.mocked(client.getEntity).mockResolvedValue(entity);
    vi.mocked(client.invoke).mockImplementation(async (request: any) => {
      expect(request).toBeInstanceOf(Api.messages.DeleteMessages);
      expect(request.revoke).toBe(false);
      expect(request.getBytes().length).toBeGreaterThan(0);
      return new Api.messages.AffectedMessages({ pts: 1, ptsCount: 1 }) as any;
    });
    await messageDeleteAction.call(context({ forMe: true }), '@fixture', '42');
    expect(client.invoke).toHaveBeenCalledOnce();
    expect(state.success.mock.calls[0][0].mode).toBe('for-me');
  });

  it.each([
    { query: 'needle', filter: 'photos' }, { query: 'needle' }, { filter: 'photos' },
  ])('topic search preserves query/filter in real Search RPC: %j', async options => {
    vi.mocked(client.invoke).mockImplementation(async (request: any) => {
      expect(request).toBeInstanceOf(Api.messages.Search);
      expect(request.topMsgId).toBe(42);
      expect(request.q).toBe(options.query ?? '');
      expect(request.filter).toBeInstanceOf(options.filter ? Api.InputMessagesFilterPhotos : Api.InputMessagesFilterEmpty);
      expect(request.addOffset).toBe(3);
      expect(request.getBytes().length).toBeGreaterThan(0);
      return new Api.messages.MessagesSlice({ count: 1, messages: [message(56)], users: [user()], chats: [channel()] }) as any;
    });
    await messageSearchAction.call(context({ chat: '@fixture', topic: '42', limit: '5', offset: '3', ...options }));
    expect(client.invoke).toHaveBeenCalledOnce();
    expect(state.success.mock.calls[0][0].messages[0]).toMatchObject({ id: 56, text: 'needle', senderName: 'User 7' });
  });

  it('topic search advances offsetId in chunks while keeping topMsgId, query and filter', async () => {
    const source = Array.from({ length: 145 }, (_, i) => message(300 - i));
    const requests: any[] = [];
    vi.mocked(client.invoke).mockImplementation(async (request: any) => {
      requests.push({ offsetId: request.offsetId, addOffset: request.addOffset, limit: request.limit });
      expect(request.topMsgId).toBe(42);
      expect(request.q).toBe('needle');
      expect(request.filter).toBeInstanceOf(Api.InputMessagesFilterPhotos);
      const start = (request.offsetId ? source.findIndex(m => m.id === request.offsetId) + 1 : 0) + request.addOffset;
      return new Api.messages.MessagesSlice({ count: source.length, messages: source.slice(start, start + request.limit), users: [user()], chats: [channel()] }) as any;
    });
    await messageSearchAction.call(context({ chat: '@fixture', topic: '42', query: 'needle', filter: 'photos', limit: '120', offset: '5' }));
    const result = state.success.mock.calls[0][0];
    expect(result.messages.map((m: any) => m.id)).toEqual(source.slice(5, 125).map(m => m.id));
    expect(result.total).toBe(145);
    expect(requests).toEqual([{ offsetId: 0, addOffset: 5, limit: 100 }, { offsetId: 196, addOffset: 0, limit: 20 }]);
  });

  it('global offset follows SearchGlobal peer/rate/id cursor beyond 100 results without duplicates', async () => {
    const chats = [channel(1234567890), channel(2234567890)];
    // invoke normally populates this cache from every response before the
    // iterator hydrates Message.inputChat for the next SearchGlobal cursor.
    (client as any)._entityCache.add({ chats, users: [user()] });
    const source = Array.from({ length: 137 }, (_, i) => message(300 - Math.floor(i / 2), chats[i % 2]));
    const requests: any[] = [];
    vi.mocked(client.invoke).mockImplementation(async (request: any) => {
      expect(request).toBeInstanceOf(Api.messages.SearchGlobal);
      expect(request.q).toBe('needle');
      const previous = request.offsetId ? source.findIndex(m => m.id === request.offsetId &&
        (m.peerId as Api.PeerChannel).channelId.equals(request.offsetPeer.channelId)) : -1;
      if (request.offsetId) {
        expect(previous).toBeGreaterThanOrEqual(0);
        expect(request.offsetRate).toBe(700 + previous + 1);
      }
      const start = previous + 1;
      requests.push({ bytes: request.getBytes(), offsetId: request.offsetId, offsetRate: request.offsetRate, limit: request.limit });
      const messages = source.slice(start, start + request.limit);
      return new Api.messages.MessagesSlice({ count: source.length, messages, users: [user()], chats, nextRate: 700 + start + messages.length }) as any;
    });
    await messageSearchAction.call(context({ query: 'needle', offset: '105', limit: '7' }));
    const result = state.success.mock.calls[0][0];
    expect(result.total).toBe(137);
    expect(result.messages.map((m: any) => [m.id, m.chatId])).toEqual(source.slice(105, 112).map(m => [m.id, `-100${(m.peerId as Api.PeerChannel).channelId}`]));
    expect(requests).toHaveLength(2);
    expect(requests[0].limit).toBe(100);
    expect(requests[1].limit).toBe(12);
    expect(requests[0].bytes.equals(requests[1].bytes)).toBe(false);
  });

  it('global offset past the end returns an empty page and retains server total', async () => {
    vi.mocked(client.invoke).mockResolvedValue(new Api.messages.MessagesSlice({ count: 1, messages: [message(7)], users: [], chats: [channel()] }));
    await messageSearchAction.call(context({ query: 'needle', offset: '4', limit: '2' }));
    expect(state.success).toHaveBeenCalledWith({ messages: [], total: 1 });
  });

  it('albums serialize actual nonconsecutive Message[] IDs without a second read', async () => {
    fixtures = await mkdtemp(join(tmpdir(), 'tg-sdk-album-'));
    const paths = [join(fixtures, 'a.jpg'), join(fixtures, 'b.jpg')];
    await Promise.all(paths.map(path => writeFile(path, 'fixture')));
    vi.spyOn(client, 'sendFile').mockResolvedValue([message(50), message(54)] as any);
    const getMessages = vi.spyOn(client, 'getMessages');
    await mediaSendAction.call(context({}, ['@fixture', ...paths]));
    expect(getMessages).not.toHaveBeenCalled();
    expect(client.invoke).not.toHaveBeenCalled();
    const result = state.success.mock.calls[0][0];
    expect(result.sent).toBe(2);
    expect(result.messages.map((m: any) => m.id)).toEqual([50, 54]);
    expect(result.warning).toBeUndefined();
  });

  it('single media send reports unavailable SDK mapping without re-uploading or reading guessed IDs', async () => {
    fixtures = await mkdtemp(join(tmpdir(), 'tg-sdk-single-'));
    const path = join(fixtures, 'a.jpg');
    await writeFile(path, 'fixture');
    const request = new Api.messages.SendMedia({ peer: getInputPeer(channel()), media: new Api.InputMediaEmpty(), randomId: bigInt.one, message: '' });
    const updates = new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 });
    const missing = (client as any)._getResponseMessage(request, updates, getInputPeer(channel()));
    expect(missing).toBeUndefined();
    const send = vi.spyOn(client, 'sendFile').mockResolvedValue(missing);
    await mediaSendAction.call(context({}, ['@fixture', path]));
    expect(send).toHaveBeenCalledOnce();
    expect(client.invoke).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
    expect(state.error).toHaveBeenCalledWith(expect.stringContaining('retrying may create a duplicate'), 'MESSAGE_RESULT_UNAVAILABLE');
  });

  it('CreateChat unwraps the installed InvitedUsers response and marks the created ID', async () => {
    vi.mocked(client.getEntity).mockResolvedValue(user());
    vi.mocked(client.invoke).mockImplementation(async (request: any) => {
      expect(request).toBeInstanceOf(Api.messages.CreateChat);
      return new Api.messages.InvitedUsers({
        updates: new Api.Updates({ updates: [], users: [user()], chats: [new Api.Chat({
          id: bigInt(99), title: 'Fixture', photo: new Api.ChatPhotoEmpty(), participantsCount: 2, date: 0, version: 1,
        })], date: 0, seq: 1 }), missingInvitees: [],
      }) as any;
    });
    await chatCreateAction.call(context({ type: 'group', members: '@fixture' }), 'Fixture');
    expect(state.success).toHaveBeenCalledWith({ id: '-99', title: 'Fixture', type: 'group' });
    expect(client.invoke).toHaveBeenCalledOnce();
  });

  it.each([false, true])('contact limit applies before enrichment with global=%s and deduplicates contacts first', async global => {
    const users = [user(1), user(2), user(3)];
    const enriched: string[] = [];
    vi.mocked(client.invoke).mockImplementation(async (request: any) => {
      if (request instanceof Api.contacts.GetContacts) return new Api.contacts.Contacts({ users, savedCount: 2,
        contacts: [new Api.Contact({ userId: bigInt(1), mutual: true }), new Api.Contact({ userId: bigInt(1), mutual: true }), new Api.Contact({ userId: bigInt(2), mutual: true })],
      }) as any;
      if (request instanceof Api.contacts.Search) return new Api.contacts.Found({
        users, chats: [], myResults: [new Api.PeerUser({ userId: bigInt(1) }), new Api.PeerUser({ userId: bigInt(1) }), new Api.PeerUser({ userId: bigInt(2) })],
        results: [new Api.PeerUser({ userId: bigInt(2) }), new Api.PeerUser({ userId: bigInt(3) })],
      }) as any;
      if (request instanceof Api.users.GetFullUser) {
        enriched.push(String(request.id.id));
        return { fullUser: {}, users: [request.id] } as any;
      }
      if (request instanceof Api.photos.GetUserPhotos) return { photos: [], count: 0 } as any;
      throw new Error('Unexpected RPC');
    });
    await contactSearchAction.call(context({ global, limit: '1' }), 'User');
    expect(enriched).toEqual(['1']);
    expect(state.success.mock.calls[0][0].results).toHaveLength(1);
    expect(state.success.mock.calls[0][0].results[0].isContact).toBe(true);
  });

  it('all failed replies produce no fake empty posts and retain individual RPC errors', async () => {
    vi.mocked(client.invoke).mockRejectedValue(rpcError('CHAT_ADMIN_REQUIRED'));
    await messageRepliesAction.call(context(), '@fixture', '42,43');
    expect(state.success).toHaveBeenCalledWith({ posts: [], partial: true, errors: [
      { input: '42', error: 'Admin privileges required', code: 'CHAT_ADMIN_REQUIRED' },
      { input: '43', error: 'Admin privileges required', code: 'CHAT_ADMIN_REQUIRED' },
    ] });
    expect(state.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('profile transport errors are reported without pretending users are absent', async () => {
    vi.mocked(client.getEntity).mockResolvedValue(user());
    vi.mocked(client.invoke).mockRejectedValue(rpcError('FLOOD_WAIT_17'));
    await userProfileAction.call(context(), '@first,@second');
    expect(state.success).toHaveBeenCalledWith({ profiles: [], notFound: [], partial: true, errors: [
      { input: '@first', error: 'FLOOD_WAIT_17', code: 'FLOOD_WAIT_17' },
      { input: '@second', error: 'FLOOD_WAIT_17', code: 'FLOOD_WAIT_17' },
    ] });
    expect(process.exitCode).toBe(1);
  });
  it('topic search terminates a repeated server page without returning duplicates', async () => {
    const messages = Array.from({ length: 100 }, (_, i) => message(300 - i));
    vi.mocked(client.invoke).mockResolvedValue(new Api.messages.MessagesSlice({ count: 500, messages, users: [], chats: [channel()] }));
    await messageSearchAction.call(context({ chat: '@fixture', topic: '42', query: 'needle', limit: '250' }));
    expect(client.invoke).toHaveBeenCalledTimes(2);
    expect(state.success.mock.calls[0][0].messages.map((m: any) => m.id)).toEqual(messages.map(m => m.id));
  });

  it.each(['12junk', '1.2', '0', '-1', '2147483648', '9007199254740993', '', '1,'])('media rejects reply-to %j before any client request', async replyTo => {
    fixtures = await mkdtemp(join(tmpdir(), 'tg-sdk-validation-'));
    const path = join(fixtures, 'a.jpg');
    await writeFile(path, 'fixture');
    const sendFile = vi.spyOn(client, 'sendFile');
    await mediaSendAction.call(context({ replyTo }, ['@fixture', path]));
    expect(client.getEntity).not.toHaveBeenCalled();
    expect(sendFile).not.toHaveBeenCalled();
    expect(state.error).toHaveBeenCalledWith(expect.any(String), 'INVALID_REPLY_TO');
  });

  it.each([false, true])('multi-chat search retains per-chat errors when allFail=%s, including quiet mode', async allFail => {
    vi.mocked(client.getEntity).mockImplementation(async input => {
      if (input === 'bad' || allFail) throw rpcError('CHANNEL_PRIVATE');
      return channel();
    });
    vi.mocked(client.invoke).mockResolvedValue(new Api.messages.MessagesSlice({ count: 1, messages: [message(5)], users: [], chats: [channel()] }));
    await messageSearchAction.call(context({ chat: '@bad,@good', query: 'needle', quiet: true }));
    const result = state.success.mock.calls[0][0];
    expect(result.messages).toHaveLength(allFail ? 0 : 1);
    if (!allFail) expect(result.messages[0].chatId).toBe('-1001234567890');
    expect(result.errors.map((error: any) => [error.input, error.code])).toEqual(allFail ?
      [['@bad', 'CHANNEL_PRIVATE'], ['@good', 'CHANNEL_PRIVATE']] : [['@bad', 'CHANNEL_PRIVATE']]);
    expect(result.partial).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('a successful empty reply result remains distinguishable from a failed post', async () => {
    vi.mocked(client.invoke).mockResolvedValueOnce(new Api.messages.MessagesSlice({ count: 0, messages: [], users: [], chats: [] }))
      .mockRejectedValueOnce(rpcError('MSG_ID_INVALID'));
    await messageRepliesAction.call(context(), '@fixture', '42,43');
    const result = state.success.mock.calls[0][0];
    expect(result.posts).toEqual([{ postId: 42, messages: [], total: 0 }]);
    expect(result.errors).toEqual([{ input: '43', error: 'MSG_ID_INVALID', code: 'MSG_ID_INVALID' }]);
    expect(result.partial).toBe(true);
  });

  it.each([false, true])('contact enrichment exposes failures with allFail=%s', async allFail => {
    const users = [user(1), user(2)];
    vi.mocked(client.invoke).mockImplementation(async (request: any) => {
      if (request instanceof Api.contacts.GetContacts) return new Api.contacts.Contacts({ users, savedCount: users.length,
        contacts: users.map(u => new Api.Contact({ userId: u.id, mutual: true })),
      }) as any;
      if (request instanceof Api.users.GetFullUser) {
        if (String(request.id.id) === '2' || allFail) throw rpcError('FLOOD_WAIT_3');
        return { fullUser: {}, users: [request.id] } as any;
      }
      return { photos: [], count: 0 } as any;
    });
    await contactSearchAction.call(context({ limit: '2' }), 'User');
    const result = state.success.mock.calls[0][0];
    expect(result.results).toHaveLength(allFail ? 0 : 1);
    expect(result.partial).toBe(true);
    expect(result.errors.map((error: any) => [error.input, error.code])).toEqual(allFail ? [['1', 'FLOOD_WAIT_3'], ['2', 'FLOOD_WAIT_3']] : [['2', 'FLOOD_WAIT_3']]);
    expect(process.exitCode).toBe(1);
  });

  it('profile missing users, transport errors, and successful users remain distinct', async () => {
    vi.mocked(client.getEntity).mockImplementation(async input => {
      if (input === 'missing') throw rpcError('USERNAME_NOT_OCCUPIED');
      if (input === 'offline') throw Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' });
      return user();
    });
    vi.mocked(client.invoke).mockImplementation(async (request: any) => {
      if (request instanceof Api.users.GetFullUser) return { fullUser: {}, users: [user()] } as any;
      return { photos: [], count: 0 } as any;
    });
    await userProfileAction.call(context(), '@missing,@offline,@ok');
    const result = state.success.mock.calls[0][0];
    expect(result.profiles).toHaveLength(1);
    expect(result.notFound).toEqual(['@missing']);
    expect(result.errors.map((error: any) => [error.input, error.code])).toEqual([['@missing', 'PEER_NOT_FOUND'], ['@offline', 'ECONNRESET']]);
    expect(result.partial).toBe(true);
  });

  it.each(['profile', 'contact', 'list', 'add'])('photo enrichment failure retains the %s with an unknown count and an error', async kind => {
    vi.mocked(client.getEntity).mockResolvedValue(user());
    vi.mocked(client.invoke).mockImplementation(async (request: any) => {
      if (request instanceof Api.contacts.Search) return new Api.contacts.Found({ users: [user()], chats: [], results: [],
        myResults: [new Api.PeerUser({ userId: bigInt(7) })],
      }) as any;
      if (request instanceof Api.contacts.GetContacts) return new Api.contacts.Contacts({ users: [user()], savedCount: 1,
        contacts: [new Api.Contact({ userId: bigInt(7), mutual: true })],
      }) as any;
      if (request instanceof Api.contacts.AddContact) return new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }) as any;
      if (request instanceof Api.users.GetFullUser) return { fullUser: {}, users: [user()] } as any;
      throw rpcError('FLOOD_WAIT_5');
    });
    if (kind === 'profile') await userProfileAction.call(context(), '@fixture');
    else if (kind === 'list') await contactListAction.call(context());
    else if (kind === 'add') await contactAddAction.call(context(), '@fixture');
    else await contactSearchAction.call(context(), 'User');
    const result = state.success.mock.calls[0][0];
    expect(kind === 'add' ? result.photoCount : (result.profiles ?? result.results ?? result.contacts)[0].photoCount).toBeNull();
    expect(result.partial).toBe(true);
    expect(result.errors).toEqual([{ input: kind === 'profile' || kind === 'add' ? '@fixture' : '7', error: 'Could not fetch profile photos: FLOOD_WAIT_5', code: 'FLOOD_WAIT_5' }]);
    expect(process.exitCode).toBe(1);
  });

  it('contact list retains total and reports enrichment failures instead of dropping them silently', async () => {
    const users = [user(1), user(2)];
    vi.mocked(client.invoke).mockImplementation(async (request: any) => {
      if (request instanceof Api.contacts.GetContacts) return new Api.contacts.Contacts({ users, savedCount: 2,
        contacts: users.map(u => new Api.Contact({ userId: u.id, mutual: true })),
      }) as any;
      if (request instanceof Api.users.GetFullUser) {
        if (String(request.id.id) === '2') throw rpcError('USER_ID_INVALID');
        return { fullUser: {}, users: [request.id] } as any;
      }
      return { photos: [], count: 0 } as any;
    });
    await contactListAction.call(context());
    const result = state.success.mock.calls[0][0];
    expect(result.contacts).toHaveLength(1);
    expect(result.total).toBe(2);
    expect(result.partial).toBe(true);
    expect(result.errors.map((error: any) => [error.input, error.code])).toEqual([['2', 'USER_ID_INVALID']]);
    expect(process.exitCode).toBe(1);
  });

  it('contact add preserves confirmed mutation success if its profile read fails', async () => {
    vi.mocked(client.getEntity).mockResolvedValue(user());
    vi.mocked(client.invoke).mockImplementation(async (request: any) => {
      if (request instanceof Api.contacts.AddContact) return new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }) as any;
      throw rpcError('FLOOD_WAIT_5');
    });
    await contactAddAction.call(context(), '@fixture');
    expect(client.invoke).toHaveBeenCalledTimes(2);
    expect(state.error).not.toHaveBeenCalled();
    expect(state.success).toHaveBeenCalledWith({ added: true, id: '7', firstName: 'User 7', lastName: null, username: null,
      partial: true, errors: [{ input: '@fixture', error: 'Could not fetch added contact profile: FLOOD_WAIT_5', code: 'FLOOD_WAIT_5' }],
    });
    expect(process.exitCode).toBe(1);
  });

  it.each(['profile', 'contact', 'list', 'add'])('the %s profile is selected by requested ID, not vector position', async kind => {
    const target = user(7);
    const related = user(99);
    vi.mocked(client.getEntity).mockResolvedValue(target);
    vi.mocked(client.invoke).mockImplementation(async (request: any) => {
      if (request instanceof Api.contacts.Search) return new Api.contacts.Found({ users: [target], chats: [], results: [],
        myResults: [new Api.PeerUser({ userId: target.id })],
      }) as any;
      if (request instanceof Api.contacts.GetContacts) return new Api.contacts.Contacts({ users: [target], savedCount: 1,
        contacts: [new Api.Contact({ userId: target.id, mutual: true })],
      }) as any;
      if (request instanceof Api.contacts.AddContact) return new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }) as any;
      if (request instanceof Api.users.GetFullUser) return { fullUser: { id: target.id }, users: [related, target] } as any;
      return { photos: [], count: 0 } as any;
    });
    if (kind === 'profile') await userProfileAction.call(context(), '@fixture');
    else if (kind === 'list') await contactListAction.call(context());
    else if (kind === 'add') await contactAddAction.call(context(), '@fixture');
    else await contactSearchAction.call(context(), 'User');
    const result = state.success.mock.calls[0][0];
    const profile = kind === 'add' ? result : (result.profiles ?? result.results ?? result.contacts)[0];
    expect(profile.id).toBe('7');
    expect(profile.firstName).toBe('User 7');
    expect(result.partial).toBe(false);
    expect(result.errors).toEqual([]);
  });

});
