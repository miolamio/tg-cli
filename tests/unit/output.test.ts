import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { outputSuccess, outputError, logStatus } from '../../src/lib/output.js';

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
