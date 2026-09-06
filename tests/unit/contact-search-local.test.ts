import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from 'telegram';
import bigInt from 'big-integer';

const state = vi.hoisted(() => ({ invoke: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../../src/lib/with-auth.js', () => ({ withAuth: async (_opts, fn) => fn({ invoke: state.invoke }) }));
vi.mock('../../src/lib/output.js', () => ({ outputSuccess: state.success, outputError: state.error, logStatus: vi.fn() }));
import { contactSearchAction } from '../../src/commands/contact/search.js';

const user = (id: number, firstName: string, username?: string, lastName?: string) => new Api.User({
  id: bigInt(id), firstName, username, lastName, accessHash: bigInt(id + 1000),
});
const contact = (id: number) => new Api.Contact({ userId: bigInt(id), mutual: false });
const peer = (id: number) => new Api.PeerUser({ userId: bigInt(id) });
const context = (opts: Record<string, unknown> = {}) => ({
  optsWithGlobals: () => ({ profile: 'offline', limit: '20', ...opts }),
}) as any;
const alice = () => user(100, 'Alice', 'alice_handle', 'Smith');
const found = () => new Api.contacts.Found({ users: [], chats: [], myResults: [], results: [] });
const rpcError = (code: string) => Object.assign(new Error(code), { errorMessage: code });

function mockTransport(contacts: Api.User[], remote = found()) {
  state.invoke.mockImplementation(async (request: any) => {
    if (request instanceof Api.contacts.GetContacts) {
      expect(request.getBytes().length).toBeGreaterThan(0);
      return new Api.contacts.Contacts({ users: contacts, savedCount: contacts.length, contacts: contacts.map(u => contact(u.id.toJSNumber())) });
    }
    if (request instanceof Api.contacts.Search) return remote;
    if (request instanceof Api.users.GetFullUser) return { fullUser: {}, users: [request.id] };
    if (request instanceof Api.photos.GetUserPhotos) return new Api.photos.Photos({ photos: [], users: [] });
    throw new Error(`Unexpected offline RPC ${request.className}`);
  });
}

describe('contact search searches the actual address book locally', () => {
  const exitCode = process.exitCode;
  beforeEach(() => { vi.clearAllMocks(); process.exitCode = 0; });
  afterEach(() => { process.exitCode = exitCode; });

  it.each(['ali', 'ALI', 'Alice Smith', 'SMITH', '@ALICE_HANDLE'])('finds an existing contact for %s without contacts.Search', async query => {
    mockTransport([alice()]);
    await contactSearchAction.call(context({ limit: '1' }), query);
    expect(state.success.mock.calls[0][0]).toMatchObject({ results: [{ id: '100', isContact: true }], total: 1, partial: false, errors: [] });
    expect(state.invoke.mock.calls.some(([request]) => request instanceof Api.contacts.GetContacts)).toBe(true);
    expect(state.invoke.mock.calls.some(([request]) => request instanceof Api.contacts.Search)).toBe(false);
  });

  it('matches Unicode case and ignores users not present in the contact list', async () => {
    const saved = user(100, 'Сергей', 'sergey');
    const unrelated = user(200, 'Сергей');
    mockTransport([saved]);
    state.invoke.mockImplementationOnce(async () => new Api.contacts.Contacts({ users: [unrelated, saved], contacts: [contact(100)], savedCount: 1 }));
    await contactSearchAction.call(context(), 'СЕРГ');
    expect(state.success.mock.calls[0][0].results.map((u: any) => u.id)).toEqual(['100']);
  });

  it('merges local contacts with remote users, deduplicates, and limits before enrichment', async () => {
    const known = alice();
    const remoteOne = user(200, 'Alicia', 'alicia');
    const remoteTwo = user(300, 'Alina', 'alina');
    mockTransport([known], new Api.contacts.Found({
      users: [known, remoteOne, remoteTwo], chats: [],
      myResults: [peer(200)], results: [peer(100), peer(200), new Api.PeerChannel({ channelId: bigInt(400) }), peer(300)],
    }));
    await contactSearchAction.call(context({ global: true, limit: '2' }), 'ali');
    const data = state.success.mock.calls[0][0];
    expect(data.results.map((u: any) => [u.id, u.isContact])).toEqual([['100', true], ['200', false]]);
    expect(state.invoke.mock.calls.filter(([r]) => r instanceof Api.users.GetFullUser).map(([r]) => String(r.id.id))).toEqual(['100', '200']);
    expect(data).toMatchObject({ total: 2, partial: false, errors: [] });
  });

  it('applies the limit after matching and does not enrich unmatched or duplicate contacts', async () => {
    const bob = user(50, 'Bob');
    const known = alice();
    const other = user(200, 'Alicia');
    mockTransport([bob, known, other]);
    state.invoke.mockImplementationOnce(async () => new Api.contacts.Contacts({ users: [bob, known, other], contacts: [contact(50), contact(100), contact(100), contact(200)], savedCount: 3 }));
    await contactSearchAction.call(context({ limit: '1' }), 'ali');
    expect(state.success.mock.calls[0][0].results.map((u: any) => u.id)).toEqual(['100']);
    expect(state.invoke.mock.calls.filter(([r]) => r instanceof Api.users.GetFullUser)).toHaveLength(1);
  });

  it('retains local matches and reports a remote search error as partial', async () => {
    mockTransport([alice()]);
    const implementation = state.invoke.getMockImplementation()!;
    state.invoke.mockImplementation(async (request: any) => {
      if (request instanceof Api.contacts.Search) throw rpcError('QUERY_TOO_SHORT');
      return implementation(request);
    });
    await contactSearchAction.call(context({ global: true }), 'al');
    const data = state.success.mock.calls[0][0];
    expect(data.results).toMatchObject([{ id: '100', isContact: true }]);
    expect(data).toMatchObject({ partial: true, errors: [expect.objectContaining({ code: 'QUERY_TOO_SHORT' })] });
    expect(process.exitCode).toBe(1);
  });

  it('retains remote matches and reports failure to read contacts as partial', async () => {
    const remote = user(200, 'Alicia');
    mockTransport([], new Api.contacts.Found({ users: [remote], chats: [], myResults: [], results: [peer(200)] }));
    state.invoke.mockImplementationOnce(async () => { throw Object.assign(new Error('offline reset'), { code: 'ECONNRESET' }); });
    await contactSearchAction.call(context({ global: true }), 'ali');
    expect(state.success.mock.calls[0][0]).toMatchObject({
      results: [{ id: '200', isContact: false }], partial: true,
      errors: [expect.objectContaining({ code: 'ECONNRESET' })],
    });
    expect(process.exitCode).toBe(1);
  });

  it('uses the returned contact flag when the address book could not be read', async () => {
    const remote = user(200, 'Alicia');
    remote.contact = true;
    mockTransport([], new Api.contacts.Found({ users: [remote], chats: [], myResults: [], results: [peer(200)] }));
    state.invoke.mockImplementationOnce(async () => { throw Object.assign(new Error('offline reset'), { code: 'ECONNRESET' }); });
    await contactSearchAction.call(context({ global: true }), 'ali');
    expect(state.success.mock.calls[0][0]).toMatchObject({ results: [{ id: '200', isContact: true }], partial: true });
  });

  it('returns an empty successful local search without invoking remote search or enrichment', async () => {
    mockTransport([alice()]);
    await contactSearchAction.call(context(), 'missing');
    expect(state.success).toHaveBeenCalledWith({ results: [], total: 0, partial: false, errors: [] });
    expect(state.invoke).toHaveBeenCalledOnce();
    expect(state.invoke.mock.calls[0][0]).toBeInstanceOf(Api.contacts.GetContacts);
  });

  it('skips the remote lookup when local matches already fill a global page', async () => {
    mockTransport([alice()]);
    await contactSearchAction.call(context({ global: true, limit: '1' }), 'al');
    expect(state.success.mock.calls[0][0]).toMatchObject({ results: [{ id: '100', isContact: true }], partial: false });
    expect(state.invoke.mock.calls.some(([request]) => request instanceof Api.contacts.Search)).toBe(false);
  });

  it.each(['', '  ', '@'])('rejects an empty query %j before reading contacts', async query => {
    await contactSearchAction.call(context(), query);
    expect(state.error).toHaveBeenCalledWith('Search query cannot be empty', 'INVALID_INPUT');
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('exposes a failed local read in default mode instead of reporting no matches', async () => {
    state.invoke.mockRejectedValueOnce(rpcError('AUTH_KEY_UNREGISTERED'));
    await contactSearchAction.call(context(), 'alice');
    expect(state.success.mock.calls[0][0]).toMatchObject({ results: [], total: 0, partial: true, errors: [
      expect.objectContaining({ input: 'contacts', code: 'AUTH_KEY_UNREGISTERED' }),
    ] });
    expect(process.exitCode).toBe(1);
  });
});
