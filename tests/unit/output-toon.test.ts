import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { outputSuccess, outputError, setOutputMode, setJsonlMode, setFieldSelection, setToonMode } from '../../src/lib/output.js';

describe('outputSuccess in TOON mode', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    setOutputMode(false);
    setJsonlMode(false);
    setToonMode(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    setToonMode(false);
  });

  it('writes TOON-formatted string to stdout, not JSON', () => {
    outputSuccess({ messages: [{ id: 1, text: 'hi' }], total: 1 });

    expect(stdoutSpy).toHaveBeenCalled();
    const written = stdoutSpy.mock.calls[0][0] as string;
    // Should contain TOON markers like "ok: true" without JSON braces
    expect(written).toContain('ok: true');
    // Should NOT be valid JSON with ok property
    try {
      const parsed = JSON.parse(written);
      expect(parsed).not.toHaveProperty('ok');
    } catch {
      // Expected: TOON is not valid JSON
    }
  });

  it('output ends with newline', () => {
    outputSuccess({ value: 42 });

    const written = stdoutSpy.mock.calls[0][0] as string;
    expect(written.endsWith('\n')).toBe(true);
  });

  it('does not write to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    outputSuccess({ messages: [{ id: 1, text: 'test' }], total: 1 });
    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});

describe('outputSuccess in TOON mode with field selection', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    setOutputMode(false);
    setJsonlMode(false);
    setToonMode(true);
    setFieldSelection(['id', 'text']);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    setFieldSelection(null as unknown as string[]);
    setToonMode(false);
  });

  it('filters fields before TOON encoding (selected fields present)', () => {
    outputSuccess({ messages: [{ id: 1, text: 'hi', date: '2026-03-13' }], total: 1 });

    const written = stdoutSpy.mock.calls[0][0] as string;
    expect(written).toContain('id');
    expect(written).toContain('text');
  });

  it('filtered fields are absent from TOON output', () => {
    outputSuccess({ messages: [{ id: 1, text: 'hi', date: '2026-03-13' }], total: 1 });

    const written = stdoutSpy.mock.calls[0][0] as string;
    // date was not in the field selection, so it should be absent
    expect(written).not.toContain('2026-03-13');
  });
});

describe('outputError in TOON mode', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    setOutputMode(false);
    setJsonlMode(false);
    setToonMode(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    setToonMode(false);
  });

  it('writes TOON-encoded error to stdout, not stderr', () => {
    outputError('fail', 'TEST_ERR');

    expect(stdoutSpy).toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('output contains ok: false, error message, and error code', () => {
    outputError('fail', 'TEST_ERR');

    const written = stdoutSpy.mock.calls[0][0] as string;
    expect(written).toContain('ok: false');
    expect(written).toContain('fail');
    expect(written).toContain('TEST_ERR');
  });
});

describe('TOON mode does not interfere with other modes', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    setOutputMode(false);
    setJsonlMode(false);
    setToonMode(false);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    setToonMode(false);
  });

  it('after setToonMode(false), outputSuccess produces normal JSON', () => {
    setToonMode(false);
    outputSuccess({ test: true });

    const written = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(written);
    expect(parsed).toEqual({ ok: true, data: { test: true } });
  });
});
