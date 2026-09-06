import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decode } from '@toon-format/toon';
import { outputSuccess, setOutputMode, setJsonlMode, setToonMode, setFieldSelection, setQuietMode } from '../../src/lib/output.js';

const failure = { input: 'second', error: 'Admin privileges required', code: 'CHAT_ADMIN_REQUIRED' };
const data = { messages: [{ id: 42, text: 'success' }], total: 1, partial: true, errors: [failure] };
let stdout: ReturnType<typeof vi.spyOn>;
let stderr: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  setOutputMode(false);
  setJsonlMode(false);
  setToonMode(false);
  setFieldSelection(null);
  setQuietMode(false);
  stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  setOutputMode(false);
  setJsonlMode(false);
  setToonMode(false);
  setFieldSelection(null);
  setQuietMode(false);
  process.exitCode = 0;
});
const written = () => stdout.mock.calls.map(call => String(call[0])).join('');

describe('partial batch output', () => {
  it.each([{ errors: [] }, { errors: [failure] }])('filters single-object successes while preserving errors: %j', ({ errors }) => {
    setFieldSelection(['id']);
    outputSuccess({ id: 42, phone: '+10000000000', partial: errors.length > 0, errors });
    expect(JSON.parse(written())).toEqual({ ok: true, data: { id: 42, partial: errors.length > 0, errors } });
  });
  it.each(['json', 'toon'])('preserves failure details under --fields id in %s', mode => {
    setFieldSelection(['id']);
    setToonMode(mode === 'toon');
    outputSuccess(data);
    const result = mode === 'toon' ? decode(written()) : JSON.parse(written());
    expect(result).toEqual({ ok: true, data: { ...data, messages: [{ id: 42 }] } });
    expect(stderr).not.toHaveBeenCalled();
  });

  it('streams failure records without envelope even with --fields and --quiet', () => {
    setJsonlMode(true);
    setFieldSelection(['id']);
    setQuietMode(true);
    outputSuccess(data);
    expect(written().trim().split('\n').map(line => JSON.parse(line))).toEqual([
      { id: 42 }, { status: 'failed', ...failure },
    ]);
    expect(stderr).not.toHaveBeenCalled();
  });

  it.each(['messages', 'posts', 'profiles', 'results'])('keeps all-failed %s batches observable in JSONL', key => {
    setJsonlMode(true);
    outputSuccess({ [key]: [], notFound: [], partial: true, errors: [failure] });
    expect(JSON.parse(written())).toEqual({ status: 'failed', ...failure });
  });

  it('prints failure details in human mode even when the successful list is empty', () => {
    setOutputMode(true);
    setQuietMode(true);
    outputSuccess({ ...data, messages: [] });
    expect(written()).toContain('Failed second: Admin privileges required [CHAT_ADMIN_REQUIRED]');
  });

  it('does not introduce a failure record for a successful empty batch', () => {
    setJsonlMode(true);
    outputSuccess({ messages: [], partial: false, errors: [] });
    expect(written()).toBe('');
  });
});
