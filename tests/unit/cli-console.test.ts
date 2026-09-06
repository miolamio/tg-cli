import { afterEach, describe, expect, it, vi } from 'vitest';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import { inspect } from 'node:util';
import { installCliConsoleGuard } from '../../src/lib/cli-console.js';
import { createClientForAuth } from '../../src/lib/client.js';
import { setQuietMode, setVerboseMode } from '../../src/lib/cli-mode.js';

afterEach(() => {
  setQuietMode(false);
  setVerboseMode(false);
  vi.restoreAllMocks();
});

describe('CLI dependency console guard', () => {
  it.each([false, true])('prevents raw console data or secret payloads (quiet=%s)', quiet => {
    setQuietMode(quiet);
    setVerboseMode(true);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const payload = { apiHash: 'synthetic-secret', [inspect.custom]: () => { throw new Error('must not format secret objects'); } };
    const restore = installCliConsoleGuard();
    try {
      console.log(payload);
      console.info(payload);
      console.debug(payload);
      console.warn(payload);
      console.error(payload);
      console.dir(payload);
      console.table(payload);
      console.trace(payload);
      console.assert(false, payload);
    } finally { restore(); }
    expect(stdout).not.toHaveBeenCalled();
    if (quiet) expect(stderr).not.toHaveBeenCalled();
    else {
      expect(stderr).toHaveBeenCalledTimes(9);
      expect(stderr.mock.calls.flat().join('')).not.toContain('synthetic-secret');
    }
  });

  it.each([false, true])('contains the real SDK dialog initialization failure branch (quiet=%s)', async quiet => {
    setQuietMode(quiet);
    setVerboseMode(true);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const client = await createClientForAuth(1, 'synthetic-api-hash');
    const message = new Api.Message({
      id: 42, date: 1700000000, message: 'synthetic-message-content',
      peerId: new Api.PeerUser({ userId: bigInt(7) }),
    });
    const finish = vi.spyOn(message, '_finishInit').mockImplementation(() => {
      throw new Error('synthetic-error-payload');
    });
    vi.spyOn(client, 'invoke').mockResolvedValue(new Api.messages.Dialogs({
      dialogs: [], messages: [message], users: [], chats: [],
    }));
    const restore = installCliConsoleGuard();
    try {
      await expect(client.getDialogs({ limit: 1 })).resolves.toHaveLength(0);
      await client.destroy();
    } finally { restore(); }
    expect(finish).toHaveBeenCalledOnce();
    expect(stdout).not.toHaveBeenCalled();
    const diagnostics = stderr.mock.calls.flat().join('');
    expect(diagnostics).not.toContain('synthetic-');
    if (quiet) expect(stderr).not.toHaveBeenCalled();
    else expect(diagnostics).toContain('Dependency console.log output omitted');
  });

  it('leaves console untouched until explicitly installed and restores it', () => {
    const original = console.log;
    const restore = installCliConsoleGuard();
    expect(console.log).not.toBe(original);
    restore();
    expect(console.log).toBe(original);
  });
});
