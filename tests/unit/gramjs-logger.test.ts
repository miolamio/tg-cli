import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogLevel } from 'telegram/extensions/Logger.js';
import { TelegramClient } from 'telegram';
import { createClientForAuth, withClient } from '../../src/lib/client.js';
import { createGramjsLogger } from '../../src/lib/gramjs-logger.js';
import { setQuietMode, setVerboseMode } from '../../src/lib/cli-mode.js';

afterEach(() => {
  setQuietMode(false);
  setVerboseMode(false);
  vi.restoreAllMocks();
});

describe('gramjs diagnostics with the real SDK', () => {
  it.each([false, true])('keeps the constructor and teardown off stdout (quiet=%s)', async (quiet) => {
    setQuietMode(quiet);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const client = await createClientForAuth(1, 'synthetic-hash');
    try {
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      await client.destroy();
    }
    expect(stdout).not.toHaveBeenCalled();
    if (quiet) expect(stderr).not.toHaveBeenCalled();
  });

  it('withClient installs the logger before the real constructor runs', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.spyOn(TelegramClient.prototype, 'connect').mockResolvedValue(true);
    await expect(withClient({ apiId: 1, apiHash: 'synthetic-hash', sessionString: '' }, async () => 'ok')).resolves.toBe('ok');
    expect(stdout).not.toHaveBeenCalled();
  });

  it('shows verbose constructor diagnostics on stderr', async () => {
    setVerboseMode(true);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const client = await createClientForAuth(1, 'synthetic-hash');
    await client.destroy();
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr.mock.calls.flat().join('')).toContain('Running gramJS version');
  });

  it('honors quiet over verbose and routes warning/error diagnostics only to stderr', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const logger = createGramjsLogger();
    logger.debug('debug hidden');
    logger.info('info hidden');
    logger.warn('warning');
    logger.error('error');
    expect(stderr).toHaveBeenCalledTimes(2);
    setVerboseMode(true);
    logger.debug('debug visible');
    expect(stderr).toHaveBeenCalledTimes(3);
    setQuietMode(true);
    logger.error('hidden');
    expect(logger.canSend(LogLevel.ERROR)).toBe(false);
    expect(stderr).toHaveBeenCalledTimes(3);
    expect(stdout).not.toHaveBeenCalled();
  });

  it('redacts configured secrets and raw protocol payload diagnostics', () => {
    setVerboseMode(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const logger = createGramjsLogger(['synthetic-session', 'synthetic-hash']);
    logger.error('synthetic-session synthetic-hash synthetic-session');
    logger.info('Received response without parent request: sensitive payload');
    logger.info('Type 123 not found, remaining data sensitive bytes');
    const logged = stderr.mock.calls.flat().join('');
    expect(logged).not.toContain('synthetic-');
    expect(logged).not.toContain('sensitive');
    expect(logged).toContain('[redacted]');
  });
});
