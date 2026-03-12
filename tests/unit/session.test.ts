import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before imports
vi.mock('../../src/lib/session-store.js', () => ({
  SessionStore: vi.fn(),
}));

vi.mock('../../src/lib/config.js', () => ({
  createConfig: vi.fn(),
}));

vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: vi.fn(),
  outputError: vi.fn(),
  logStatus: vi.fn(),
}));

describe('session export', () => {
  let exportAction: typeof import('../../src/commands/session/export.js').exportAction;
  let SessionStore: any;
  let createConfig: any;
  let outputSuccess: any;
  let outputError: any;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();

    // Re-mock after resetModules
    vi.doMock('../../src/lib/session-store.js', () => ({
      SessionStore: vi.fn(),
    }));
    vi.doMock('../../src/lib/config.js', () => ({
      createConfig: vi.fn(),
    }));
    vi.doMock('../../src/lib/output.js', () => ({
      outputSuccess: vi.fn(),
      outputError: vi.fn(),
      logStatus: vi.fn(),
    }));

    const sessionMod = await import('../../src/lib/session-store.js');
    const configMod = await import('../../src/lib/config.js');
    const outputMod = await import('../../src/lib/output.js');
    const exportMod = await import('../../src/commands/session/export.js');

    SessionStore = sessionMod.SessionStore;
    createConfig = configMod.createConfig;
    outputSuccess = outputMod.outputSuccess;
    outputError = outputMod.outputError;
    exportAction = exportMod.exportAction;

    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy?.mockRestore();
    vi.restoreAllMocks();
  });

  it('outputs raw session string when json is default (not explicitly passed)', async () => {
    const mockStore = { load: vi.fn().mockResolvedValue('abc123session') };
    (SessionStore as any).mockImplementation(() => mockStore);

    const mockConfig = {
      path: '/tmp/tg-cli/config.json',
      get: vi.fn().mockReturnValue(undefined),
    };
    (createConfig as any).mockReturnValue(mockConfig);

    // Simulate Commander context: json is true but source is 'default' (not explicitly passed)
    const context = {
      optsWithGlobals: () => ({
        json: true,
        human: false,
        verbose: false,
        quiet: false,
        profile: 'default',
      }),
      parent: {
        getOptionValueSource: (name: string) => name === 'json' ? 'default' : undefined,
      },
    };

    await exportAction.call(context as any);

    // Should output raw session string, NOT JSON envelope
    expect(stdoutSpy).toHaveBeenCalledWith('abc123session\n');
    expect(outputSuccess).not.toHaveBeenCalled();
  });

  it('outputs JSON envelope with metadata when --json explicitly passed', async () => {
    const mockStore = { load: vi.fn().mockResolvedValue('abc123session') };
    (SessionStore as any).mockImplementation(() => mockStore);

    const mockConfig = {
      path: '/tmp/tg-cli/config.json',
      get: vi.fn().mockReturnValue({ session: 'abc123session', phone: '+1234567890', created: '2026-01-01T00:00:00Z' }),
    };
    (createConfig as any).mockReturnValue(mockConfig);

    // Simulate Commander context: json explicitly passed via CLI
    const context = {
      optsWithGlobals: () => ({
        json: true,
        human: false,
        verbose: false,
        quiet: false,
        profile: 'default',
      }),
      parent: {
        getOptionValueSource: (name: string) => name === 'json' ? 'cli' : undefined,
      },
    };

    await exportAction.call(context as any);

    expect(outputSuccess).toHaveBeenCalledWith({
      session: 'abc123session',
      phone: '+1234567890',
      created: '2026-01-01T00:00:00Z',
    });
  });

  it('outputs error when no session exists', async () => {
    const mockStore = { load: vi.fn().mockResolvedValue('') };
    (SessionStore as any).mockImplementation(() => mockStore);

    const mockConfig = {
      path: '/tmp/tg-cli/config.json',
      get: vi.fn().mockReturnValue(undefined),
    };
    (createConfig as any).mockReturnValue(mockConfig);

    const context = {
      optsWithGlobals: () => ({
        json: true,
        human: false,
        verbose: false,
        quiet: false,
        profile: 'default',
      }),
      parent: {
        getOptionValueSource: () => 'default',
      },
    };

    await exportAction.call(context as any);

    expect(outputError).toHaveBeenCalledWith(
      "No session found for profile 'default'",
      'NO_SESSION',
    );
  });
});

describe('session import', () => {
  let importAction: typeof import('../../src/commands/session/import.js').importAction;
  let SessionStore: any;
  let createConfig: any;
  let resolveCredentials: any;
  let withClient: any;
  let outputSuccess: any;
  let outputError: any;
  let logStatus: any;

  beforeEach(async () => {
    vi.resetModules();

    vi.doMock('../../src/lib/session-store.js', () => ({
      SessionStore: vi.fn(),
    }));
    vi.doMock('../../src/lib/config.js', () => ({
      createConfig: vi.fn(),
      resolveCredentials: vi.fn(),
    }));
    vi.doMock('../../src/lib/output.js', () => ({
      outputSuccess: vi.fn(),
      outputError: vi.fn(),
      logStatus: vi.fn(),
    }));
    vi.doMock('../../src/lib/client.js', () => ({
      withClient: vi.fn(),
    }));
    vi.doMock('../../src/lib/errors.js', () => ({
      formatError: vi.fn((err: any) => ({ message: err?.message ?? String(err) })),
    }));

    const sessionMod = await import('../../src/lib/session-store.js');
    const configMod = await import('../../src/lib/config.js');
    const outputMod = await import('../../src/lib/output.js');
    const clientMod = await import('../../src/lib/client.js');
    const importMod = await import('../../src/commands/session/import.js');

    SessionStore = sessionMod.SessionStore;
    createConfig = configMod.createConfig;
    resolveCredentials = (configMod as any).resolveCredentials;
    withClient = (clientMod as any).withClient;
    outputSuccess = outputMod.outputSuccess;
    outputError = outputMod.outputError;
    logStatus = outputMod.logStatus;
    importAction = importMod.importAction;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeContext(overrides: Record<string, any> = {}) {
    return {
      optsWithGlobals: () => ({
        json: true,
        human: false,
        verbose: false,
        quiet: false,
        profile: 'default',
        skipVerify: true,
        ...overrides,
      }),
    };
  }

  it('saves session string from argument to store (skip-verify)', async () => {
    const mockStore = { save: vi.fn().mockResolvedValue(undefined) };
    (SessionStore as any).mockImplementation(() => mockStore);

    const mockConfig = {
      path: '/tmp/tg-cli/config.json',
      set: vi.fn(),
    };
    (createConfig as any).mockReturnValue(mockConfig);

    const context = makeContext();

    await importAction.call(context as any, 'importedsession123');

    expect(mockStore.save).toHaveBeenCalledWith('default', 'importedsession123');
    expect(mockConfig.set).toHaveBeenCalledWith(
      'profiles.default',
      expect.objectContaining({
        session: 'importedsession123',
        created: expect.any(String),
      }),
    );
  });

  it('outputs success envelope with verified field after import', async () => {
    const mockStore = { save: vi.fn().mockResolvedValue(undefined) };
    (SessionStore as any).mockImplementation(() => mockStore);

    const mockConfig = {
      path: '/tmp/tg-cli/config.json',
      set: vi.fn(),
    };
    (createConfig as any).mockReturnValue(mockConfig);

    const context = makeContext();

    await importAction.call(context as any, 'importedsession123');

    expect(outputSuccess).toHaveBeenCalledWith({
      imported: true,
      profile: 'default',
      verified: false,
    });
  });

  it('validates session by default when credentials available', async () => {
    const mockStore = { save: vi.fn().mockResolvedValue(undefined) };
    (SessionStore as any).mockImplementation(() => mockStore);

    const mockConfig = {
      path: '/tmp/tg-cli/config.json',
      set: vi.fn(),
    };
    (createConfig as any).mockReturnValue(mockConfig);
    resolveCredentials.mockReturnValue({ apiId: 123, apiHash: 'abc' });
    withClient.mockImplementation(async (_opts: any, fn: any) => {
      return fn({ checkAuthorization: vi.fn().mockResolvedValue(true) });
    });

    const context = makeContext({ skipVerify: undefined });

    await importAction.call(context as any, 'validsession');

    expect(withClient).toHaveBeenCalledOnce();
    expect(mockStore.save).toHaveBeenCalledWith('default', 'validsession');
    expect(outputSuccess).toHaveBeenCalledWith({
      imported: true,
      profile: 'default',
      verified: true,
    });
  });

  it('rejects unauthorized session during verification', async () => {
    const mockStore = { save: vi.fn() };
    (SessionStore as any).mockImplementation(() => mockStore);

    const mockConfig = {
      path: '/tmp/tg-cli/config.json',
      set: vi.fn(),
    };
    (createConfig as any).mockReturnValue(mockConfig);
    resolveCredentials.mockReturnValue({ apiId: 123, apiHash: 'abc' });
    withClient.mockImplementation(async (_opts: any, fn: any) => {
      return fn({ checkAuthorization: vi.fn().mockResolvedValue(false) });
    });

    const context = makeContext({ skipVerify: undefined });

    await importAction.call(context as any, 'invalidsession');

    expect(outputError).toHaveBeenCalledWith(
      expect.stringContaining('not authorized'),
      'INVALID_SESSION',
    );
    expect(mockStore.save).not.toHaveBeenCalled();
  });

  it('rejects session when verification throws a connection error', async () => {
    const mockStore = { save: vi.fn() };
    (SessionStore as any).mockImplementation(() => mockStore);

    const mockConfig = {
      path: '/tmp/tg-cli/config.json',
      set: vi.fn(),
    };
    (createConfig as any).mockReturnValue(mockConfig);
    resolveCredentials.mockReturnValue({ apiId: 123, apiHash: 'abc' });
    withClient.mockRejectedValue(new Error('Connection failed'));

    const context = makeContext({ skipVerify: undefined });

    await importAction.call(context as any, 'badsession');

    expect(outputError).toHaveBeenCalledWith(
      expect.stringContaining('verification failed'),
      'VERIFY_FAILED',
    );
    expect(mockStore.save).not.toHaveBeenCalled();
  });

  it('skips verification with warning when no credentials configured and reports verified: false', async () => {
    const mockStore = { save: vi.fn().mockResolvedValue(undefined) };
    (SessionStore as any).mockImplementation(() => mockStore);

    const mockConfig = {
      path: '/tmp/tg-cli/config.json',
      set: vi.fn(),
    };
    (createConfig as any).mockReturnValue(mockConfig);
    resolveCredentials.mockReturnValue(null);

    const context = makeContext({ skipVerify: undefined });

    await importAction.call(context as any, 'somesession');

    expect(logStatus).toHaveBeenCalledWith(
      expect.stringContaining('Cannot verify session'),
      false,
    );
    expect(mockStore.save).toHaveBeenCalledWith('default', 'somesession');
    // Must NOT report verified: true when credentials were missing
    expect(outputSuccess).toHaveBeenCalledWith({
      imported: true,
      profile: 'default',
      verified: false,
    });
  });
});
