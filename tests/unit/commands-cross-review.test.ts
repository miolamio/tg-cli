import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Logger, LogLevel } from 'telegram/extensions/Logger.js';
import { getInputPeer } from 'telegram/Utils.js';
import bigInt from 'big-integer';

const state = vi.hoisted(() => ({ client: undefined as any, success: vi.fn(), error: vi.fn() }));
vi.mock('../../src/lib/with-auth.js', () => ({ withAuth: async (_opts, fn) => fn(state.client) }));
vi.mock('../../src/lib/output.js', () => ({ outputSuccess: state.success, outputError: state.error, logStatus: vi.fn() }));

import { messageSearchAction } from '../../src/commands/message/search.js';
import { mediaSendAction } from '../../src/commands/media/send.js';
import { messageRepliesAction } from '../../src/commands/message/replies.js';
import { userProfileAction } from '../../src/commands/user/profile.js';

const channel = (id = 7) => new Api.Channel({
  id: bigInt(id), accessHash: bigInt(10), title: 'Channel title', megagroup: true,
  forum: true, photo: new Api.ChatPhotoEmpty(), date: 1700000000,
});
const user = (id = 7) => new Api.User({ id: bigInt(id), accessHash: bigInt(11), firstName: 'Actual sender' });
const message = (id: number) => new Api.Message({
  id, date: 1700000000, message: 'needle', fromId: new Api.PeerUser({ userId: bigInt(7) }),
  peerId: new Api.PeerChannel({ channelId: bigInt(7) }),
});
const context = (opts: Record<string, unknown> = {}, args: string[] = []) => ({
  optsWithGlobals: () => ({ profile: 'offline', limit: '50', offset: '0', ...opts }), args,
}) as any;

describe('independent command review against actual gramjs shapes', () => {
  let client: TelegramClient;
  let fixtureDir: string | undefined;
  const originalExitCode = process.exitCode;
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    client = new TelegramClient(new StringSession(''), 1, 'synthetic', { baseLogger: new Logger(LogLevel.NONE) });
    state.client = client;
    vi.spyOn(client, 'getEntity').mockResolvedValue(channel());
    vi.spyOn(client, 'getInputEntity').mockImplementation(async entity => getInputPeer(entity as any));
    vi.spyOn(client, 'invoke').mockRejectedValue(new Error('Unplanned offline RPC'));
  });
  afterEach(async () => {
    await client.destroy();
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
    if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
    fixtureDir = undefined;
  });

  it('distinguishes a user from a channel with the same raw ID in topic search', async () => {
    vi.mocked(client.invoke).mockResolvedValue(new Api.messages.MessagesSlice({
      count: 1, messages: [message(42)], users: [user()], chats: [channel()],
    }));
    await messageSearchAction.call(context({ chat: '@fixture', topic: '20', query: 'needle' }));
    const data = state.success.mock.calls[0][0];
    expect(data.messages[0]).toMatchObject({ id: 42, senderId: '7', senderName: 'Actual sender' });
  });

  it('reports an incomplete SDK album mapping without throwing after the send', async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), 'tg-album-cross-review-'));
    const files = [join(fixtureDir, 'a.jpg'), join(fixtureDir, 'b.jpg')];
    await Promise.all(files.map(file => writeFile(file, 'synthetic')));
    const updates = new Api.Updates({
      updates: [
        new Api.UpdateMessageID({ id: 42, randomId: bigInt(100) }),
        new Api.UpdateNewChannelMessage({ message: message(42), pts: 1, ptsCount: 1 }),
      ],
      users: [user()], chats: [channel()], date: 1700000000, seq: 1,
    });
    // Invoke the same SDK response conversion used by _sendAlbum. The missing
    // second mapping produces undefined, despite the successful write response.
    const sdkResult = client._getResponseMessage([bigInt(100), bigInt(101)], updates, getInputPeer(channel()));
    expect(sdkResult).toHaveLength(2);
    expect(sdkResult[1]).toBeUndefined();
    const send = vi.spyOn(client, 'sendFile').mockResolvedValue(sdkResult as any);
    const reread = vi.spyOn(client, 'getMessages');
    await expect(mediaSendAction.call(context({}, ['@fixture', ...files]))).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
    expect(reread).not.toHaveBeenCalled();
    expect(state.success.mock.calls[0][0]).toMatchObject({ messages: [expect.objectContaining({ id: 42 })] });
    expect(state.success.mock.calls[0][0].warning).toEqual(expect.any(String));
  });

  it('preserves one reply result and a separate network error without inventing an empty post', async () => {
    vi.mocked(client.invoke).mockImplementation(async (request: any) => {
      if (request.msgId === 42) return new Api.messages.MessagesSlice({ count: 1, messages: [message(61)], users: [user()], chats: [channel()] }) as any;
      throw Object.assign(new Error('temporary socket failure'), { code: 'ECONNRESET' });
    });
    await messageRepliesAction.call(context(), '@fixture', '42,43');
    expect(state.success.mock.calls[0][0]).toMatchObject({
      posts: [{ postId: 42, total: 1, messages: [expect.objectContaining({ id: 61 })] }],
      partial: true,
      errors: [{ input: '43', error: 'temporary socket failure', code: 'ECONNRESET' }],
    });
    expect(process.exitCode).toBe(1);
  });

  it('does not turn an entity-resolution transport failure into notFound', async () => {
    vi.mocked(client.getEntity).mockRejectedValue(Object.assign(new Error('temporary socket failure'), { code: 'ECONNRESET' }));
    await userProfileAction.call(context(), '@fixture');
    expect(state.success).toHaveBeenCalledWith({ profiles: [], notFound: [], partial: true, errors: [
      { input: '@fixture', error: 'temporary socket failure', code: 'ECONNRESET' },
    ] });
    expect(client.invoke).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
