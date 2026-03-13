import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countTokens } from 'gpt-tokenizer';
import { encodeToon } from '../../src/lib/toon.js';

const FIXTURE_DIR = join(import.meta.dirname, '..', 'fixtures', 'toon-benchmark');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf-8'));
}

/**
 * Measure token savings of TOON encoding vs JSON encoding.
 * Returns the savings ratio (1 - toonTokens / jsonTokens).
 */
function measureSavings(name: string, data: unknown): number {
  const envelope = { ok: true, data };
  const jsonStr = JSON.stringify(envelope);
  const toonStr = encodeToon(envelope);

  const jsonTokens = countTokens(jsonStr);
  const toonTokens = countTokens(toonStr);
  const savings = 1 - toonTokens / jsonTokens;

  console.log(
    `${name}: JSON=${jsonTokens} TOON=${toonTokens} savings=${(savings * 100).toFixed(1)}%`,
  );

  return savings;
}

describe('TOON benchmark gate', () => {
  it('achieves >= 20% token savings on 100+ messages', () => {
    const fixture = loadFixture('messages-100.json');
    const savings = measureSavings('messages-100', fixture);
    expect(savings).toBeGreaterThanOrEqual(0.20);
  });

  it('achieves >= 20% token savings on 50+ chat list items', () => {
    const fixture = loadFixture('chat-list-50.json');
    const savings = measureSavings('chat-list-50', fixture);
    expect(savings).toBeGreaterThanOrEqual(0.20);
  });

  it('achieves >= 20% token savings on 10 user profiles', () => {
    const fixture = loadFixture('user-profiles-10.json');
    const savings = measureSavings('user-profiles-10', fixture);
    expect(savings).toBeGreaterThanOrEqual(0.20);
  });

  it('achieves >= 20% token savings on 30 search results', () => {
    const fixture = loadFixture('search-results-30.json');
    const savings = measureSavings('search-results-30', fixture);
    expect(savings).toBeGreaterThanOrEqual(0.20);
  });

  it('achieves >= 15% token savings on mixed data shapes', () => {
    const fixture = loadFixture('mixed-shapes.json');
    const savings = measureSavings('mixed-shapes', fixture);
    expect(savings).toBeGreaterThanOrEqual(0.15);
  });
});
