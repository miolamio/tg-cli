import { describe, it } from 'vitest';

describe('outputSuccess in TOON mode', () => {
  it.todo('writes TOON-formatted string to stdout, not JSON');
  it.todo('output ends with newline');
  it.todo('does not write to stderr');
});

describe('outputSuccess in TOON mode with field selection', () => {
  it.todo('filters fields before TOON encoding (selected fields present)');
  it.todo('filtered fields are absent from TOON output');
});

describe('outputError in TOON mode', () => {
  it.todo('writes TOON-encoded error to stdout, not stderr');
  it.todo('output contains ok: false, error message, and error code');
});

describe('TOON mode does not interfere with other modes', () => {
  it.todo('after setToonMode(false), outputSuccess produces normal JSON');
});
