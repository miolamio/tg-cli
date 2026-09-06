import { appendFileSync } from 'node:fs';
import bigInt from 'big-integer';
import { Api } from 'telegram/tl/api.js';

export { Api };

/** Only the MTProto boundary is fake; commands, IPC, output and process lifetime are real. */
function record(event: string, details: Record<string, unknown> = {}): void {
  const path = process.env.TG_DAEMON_API_TEST_JOURNAL;
  if (!path) throw new Error('Offline daemon fixture requires its isolated journal');
  appendFileSync(path, JSON.stringify({ event, pid: process.pid, ...details }) + '\n');
}

export const sessions = {
  StringSession: class {
    constructor(private readonly value: string) {}
    save(): string { return this.value; }
  },
};

const me = new Api.User({
  id: bigInt(7), accessHash: bigInt(20), self: true,
  firstName: 'Offline', lastName: 'Fixture', username: 'fixture',
});
const forum = new Api.Channel({
  id: bigInt(1234567890), accessHash: bigInt(10), title: 'Offline forum',
  photo: new Api.ChatPhotoEmpty(), date: 1_700_000_000,
  megagroup: true, forum: true,
});

function message(id: number, text: string, entity: Api.User | Api.Channel = me): Api.Message {
  const result = new Api.Message({
    id, date: 1_700_000_000 + id, message: text,
    peerId: entity instanceof Api.Channel
      ? new Api.PeerChannel({ channelId: entity.id })
      : new Api.PeerUser({ userId: entity.id }),
    fromId: new Api.PeerUser({ userId: me.id }),
  });
  (result as any)._sender = me;
  return result;
}

export class TelegramClient {
  private readonly handlers = new Set<(event: { message: Api.Message }) => void>();
  private readonly messages = [message(30, 'seed newest'), message(20, 'seed middle'), message(10, 'seed oldest')];
  private nextId = 100;

  constructor(..._args: unknown[]) { record('constructor'); }
  async connect(): Promise<void> { record('connect'); }
  async destroy(): Promise<void> { record('destroy'); }

  async getEntity(input: string | number): Promise<Api.User | Api.Channel> {
    record('getEntity', { input });
    if (['me', 'fixture', '7'].includes(String(input))) return me;
    if (['forum', '-1001234567890'].includes(String(input))) return forum;
    throw Object.assign(new Error('No such offline fixture peer'), { errorMessage: 'USERNAME_NOT_OCCUPIED' });
  }

  async getDialogs(options: { limit: number }): Promise<unknown[]> {
    record('getDialogs');
    const dialogs = [
      { id: me.id, title: 'Saved Messages', isUser: true, entity: me, unreadCount: 0 },
      { id: bigInt('-1001234567890'), title: forum.title, isChannel: true, entity: forum, unreadCount: 2 },
    ];
    return Object.assign(dialogs.slice(0, options.limit), { total: dialogs.length });
  }

  async getMessages(_entity: unknown, options: { limit: number; addOffset?: number }): Promise<Api.Message[]> {
    record('getMessages');
    const offset = options.addOffset ?? 0;
    return Object.assign(this.messages.slice(offset, offset + options.limit), { total: this.messages.length });
  }

  async sendMessage(entity: Api.User | Api.Channel, options: { message: string }): Promise<Api.Message> {
    record('sendMessage:start', { text: options.message });
    if (options.message.startsWith('fixture:slow')) await new Promise((resolve) => setTimeout(resolve, 150));
    if (options.message === 'fixture:fail') {
      record('sendMessage:failure');
      throw Object.assign(new Error('Offline chat is read-only'), { errorMessage: 'CHAT_WRITE_FORBIDDEN' });
    }
    const sent = message(this.nextId++, options.message, entity);
    this.messages.unshift(sent);
    for (const handler of this.handlers) handler({ message: sent });
    record('sendMessage:done', { id: sent.id });
    return sent;
  }

  addEventHandler(handler: (event: { message: Api.Message }) => void, _builder: unknown): void {
    this.handlers.add(handler);
    record('subscribe');
  }

  removeEventHandler(handler: (event: { message: Api.Message }) => void, _builder: unknown): void {
    this.handlers.delete(handler);
    record('unsubscribe');
  }
}
