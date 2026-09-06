import { describe, it, expect } from 'vitest';
import { JsonLineDecoder, MAX_FRAME_BYTES } from '../../src/lib/daemon/frames.js';

describe('NDJSON byte framing', () => {
  it('retains UTF-8 bytes across arbitrary chunk boundaries', () => {
    const decoder = new JsonLineDecoder();
    const bytes = Buffer.from('{"text":"Привет 🌍"}\n');
    const lines: string[] = [];
    for (const byte of bytes) decoder.push(Buffer.from([byte]), (line) => lines.push(line));
    expect(lines).toEqual(['{"text":"Привет 🌍"}']);
  });

  it('accepts several legal frames even when a data event exceeds the limit', () => {
    const decoder = new JsonLineDecoder();
    const line = 'x'.repeat(MAX_FRAME_BYTES);
    const lines: string[] = [];
    decoder.push(Buffer.from(line + '\n' + line + '\n'), (value) => lines.push(value));
    expect(lines).toEqual([line, line]);
  });

  it('rejects an oversized fragmented frame after a complete preceding frame', () => {
    const decoder = new JsonLineDecoder();
    const seen: string[] = [];
    decoder.push(Buffer.from('ping\n' + 'x'.repeat(MAX_FRAME_BYTES - 3)), (line) => seen.push(line));
    expect(() => decoder.push(Buffer.from('1234\n'), () => {})).toThrow('Message too large');
    expect(seen).toEqual(['ping']);
  });

  it('counts encoded bytes rather than characters', () => {
    const decoder = new JsonLineDecoder();
    expect(() => decoder.push(Buffer.from('я'.repeat(MAX_FRAME_BYTES / 2 + 1) + '\n'), () => {}))
      .toThrow('Message too large');
  });

  it('does not deliver an unterminated frame', () => {
    const decoder = new JsonLineDecoder();
    const lines: string[] = [];
    decoder.push(Buffer.from('one\ntwo'), (line) => lines.push(line));
    expect(lines).toEqual(['one']);
    decoder.push(Buffer.from('\n'), (line) => lines.push(line));
    expect(lines).toEqual(['one', 'two']);
  });
});
