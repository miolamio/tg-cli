import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { outputSuccess, outputError, setOutputMode, setJsonlMode, setFieldSelection } from '../../src/lib/output.js';
// This import will fail until setToonMode is implemented
import { setToonMode } from '../../src/lib/output.js';

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

  it.todo('does not write to stderr');
});

describe('outputSuccess in TOON mode with field selection', () => {
  it.todo('filters fields before TOON encoding (selected fields present)');
  it.todo('filtered fields are absent from TOON output');
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
    const written = stdoutSpy.mock.calls[0][0] as string;
    expect(written).toContain('ok: false');
    expect(written).toContain('fail');
    expect(written).toContain('TEST_ERR');
  });

  it.todo('output contains ok: false, error message, and error code');
});

describe('TOON mode does not interfere with other modes', () => {
  it.todo('after setToonMode(false), outputSuccess produces normal JSON');
});
