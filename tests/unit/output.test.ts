import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { outputSuccess, outputError, logStatus, logVerbose, setOutputMode, getOutputMode, setJsonlMode, setFieldSelection, setToonMode, setQuietMode, setVerboseMode } from '../../src/lib/output.js';

afterEach(() => {
  process.exitCode = 0;
  setToonMode(false);
  setQuietMode(false);
  setVerboseMode(false);
});

describe('outputSuccess', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('writes JSON envelope with ok:true and data to stdout', () => {
    outputSuccess({ user: 'test' });

    expect(stdoutSpy).toHaveBeenCalledOnce();
    const written = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(written);
    expect(parsed).toEqual({ ok: true, data: { user: 'test' } });
  });

  it('appends a newline after the JSON', () => {
    outputSuccess({ user: 'test' });

    const written = stdoutSpy.mock.calls[0][0] as string;
    expect(written.endsWith('\n')).toBe(true);
  });

  it('does not write to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    outputSuccess({ user: 'test' });
    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});

describe('outputError exit code', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    process.exitCode = 0;
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    setOutputMode(false);
    setJsonlMode(false);
    setToonMode(false);
    process.exitCode = 0;
  });

  it('sets process.exitCode to 1 in JSON mode', () => {
    outputError('fail', 'AUTH_ERR');
    expect(process.exitCode).toBe(1);
  });

  it('sets process.exitCode to 1 in human mode', () => {
    setOutputMode(true);
    outputError('fail', 'AUTH_ERR');
    expect(process.exitCode).toBe(1);
  });

  it('sets process.exitCode to 1 in JSONL mode', () => {
    setJsonlMode(true);
    outputError('fail', 'AUTH_ERR');
    expect(process.exitCode).toBe(1);
  });

  it('sets process.exitCode to 1 in TOON mode', () => {
    setToonMode(true);
    outputError('fail', 'AUTH_ERR');
    expect(process.exitCode).toBe(1);
  });

  it('does not call process.exit (destroy/finally must still run)', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    outputError('fail', 'AUTH_ERR');
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

describe('outputSuccess exit code', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    process.exitCode = 0;
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    process.exitCode = 0;
  });

  it('leaves process.exitCode at 0', () => {
    outputSuccess({ ok: true });
    expect(process.exitCode).toBe(0);
  });
});

describe('outputError', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('writes JSON envelope with ok:false and error to stdout', () => {
    outputError('fail', 'AUTH_ERR');

    const written = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(written);
    expect(parsed).toEqual({ ok: false, error: 'fail', code: 'AUTH_ERR' });
  });

  it('omits code field when not provided', () => {
    outputError('fail');

    const written = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(written);
    expect(parsed).toEqual({ ok: false, error: 'fail' });
    expect(parsed).not.toHaveProperty('code');
  });

  it('appends a newline after the JSON', () => {
    outputError('fail');

    const written = stdoutSpy.mock.calls[0][0] as string;
    expect(written.endsWith('\n')).toBe(true);
  });
});

describe('logStatus', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('writes message to stderr with newline', () => {
    logStatus('connecting...');

    expect(stderrSpy).toHaveBeenCalledOnce();
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toBe('connecting...\n');
  });

  it('does not write to stdout', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    logStatus('connecting...');
    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });

  it('writes nothing when quiet is true', () => {
    logStatus('msg', true);

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('honors global quiet mode when quiet arg is omitted', () => {
    setQuietMode(true);
    logStatus('msg');
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

describe('logVerbose', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    setVerboseMode(false);
    setQuietMode(false);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    setVerboseMode(false);
    setQuietMode(false);
  });

  it('writes nothing by default', () => {
    logVerbose('rpc body');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('writes to stderr when verbose mode is on', () => {
    setVerboseMode(true);
    logVerbose('rpc body');
    expect(stderrSpy).toHaveBeenCalledWith('rpc body\n');
  });

  it('is suppressed by quiet mode', () => {
    setVerboseMode(true);
    setQuietMode(true);
    logVerbose('rpc body');
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

describe('setOutputMode / getOutputMode', () => {
  afterEach(() => {
    setOutputMode(false); // reset to default
  });

  it('defaults to false (JSON mode)', () => {
    expect(getOutputMode()).toBe(false);
  });

  it('sets mode to human when called with true', () => {
    setOutputMode(true);
    expect(getOutputMode()).toBe(true);
  });

  it('resets to JSON mode when called with false', () => {
    setOutputMode(true);
    setOutputMode(false);
    expect(getOutputMode()).toBe(false);
  });
});

describe('outputSuccess in human mode', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    setOutputMode(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    setOutputMode(false);
  });

  it('writes human-readable output instead of JSON envelope', () => {
    outputSuccess({ loggedIn: true, phone: '+1234' });

    const written = stdoutSpy.mock.calls[0][0] as string;
    // Should NOT be a JSON envelope with ok:true
    expect(() => {
      const parsed = JSON.parse(written);
      expect(parsed).not.toHaveProperty('ok');
    }).not.toThrow(); // formatGeneric produces valid JSON, but without envelope
  });

  it('formats messages in human mode', () => {
    outputSuccess({
      messages: [
        {
          id: 1, text: 'Hello', date: '2026-03-11T12:30:00.000Z',
          senderId: '123', senderName: 'Alice', replyToMsgId: null,
          forwardFrom: null, mediaType: null, type: 'message',
        },
      ],
      total: 1,
    });

    const written = stdoutSpy.mock.calls[0][0] as string;
    expect(written).toContain('Alice');
    expect(written).toContain('Hello');
  });
});

describe('outputError in human mode', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    setOutputMode(true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    setOutputMode(false);
  });

  it('writes error to stderr with "Error: " prefix', () => {
    outputError('something failed', 'TEST_ERR');

    expect(stderrSpy).toHaveBeenCalledOnce();
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toContain('Error:');
    expect(written).toContain('something failed');
  });

  it('does not write to stdout', () => {
    outputError('fail');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});

describe('outputSuccess in default JSON mode', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    setOutputMode(false);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('still writes JSON envelope when mode is not set', () => {
    outputSuccess({ test: true });

    const written = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(written);
    expect(parsed).toEqual({ ok: true, data: { test: true } });
  });
});

describe('outputSuccess in JSONL mode', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    setOutputMode(false);
    setJsonlMode(true);
    setFieldSelection(null as unknown as string[]);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    setJsonlMode(false);
    setFieldSelection(null as unknown as string[]);
  });

  it('writes one JSON object per line for list data, no envelope', () => {
    const msg1 = { id: 1, text: 'hello' };
    const msg2 = { id: 2, text: 'world' };
    outputSuccess({ messages: [msg1, msg2], total: 2 });

    expect(stdoutSpy).toHaveBeenCalledTimes(2);
    const line1 = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    const line2 = JSON.parse(stdoutSpy.mock.calls[1][0] as string);
    expect(line1).toEqual(msg1);
    expect(line2).toEqual(msg2);
  });

  it('each line ends with newline', () => {
    outputSuccess({ messages: [{ id: 1 }], total: 1 });

    const written = stdoutSpy.mock.calls[0][0] as string;
    expect(written.endsWith('\n')).toBe(true);
  });

  it('falls through to JSON envelope for non-list data', () => {
    outputSuccess({ status: 'ok', loggedIn: true });

    expect(stdoutSpy).toHaveBeenCalledOnce();
    const written = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(written);
    expect(parsed).toEqual({ ok: true, data: { status: 'ok', loggedIn: true } });
  });

  it('composes with field selection', () => {
    setFieldSelection(['id']);
    outputSuccess({
      messages: [
        { id: 1, text: 'hello', date: '2026-01-01' },
        { id: 2, text: 'world', date: '2026-01-02' },
      ],
      total: 2,
    });

    expect(stdoutSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(stdoutSpy.mock.calls[0][0] as string)).toEqual({ id: 1 });
    expect(JSON.parse(stdoutSpy.mock.calls[1][0] as string)).toEqual({ id: 2 });
  });

  it('works with chats array', () => {
    outputSuccess({ chats: [{ id: '1', title: 'Test' }], total: 1 });

    expect(stdoutSpy).toHaveBeenCalledOnce();
    expect(JSON.parse(stdoutSpy.mock.calls[0][0] as string)).toEqual({ id: '1', title: 'Test' });
  });

  it('works with profiles array (LIST_KEYS includes profiles)', () => {
    outputSuccess({ profiles: [{ id: '100', firstName: 'Alice' }], notFound: [] });

    expect(stdoutSpy).toHaveBeenCalledOnce();
    expect(JSON.parse(stdoutSpy.mock.calls[0][0] as string)).toEqual({ id: '100', firstName: 'Alice' });
  });

  it('reports notFound to stderr for profiles shape', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    outputSuccess({ profiles: [{ id: '100', firstName: 'Alice' }], notFound: ['bob', 'carol'] });

    // profiles streamed to stdout
    expect(stdoutSpy).toHaveBeenCalledOnce();
    expect(JSON.parse(stdoutSpy.mock.calls[0][0] as string)).toEqual({ id: '100', firstName: 'Alice' });

    // notFound reported to stderr
    expect(stderrSpy).toHaveBeenCalledOnce();
    const stderrWritten = stderrSpy.mock.calls[0][0] as string;
    expect(stderrWritten).toContain('bob');
    expect(stderrWritten).toContain('carol');
    stderrSpy.mockRestore();
  });

  it('suppresses JSONL notFound on stderr when quiet', () => {
    setQuietMode(true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    outputSuccess({ messages: [{ id: 1 }], notFound: [99] });
    expect(stdoutSpy).toHaveBeenCalledOnce();
    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
    setQuietMode(false);
  });

  it('works with users array (LIST_KEYS includes users)', () => {
    outputSuccess({ users: [{ id: '1', firstName: 'Dave', isBot: false }], total: 1 });

    expect(stdoutSpy).toHaveBeenCalledOnce();
    expect(JSON.parse(stdoutSpy.mock.calls[0][0] as string)).toEqual({ id: '1', firstName: 'Dave', isBot: false });
  });

  it('streams batch download files and failed entries', () => {
    outputSuccess({
      files: [{ path: '/tmp/a.jpg', filename: 'a.jpg', size: 1, mediaType: 'photo', messageId: 1 }],
      downloaded: 1,
      failed: [{ messageId: 2, error: 'no media', code: 'NO_MEDIA' }],
    });

    expect(stdoutSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(stdoutSpy.mock.calls[0][0] as string)).toEqual({
      path: '/tmp/a.jpg',
      filename: 'a.jpg',
      size: 1,
      mediaType: 'photo',
      messageId: 1,
      status: 'downloaded',
    });
    expect(JSON.parse(stdoutSpy.mock.calls[1][0] as string)).toEqual({
      messageId: 2,
      status: 'failed',
      error: 'no media',
      code: 'NO_MEDIA',
    });
  });

  it('streams DeleteResult as one JSONL line per deleted/failed ID', () => {
    outputSuccess({ deleted: [10, 20, 30], failed: [], mode: 'revoke' });

    expect(stdoutSpy).toHaveBeenCalledTimes(3);
    expect(JSON.parse(stdoutSpy.mock.calls[0][0] as string)).toEqual({ id: 10, status: 'deleted' });
    expect(JSON.parse(stdoutSpy.mock.calls[1][0] as string)).toEqual({ id: 20, status: 'deleted' });
    expect(JSON.parse(stdoutSpy.mock.calls[2][0] as string)).toEqual({ id: 30, status: 'deleted' });
  });

  it('streams DeleteResult failed entries with reason', () => {
    outputSuccess({
      deleted: [10],
      failed: [{ id: 20, reason: 'permission denied' }],
      mode: 'for-me',
    });

    expect(stdoutSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(stdoutSpy.mock.calls[0][0] as string)).toEqual({ id: 10, status: 'deleted' });
    expect(JSON.parse(stdoutSpy.mock.calls[1][0] as string)).toEqual({ id: 20, status: 'failed', reason: 'permission denied' });
  });

  it('streams DeleteResult with field selection', () => {
    setFieldSelection(['id']);
    outputSuccess({ deleted: [10, 20], failed: [], mode: 'revoke' });

    expect(stdoutSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(stdoutSpy.mock.calls[0][0] as string)).toEqual({ id: 10 });
    expect(JSON.parse(stdoutSpy.mock.calls[1][0] as string)).toEqual({ id: 20 });
  });
});

describe('outputSuccess with field selection in JSON mode', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    setOutputMode(false);
    setJsonlMode(false);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    setFieldSelection(null as unknown as string[]);
  });

  it('filters items but preserves envelope and metadata', () => {
    setFieldSelection(['id']);
    outputSuccess({
      messages: [{ id: 1, text: 'hello', date: '2026-01-01' }],
      total: 5,
    });

    const written = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(written);
    expect(parsed).toEqual({
      ok: true,
      data: { messages: [{ id: 1 }], total: 5 },
    });
  });

  it('preserves multiple metadata fields', () => {
    setFieldSelection(['id', 'title']);
    outputSuccess({
      chats: [{ id: '1', title: 'Chat', type: 'group' }],
      total: 10,
      count: 1,
    });

    const written = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(written);
    expect(parsed.data.total).toBe(10);
    expect(parsed.data.count).toBe(1);
    expect(parsed.data.chats).toEqual([{ id: '1', title: 'Chat' }]);
  });

  it('does not filter when no field selection is set', () => {
    outputSuccess({ messages: [{ id: 1, text: 'hi' }], total: 1 });

    const written = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(written);
    expect(parsed.data.messages[0]).toEqual({ id: 1, text: 'hi' });
  });
});

describe('outputSuccess with field selection in human mode', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    setOutputMode(true);
    setFieldSelection(['id']);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    setOutputMode(false);
    setFieldSelection(null as unknown as string[]);
  });

  it('silently ignores --fields in human mode', () => {
    outputSuccess({
      messages: [
        {
          id: 1, text: 'Hello', date: '2026-03-11T12:30:00.000Z',
          senderId: '123', senderName: 'Alice', replyToMsgId: null,
          forwardFrom: null, mediaType: null, type: 'message',
        },
      ],
      total: 1,
    });

    // Should still format as human-readable (not filtered to just id)
    const written = stdoutSpy.mock.calls[0][0] as string;
    expect(written).toContain('Alice');
    expect(written).toContain('Hello');
  });
});

describe('outputError in JSONL mode', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    setOutputMode(false);
    setJsonlMode(true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    setJsonlMode(false);
  });

  it('writes error to stderr only, no envelope', () => {
    outputError('something failed', 'TEST_ERR');

    expect(stderrSpy).toHaveBeenCalledOnce();
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toContain('Error:');
    expect(written).toContain('something failed');
    expect(written).toContain('[TEST_ERR]');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('writes error without code when not provided', () => {
    outputError('oops');

    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toBe('Error: oops\n');
  });
});
