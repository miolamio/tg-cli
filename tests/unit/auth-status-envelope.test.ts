import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockWithLock = vi.fn();
vi.mock('../../src/lib/session-store.js', () => ({
  SessionStore: vi.fn().mockImplementation(() => ({
    withLock: (...args: any[]) => mockWithLock(...args),
  })),
}));

vi.mock('../../src/lib/config.js', () => ({
  createConfig: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    path: '/tmp/mock-config.json',
  })),
  getCredentialsOrThrow: vi.fn(() => ({ apiId: 12345, apiHash: 'testhash' })),
}));

const mockGetMe = vi.fn();
const mockCheckAuthorization = vi.fn();
vi.mock('../../src/lib/client.js', () => ({
  withClient: vi.fn(async (_opts: any, fn: any) =>
    fn({
      checkAuthorization: mockCheckAuthorization,
      getMe: mockGetMe,
    }, new AbortController().signal),
  ),
}));

import { statusAction } from '../../src/commands/auth/status.js';

describe('auth status envelope (no output/serialize mock)', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    mockWithLock.mockImplementation(async (_p: string, fn: (s: string) => Promise<any>) => fn('session'));
    mockCheckAuthorization.mockResolvedValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    process.exitCode = 0;
  });

  it('serializes user.id as a string even when gramjs id toJSON is {}', async () => {
    const weirdId = {
      toString: () => '12345',
      toJSON: () => ({}),
    };
    mockGetMe.mockResolvedValue({
      id: weirdId,
      phone: '+15551234567',
      username: 'testuser',
      firstName: 'Test',
    });

    await statusAction.call({
      optsWithGlobals: () => ({ profile: 'default', quiet: true, json: true }),
    } as any);

    expect(stdoutSpy).toHaveBeenCalled();
    const parsed = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.authorized).toBe(true);
    expect(parsed.data.user.id).toBe('12345');
    expect(JSON.stringify(parsed.data.user.id)).toBe('"12345"');
  });
});
