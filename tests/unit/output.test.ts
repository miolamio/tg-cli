import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { outputSuccess, outputError, logStatus, setOutputMode, getOutputMode } from '../../src/lib/output.js';

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
