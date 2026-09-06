import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetMessages = vi.fn();
vi.mock('../../src/lib/with-auth.js', () => ({
  withAuth: vi.fn(async (_opts: any, fn: any) =>
    fn({ getMessages: mockGetMessages }),
  ),
}));

vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: vi.fn().mockResolvedValue({ id: 1, className: 'User' }),
  assertForum: vi.fn().mockResolvedValue(undefined),
}));

import { messageHistoryAction } from '../../src/commands/message/history.js';

describe('message history envelope (no output/serialize mock)', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    process.exitCode = 0;
  });

  it('includes senderName from msg._sender in the JSON envelope', async () => {
    mockGetMessages.mockResolvedValue([
      {
        id: 7,
        date: 1_700_000_000,
        message: 'hello',
        senderId: 99,
        _sender: { firstName: 'Alice', lastName: 'Smith' },
      },
    ]);

    await messageHistoryAction.call(
      {
        optsWithGlobals: () => ({
          profile: 'default',
          quiet: true,
          json: true,
          limit: '50',
          offset: '0',
        }),
      } as any,
      '@alice',
    );

    const parsed = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.messages[0].id).toBe(7);
    expect(parsed.data.messages[0].text).toBe('hello');
    expect(parsed.data.messages[0].senderName).toBe('Alice Smith');
  });
});
