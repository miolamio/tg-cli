import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';

// ---- Mocks ----

// Mock prompt
const mockAsk = vi.fn();
const mockAskSecret = vi.fn();
const mockClose = vi.fn();
vi.mock('../../src/lib/prompt.js', () => ({
  createPrompt: vi.fn(() => ({ ask: mockAsk, askSecret: mockAskSecret, close: mockClose })),
}));

// Mock output
const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
const mockLogStatus = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: (...args: any[]) => mockLogStatus(...args),
}));

// Hoisted mock state for telegram client
const {
  mockStart,
  mockConnect,
  mockDestroy,
  mockCheckAuthorization,
  mockGetMe,
  mockInvoke,
  mockSessionSave,
} = vi.hoisted(() => ({
  mockStart: vi.fn().mockResolvedValue(undefined),
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockCheckAuthorization: vi.fn().mockResolvedValue(true),
  mockGetMe: vi.fn().mockResolvedValue({ id: 123, phone: '+15551234567', username: 'testuser', firstName: 'Test' }),
  mockInvoke: vi.fn().mockResolvedValue(true),
  mockSessionSave: vi.fn().mockReturnValue('saved-session-string'),
}));

const mockClientInstance = {
  start: mockStart,
  connect: mockConnect,
  destroy: mockDestroy,
  checkAuthorization: mockCheckAuthorization,
  getMe: mockGetMe,
  invoke: mockInvoke,
  session: { save: mockSessionSave },
};

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: {
    StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
  },
  Api: {
    auth: {
      LogOut: vi.fn().mockImplementation(() => ({ className: 'auth.LogOut' })),
    },
  },
}));

// Mock config
const mockConfigGet = vi.fn();
const mockConfigSet = vi.fn();
const mockConfigDelete = vi.fn();
const mockConfigObj = {
  get: mockConfigGet,
  set: mockConfigSet,
  delete: mockConfigDelete,
  path: '/tmp/mock-config.json',
};

vi.mock('../../src/lib/config.js', () => ({
  createConfig: vi.fn(() => mockConfigObj),
  resolveCredentials: vi.fn(),
  getCredentialsOrThrow: vi.fn(() => ({ apiId: 12345, apiHash: 'testhash' })),
}));

// We need to mock SessionStore at the module level
const mockStoreSave = vi.fn().mockResolvedValue(undefined);
const mockStoreLoad = vi.fn().mockResolvedValue('');
const mockStoreDelete = vi.fn().mockResolvedValue(undefined);
const mockStoreDeleteUnlocked = vi.fn();
const mockStoreWithLock = vi.fn().mockImplementation(async (_profile: string, fn: (s: string) => Promise<any>) => {
  const session = await mockStoreLoad();
  return fn(session);
});

vi.mock('../../src/lib/session-store.js', () => ({
  SessionStore: vi.fn().mockImplementation(() => ({
    save: mockStoreSave,
    load: mockStoreLoad,
    delete: mockStoreDelete,
    deleteUnlocked: mockStoreDeleteUnlocked,
    withLock: mockStoreWithLock,
    filePath: (p: string) => `/mock/sessions/${p}.session`,
  })),
}));

// Mock client module
vi.mock('../../src/lib/client.js', () => ({
  createClientForAuth: vi.fn(async () => mockClientInstance),
  withClient: vi.fn(async (_opts: any, fn: any) => fn(mockClientInstance)),
}));

// Import after mocks
import { loginAction } from '../../src/commands/auth/login.js';
import { statusAction } from '../../src/commands/auth/status.js';
import { logoutAction } from '../../src/commands/auth/logout.js';
import { createAuthCommand } from '../../src/commands/auth/index.js';

// Create a mock Command context for action handlers
function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default',
      quiet: false,
      config: undefined,
      json: true,
      human: false,
      verbose: false,
      ...opts,
    })),
  };
}

describe('loginAction', () => {
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAsk.mockResolvedValue('+15551234567');
    mockAskSecret.mockResolvedValue('secret123');
    // Default: simulate interactive TTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, writable: true, configurable: true });
  });

  it('calls client.start() with phone, code, and password callbacks', async () => {
    const ctx = createMockCommandContext();
    await loginAction.call(ctx as any);

    expect(mockStart).toHaveBeenCalledOnce();
    const startArgs = mockStart.mock.calls[0][0];
    expect(startArgs).toHaveProperty('phoneNumber');
    expect(startArgs).toHaveProperty('phoneCode');
    expect(startArgs).toHaveProperty('password');
    expect(startArgs).toHaveProperty('onError');
    expect(typeof startArgs.phoneNumber).toBe('function');
    expect(typeof startArgs.phoneCode).toBe('function');
    expect(typeof startArgs.password).toBe('function');
  });

  it('saves session string after successful login', async () => {
    const ctx = createMockCommandContext();
    await loginAction.call(ctx as any);

    expect(mockStoreSave).toHaveBeenCalledWith('default', 'saved-session-string');
  });

  it('outputs success with truncated session and phone', async () => {
    const ctx = createMockCommandContext();
    await loginAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data).toHaveProperty('session');
    expect(data).toHaveProperty('phone');
  });

  it('destroys client and closes prompt on completion', async () => {
    const ctx = createMockCommandContext();
    await loginAction.call(ctx as any);

    expect(mockDestroy).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it('destroys client and closes prompt even on error', async () => {
    mockStart.mockRejectedValueOnce(new Error('auth failed'));
    const ctx = createMockCommandContext();

    // Should not throw (error is handled gracefully)
    await loginAction.call(ctx as any);

    expect(mockDestroy).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it('outputs NOT_INTERACTIVE error when stdin is not a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });
    const ctx = createMockCommandContext();

    await loginAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.stringContaining('Interactive login requires a terminal'),
      'NOT_INTERACTIVE',
    );
    // Should NOT have tried to start auth
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('uses askSecret for 2FA password callback (not ask)', async () => {
    // Make client.start call the password callback
    mockStart.mockImplementationOnce(async (opts: any) => {
      await opts.phoneNumber();
      await opts.phoneCode(true);
      await opts.password('my hint');
    });

    const ctx = createMockCommandContext();
    await loginAction.call(ctx as any);

    // Phone and code should use ask()
    expect(mockAsk).toHaveBeenCalledWith('Phone number (international format): ');
    expect(mockAsk).toHaveBeenCalledWith('Code (from Telegram app): ');
    // Password should use askSecret() for masked input
    expect(mockAskSecret).toHaveBeenCalledWith('2FA password (hint: my hint): ');
  });
});

describe('statusAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('outputs authorized: false when no session file exists', async () => {
    mockStoreLoad.mockResolvedValueOnce('');
    const ctx = createMockCommandContext();
    await statusAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.authorized).toBe(false);
  });

  it('checks authorization with existing session', async () => {
    mockStoreLoad.mockResolvedValueOnce('existing-session');
    mockCheckAuthorization.mockResolvedValueOnce(true);
    const ctx = createMockCommandContext();
    await statusAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.authorized).toBe(true);
  });
});

describe('logoutAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('outputs error when not logged in', async () => {
    mockStoreLoad.mockResolvedValueOnce('');
    const ctx = createMockCommandContext();
    await logoutAction.call(ctx as any);

    expect(mockOutputError).toHaveBeenCalledOnce();
  });

  it('invokes auth.LogOut and deletes session file (without re-locking)', async () => {
    mockStoreLoad.mockResolvedValueOnce('existing-session');
    const ctx = createMockCommandContext();
    await logoutAction.call(ctx as any);

    expect(mockInvoke).toHaveBeenCalled();
    // Must use deleteUnlocked (not delete) to avoid deadlock inside withLock
    expect(mockStoreDeleteUnlocked).toHaveBeenCalledWith('default');
    expect(mockStoreDelete).not.toHaveBeenCalled();
  });

  it('outputs loggedOut: true on success', async () => {
    mockStoreLoad.mockResolvedValueOnce('existing-session');
    const ctx = createMockCommandContext();
    await logoutAction.call(ctx as any);

    expect(mockOutputSuccess).toHaveBeenCalledOnce();
    const data = mockOutputSuccess.mock.calls[0][0];
    expect(data.loggedOut).toBe(true);
  });
});

describe('createAuthCommand', () => {
  it('returns a Command with auth name', () => {
    const cmd = createAuthCommand();
    expect(cmd.name()).toBe('auth');
  });

  it('has login, status, and logout subcommands', () => {
    const cmd = createAuthCommand();
    const subcommands = cmd.commands.map((c: any) => c.name());
    expect(subcommands).toContain('login');
    expect(subcommands).toContain('status');
    expect(subcommands).toContain('logout');
  });
});
