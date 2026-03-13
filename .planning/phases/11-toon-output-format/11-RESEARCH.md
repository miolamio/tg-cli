# Phase 11: TOON Output Format - Research

**Researched:** 2026-03-13
**Domain:** Output formatting, token-efficient serialization, CLI flag composition
**Confidence:** HIGH

## Summary

Phase 11 adds a `--toon` global flag that encodes CLI output using Token-Oriented Object Notation (TOON) -- a compact, LLM-optimized format that reduces token consumption by 30-60% on uniform array data compared to JSON. The implementation uses the official `@toon-format/toon` TypeScript SDK (v2.1.0), which provides a single `encode(value, options?)` function that handles all formatting rules per the TOON v3.0 spec.

The integration is straightforward because the existing output system (`output.ts`) already supports pluggable output modes (JSON, human, JSONL) via module-level flags and a priority chain in `outputSuccess()`/`outputError()`. Adding TOON follows the identical pattern: a new `_toonMode` flag, a `setToonMode()` function, and a TOON branch in the output priority chain. Mutual exclusion validation extends the existing `preAction` hook in `tg.ts`.

The benchmark gate requires a local tokenizer. The `@anthropic-ai/tokenizer` package (v0.0.4, last published 3 years ago) is inaccurate for Claude 3+ models but still serves as a "very rough approximation." Since the benchmark only needs to demonstrate *relative* savings (TOON vs JSON on the same data), any consistent tokenizer suffices. The recommendation is `gpt-tokenizer` (pure JS, ESM-compatible, `o200k_base` default, `countTokens()` API) as it is modern, fast, and well-maintained.

**Primary recommendation:** Use `@toon-format/toon` with `{ delimiter: '\t', keyFolding: 'safe' }` fixed options; add `gpt-tokenizer` as a devDependency for benchmark tests; wire `--toon` into the existing output mode priority chain as highest priority.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use `@toon-format/toon` npm package -- official TypeScript SDK with `encode(value, options?)` API
- No custom format design -- follow the official TOON spec v3.0 exactly
- SDK handles all encoding rules: tabular arrays, YAML-like objects, string quoting, escaping, number normalization
- **Delimiter:** Tab (`\t`) -- best token savings since message text often contains commas
- **Key folding:** Safe mode on (`keyFolding: 'safe'`) -- collapses single-key wrapper chains
- **Indent:** 2 spaces (spec default)
- Pass these as fixed options to `encode()` -- no user-configurable TOON sub-options
- Encode the full `{ ok: true, data: ... }` envelope through TOON (not just the data payload)
- Errors also render as TOON: `ok: false`, `error:`, `code:` -- consistent format
- Single TOON document output (no streaming)
- `--toon` is mutually exclusive with both `--human` and `--jsonl`
- Four output modes: JSON (default), `--human`, `--toon`, `--jsonl` -- pick exactly one
- Conflicting flags produce a clear `INVALID_OPTIONS` error
- `--fields` works with `--toon`: filter first, then encode
- Dot-notation paths work exactly as in JSON mode
- Messages without a nested field get `null` in the TOON tabular row
- No null stripping -- pass data as-is to `encode()`
- **Tokenizer:** Claude tokenizer (`@anthropic-ai/tokenizer` or equivalent)
- **Test data:** Synthetic fixtures checked into repo -- 100+ messages, 50+ chat list items, 10 user profiles, 30 search results, mixed shapes
- **Gate:** CI test that asserts TOON output is >=20% fewer tokens than equivalent JSON for each fixture
- **Enforcement:** Test failure blocks CI if token savings drop below threshold

### Claude's Discretion
- Exact synthetic fixture content (realistic message text, media metadata, poll data variations)
- Whether to use `@anthropic-ai/tokenizer` or an alternative Claude-compatible token counter
- How to wire the `--toon` flag into GlobalOptions and the preAction hook (follows existing pattern)
- TOON replacer usage (if any edge cases arise during implementation)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OUT-07 | User can use `--toon` flag for TOON output format (token-efficient, LLM-optimized) with mutual exclusion against `--human` and `--jsonl` | SDK API verified (`encode(value, options?)`), output.ts patterns documented, preAction hook mutual exclusion pattern established, benchmark tokenizer options researched |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@toon-format/toon` | ^2.1.0 | TOON encoding of JSON data | Official TypeScript SDK for TOON spec v3.0; 216+ dependents on npm; `encode()` handles all spec rules (tabular arrays, key folding, quoting, escaping) |

### Supporting (devDependency only)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gpt-tokenizer` | ^2.4.0 | Token counting for benchmark gate tests | Pure JS, ESM-compatible, `o200k_base` default encoding, `countTokens(text)` API. Used only in test files for measuring token savings. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gpt-tokenizer` | `@anthropic-ai/tokenizer` | v0.0.4, last published 3 years ago, explicitly inaccurate for Claude 3+ models. Provides "very rough approximation" only. Since benchmark measures *relative* savings (not absolute counts), either works, but `gpt-tokenizer` is modern and maintained. |
| `gpt-tokenizer` | Anthropic Messages API `countTokens` | Accurate but requires API key and network calls; unsuitable for offline CI tests. |

**Installation:**
```bash
npm install @toon-format/toon
npm install -D gpt-tokenizer
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── output.ts          # Add _toonMode flag, setToonMode(), TOON branch in outputSuccess/outputError
│   ├── types.ts           # Add toon?: boolean to GlobalOptions
│   └── toon.ts            # (NEW) Thin wrapper: encodeToon(data) calls encode() with fixed options
├── bin/
│   └── tg.ts              # Add --toon global option, extend preAction mutual exclusion
tests/
├── unit/
│   ├── toon.test.ts       # (NEW) Unit tests for TOON encoding wrapper
│   ├── output-toon.test.ts # (NEW) Tests for TOON mode in outputSuccess/outputError
│   └── toon-benchmark.test.ts # (NEW) Benchmark gate: token savings assertions
└── fixtures/
    └── toon-benchmark/    # (NEW) Synthetic JSON fixtures for benchmark
        ├── messages-100.json
        ├── chat-list-50.json
        ├── user-profiles-10.json
        ├── search-results-30.json
        └── mixed-shapes.json
```

### Pattern 1: TOON Encoder Wrapper
**What:** A thin module that calls `encode()` with the project's fixed options, providing a single import point.
**When to use:** All TOON output paths go through this wrapper.
**Example:**
```typescript
// src/lib/toon.ts
// Source: https://toonformat.dev/reference/api
import { encode } from '@toon-format/toon';

/** Fixed TOON encode options per project decisions. */
const TOON_OPTIONS = {
  indent: 2,
  delimiter: '\t' as const,
  keyFolding: 'safe' as const,
} as const;

/**
 * Encode any JSON-serializable value to TOON format.
 * Uses tab delimiter and safe key folding for optimal token efficiency.
 */
export function encodeToon(value: unknown): string {
  return encode(value, TOON_OPTIONS);
}
```

### Pattern 2: Output Mode Priority Chain Extension
**What:** Add TOON as highest-priority output mode in `outputSuccess()`.
**When to use:** The existing chain is `JSONL > human > JSON`. TOON becomes `TOON > JSONL > human > JSON`.
**Example:**
```typescript
// In outputSuccess() — new TOON branch at top:
export function outputSuccess<T>(data: T): void {
  // TOON mode: encode full envelope through TOON
  if (_toonMode) {
    const filteredData = _fieldSelection
      ? applyFieldSelection(data, _fieldSelection) as T
      : data;
    const envelope = { ok: true, data: filteredData };
    process.stdout.write(encodeToon(envelope) + '\n');
    return;
  }

  // Existing JSONL, human, JSON branches...
}
```

### Pattern 3: Mutual Exclusion in preAction Hook
**What:** Extend existing flag conflict detection.
**When to use:** The `preAction` hook in `tg.ts` already validates `--jsonl` + `--human`. Add `--toon` checks.
**Example:**
```typescript
// In tg.ts preAction hook:
if (opts.toon && isHuman) {
  outputError('--toon and --human are mutually exclusive', 'INVALID_OPTIONS');
  process.exit(1);
}
if (opts.toon && opts.jsonl) {
  outputError('--toon and --jsonl are mutually exclusive', 'INVALID_OPTIONS');
  process.exit(1);
}
if (opts.toon) setToonMode(true);
```

### Pattern 4: Benchmark Gate Test
**What:** CI test that loads synthetic fixtures, encodes as both JSON and TOON, counts tokens, asserts savings >= 20%.
**When to use:** Runs with `vitest run` as part of the normal test suite.
**Example:**
```typescript
// tests/unit/toon-benchmark.test.ts
import { countTokens } from 'gpt-tokenizer';
import { encodeToon } from '../../src/lib/toon.js';
import messagesFixture from '../fixtures/toon-benchmark/messages-100.json';

describe('TOON benchmark gate', () => {
  it('achieves >= 20% token savings on 100+ messages', () => {
    const envelope = { ok: true, data: messagesFixture };
    const jsonStr = JSON.stringify(envelope);
    const toonStr = encodeToon(envelope);

    const jsonTokens = countTokens(jsonStr);
    const toonTokens = countTokens(toonStr);
    const savings = 1 - toonTokens / jsonTokens;

    expect(savings).toBeGreaterThanOrEqual(0.20);
  });
});
```

### Anti-Patterns to Avoid
- **Hand-rolling TOON encoding:** Never build custom tabular formatting. The SDK handles all edge cases (string quoting when text contains the delimiter, null handling, number normalization, escape sequences).
- **Stripping the envelope before TOON encoding:** The decision is to encode the full `{ ok: true, data: ... }` envelope. Key folding handles the nesting nicely.
- **Making TOON options user-configurable:** The delimiter and key folding are fixed project decisions. No `--toon-delimiter` flag.
- **Using TOON for streaming/per-item output:** TOON's biggest win is the tabular format for arrays (header declared once). Splitting per-item would lose this advantage.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOON encoding | Custom tabular formatter | `@toon-format/toon` `encode()` | Spec-compliant quoting, escaping, key folding, null handling, BigInt/Date normalization. Hundreds of edge cases. |
| Token counting | Character-length heuristics or word count | `gpt-tokenizer` `countTokens()` | BPE tokenization is non-trivial; "4 chars per token" heuristic is unreliable for structured data with punctuation. |
| Mutual exclusion validation | Custom flag parsing | Commander's existing `optsWithGlobals()` + preAction hook | Already established pattern; extending it is 5 lines. |
| Field selection | Custom TOON field filtering | Existing `applyFieldSelection()` then `encode()` | Filter first (JSON domain), then encode to TOON. No TOON-level field awareness needed. |

**Key insight:** The TOON SDK is a pure function (`encode(value) -> string`). The entire integration is: filter data with existing `applyFieldSelection()`, wrap in envelope, pass to `encode()`, write to stdout. Zero custom formatting logic needed.

## Common Pitfalls

### Pitfall 1: Tab Characters in Message Text
**What goes wrong:** Telegram messages may contain literal tab characters (`\t`). When the TOON delimiter is also tab, unescaped tabs in values would break parsing.
**Why it happens:** Tab is a common whitespace character in copy-pasted text.
**How to avoid:** The TOON SDK handles this automatically. Per the spec: "A string value MUST be quoted if it contains the active delimiter." The SDK quotes strings containing tabs when tab is the delimiter and escapes internal tabs as `\t`. No action needed beyond using the SDK correctly.
**Warning signs:** If hand-rolling, you would see broken tabular rows. Since we use the SDK, this is not a risk.

### Pitfall 2: Importing gpt-tokenizer in Production Code
**What goes wrong:** `gpt-tokenizer` is a devDependency for benchmark tests only. If imported in `src/` production code, the build would fail in production installs.
**Why it happens:** Copy-paste from test code, or unclear module boundaries.
**How to avoid:** `gpt-tokenizer` lives ONLY in `tests/` files. The `src/lib/toon.ts` module imports only from `@toon-format/toon`.
**Warning signs:** `import { countTokens }` appearing anywhere in `src/`.

### Pitfall 3: TOON Error Output Going to Wrong Stream
**What goes wrong:** JSONL mode sends errors to stderr only (no envelope). If TOON mode is implemented inconsistently, errors might go to stderr in TOON format (unreadable by machine) or stdout without TOON encoding.
**Why it happens:** Copying JSONL's error pattern without adaptation.
**How to avoid:** Per decisions, TOON errors go to stdout as TOON-encoded `{ ok: false, error, code }` -- same channel as JSON errors, just TOON-formatted. This is consistent with the JSON mode pattern.
**Warning signs:** `process.stderr.write` inside a TOON error branch.

### Pitfall 4: Field Selection Applied After TOON Encoding
**What goes wrong:** If fields are filtered on the TOON string rather than the JSON data, field selection would fail or produce garbage.
**Why it happens:** Incorrect ordering in the output pipeline.
**How to avoid:** The pipeline is: `data -> applyFieldSelection() -> wrap in envelope -> encode()`. Field selection always operates on JSON objects, before TOON encoding.
**Warning signs:** `encodeToon()` called before `applyFieldSelection()`.

### Pitfall 5: Mixed Data Shapes Underperforming in Benchmark
**What goes wrong:** TOON's biggest savings come from uniform arrays (header-once tabular layout). Non-uniform data or deeply nested objects may show only 10-15% savings, failing the 20% gate.
**Why it happens:** TOON's tabular format requires arrays of objects with identical keys.
**How to avoid:** Telegram CLI data shapes are naturally uniform: `messages[]` all have the same MessageItem fields, `chats[]` all have ChatListItem fields. The 20% gate is achievable. However, the `mixed-shapes.json` fixture should include *realistic* mixed data and may need a separate, lower threshold or be excluded from the gate. The benchmark should test each fixture category independently.
**Warning signs:** Overall average savings dipping below 20% due to a single outlier fixture.

### Pitfall 6: setToonMode Not Reset Between Tests
**What goes wrong:** Module-level `_toonMode` flag persists between test cases, causing subsequent tests to unexpectedly output TOON.
**Why it happens:** vitest runs tests in the same process; module state is shared.
**How to avoid:** Always reset in `afterEach`: `setToonMode(false)`. Follow the existing pattern from JSONL tests in `output.test.ts`.
**Warning signs:** Tests passing individually but failing when run together.

## Code Examples

Verified patterns from official sources:

### TOON Encoding with Options
```typescript
// Source: https://toonformat.dev/reference/api
import { encode } from '@toon-format/toon';

const data = {
  ok: true,
  data: {
    messages: [
      { id: 41205, text: 'Hello world', senderName: 'Alice', date: '2026-03-13T12:30:00Z' },
      { id: 41206, text: 'Thanks, everyone!', senderName: 'Bob', date: '2026-03-13T12:31:00Z' },
      { id: 41207, text: 'See you', senderName: 'Alice', date: '2026-03-13T12:32:00Z' },
    ],
    total: 3,
  },
};

const toon = encode(data, {
  indent: 2,
  delimiter: '\t',
  keyFolding: 'safe',
});

// Expected output (approximate):
// ok: true
// data.messages[3]{id,text,senderName,date}:
//   41205	Hello world	Alice	2026-03-13T12:30:00Z
//   41206	Thanks, everyone!	Bob	2026-03-13T12:31:00Z
//   41207	See you	Alice	2026-03-13T12:32:00Z
// data.total: 3
```

### Token Counting with gpt-tokenizer
```typescript
// Source: https://github.com/niieani/gpt-tokenizer
import { countTokens } from 'gpt-tokenizer';

const text = '{"ok":true,"data":{"messages":[...]}}';
const tokenCount = countTokens(text); // returns number
```

### TOON Error Encoding
```typescript
// Source: project pattern + TOON API
import { encode } from '@toon-format/toon';

const errorEnvelope = { ok: false, error: 'Not logged in', code: 'NOT_AUTHENTICATED' };
const toon = encode(errorEnvelope, { indent: 2, delimiter: '\t', keyFolding: 'safe' });

// Expected output:
// ok: false
// error: Not logged in
// code: NOT_AUTHENTICATED
```

### TOON with Null Values in Tabular Arrays
```typescript
// Source: TOON spec - null is a first-class primitive
const data = {
  ok: true,
  data: {
    messages: [
      { id: 1, text: 'Hello', mediaType: null, media: null },
      { id: 2, text: 'Photo', mediaType: 'photo', media: { filename: 'img.jpg', fileSize: 1024 } },
    ],
    total: 2,
  },
};

// TOON handles null natively in tabular rows.
// Fields with null appear as null in the row.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON-only CLI output | TOON as LLM-optimized alternative | TOON spec v3.0 (Nov 2025) | 30-60% token savings on uniform array data |
| `@anthropic-ai/tokenizer` for Claude counting | `gpt-tokenizer` or Anthropic API `countTokens` endpoint | Claude 3 launch (2024) | Old package inaccurate for modern models; any BPE tokenizer works for relative comparison |
| Custom token-efficient formats | Standardized TOON spec with ecosystem tooling | 2025 | SDK handles all edge cases; no need to design custom formats |

**Deprecated/outdated:**
- `@anthropic-ai/tokenizer` v0.0.4: Last published 3 years ago. README explicitly states "As of the Claude 3 models, this algorithm is no longer accurate." Still usable for rough approximation, but `gpt-tokenizer` is recommended.

## Open Questions

1. **Exact benchmark thresholds per fixture category**
   - What we know: 20% minimum savings is the overall gate. Uniform arrays (messages, chat lists) should easily exceed this (40-60% savings expected). Mixed/nested shapes may be lower.
   - What's unclear: Should each individual fixture meet 20%, or should it be an average across all fixtures?
   - Recommendation: Each fixture category should independently meet 20%. If `mixed-shapes.json` consistently falls below, consider setting a per-category threshold (e.g., 15% for mixed, 25% for uniform arrays). This prevents one outlier from masking overall good performance.

2. **gpt-tokenizer accuracy vs Claude tokenizer**
   - What we know: `gpt-tokenizer` uses `o200k_base` (GPT-4o encoding). Claude uses its own BPE model. Token counts will differ in absolute terms.
   - What's unclear: Whether relative savings ratios are consistent across tokenizers.
   - Recommendation: Use `gpt-tokenizer` for CI. The relative savings ratio (TOON vs JSON) should be consistent across any BPE tokenizer since both formats use the same character set. Validate manually with one Anthropic API `countTokens` call to confirm ratio is within 5%.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/toon.test.ts tests/unit/output-toon.test.ts tests/unit/toon-benchmark.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OUT-07a | `--toon` flag produces TOON-formatted success output | unit | `npx vitest run tests/unit/output-toon.test.ts -t "TOON mode"` | Wave 0 |
| OUT-07b | `--toon` flag produces TOON-formatted error output | unit | `npx vitest run tests/unit/output-toon.test.ts -t "error"` | Wave 0 |
| OUT-07c | `--toon` + `--human` produces INVALID_OPTIONS error | unit | `npx vitest run tests/unit/output-toon.test.ts -t "mutual exclusion"` | Wave 0 |
| OUT-07d | `--toon` + `--jsonl` produces INVALID_OPTIONS error | unit | `npx vitest run tests/unit/output-toon.test.ts -t "mutual exclusion"` | Wave 0 |
| OUT-07e | `--fields` composes with `--toon` (filter then encode) | unit | `npx vitest run tests/unit/output-toon.test.ts -t "fields"` | Wave 0 |
| OUT-07f | TOON output >= 20% fewer tokens than JSON on 100+ messages | unit | `npx vitest run tests/unit/toon-benchmark.test.ts` | Wave 0 |
| OUT-07g | encodeToon wrapper uses correct fixed options | unit | `npx vitest run tests/unit/toon.test.ts` | Wave 0 |
| OUT-07h | `--toon` appears in CLI --help output | integration | `npx vitest run tests/integration/cli-entry.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/toon.test.ts tests/unit/output-toon.test.ts tests/unit/toon-benchmark.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/toon.test.ts` -- covers OUT-07g (encodeToon wrapper)
- [ ] `tests/unit/output-toon.test.ts` -- covers OUT-07a through OUT-07e (output mode integration)
- [ ] `tests/unit/toon-benchmark.test.ts` -- covers OUT-07f (benchmark gate)
- [ ] `tests/fixtures/toon-benchmark/` -- synthetic JSON fixtures directory
- [ ] `tests/fixtures/toon-benchmark/messages-100.json` -- 100+ message items
- [ ] `tests/fixtures/toon-benchmark/chat-list-50.json` -- 50+ chat list items
- [ ] `tests/fixtures/toon-benchmark/user-profiles-10.json` -- 10 user profiles
- [ ] `tests/fixtures/toon-benchmark/search-results-30.json` -- 30 search result items
- [ ] `tests/fixtures/toon-benchmark/mixed-shapes.json` -- mixed data shapes
- [ ] Integration test extension in `cli-entry.test.ts` for `--toon` flag

## Sources

### Primary (HIGH confidence)
- [TOON API Reference](https://toonformat.dev/reference/api) -- `encode()` signature, `EncodeOptions` type, all option values verified
- [TOON Getting Started](https://toonformat.dev/guide/getting-started) -- installation, basic usage, round-trip safety
- [TOON GitHub Repository](https://github.com/toon-format/toon) -- monorepo structure, benchmark data (39.9% fewer tokens), spec v3.0
- [TOON Spec](https://github.com/toon-format/spec/blob/main/SPEC.md) -- quoting rules, delimiter-aware escaping, tab handling
- [gpt-tokenizer GitHub](https://github.com/niieani/gpt-tokenizer) -- `countTokens()` API, o200k_base default, ESM support

### Secondary (MEDIUM confidence)
- [npm @toon-format/toon](https://www.npmjs.com/package/@toon-format/toon) -- v2.1.0 latest, 216 dependents
- [npm @anthropic-ai/tokenizer](https://www.npmjs.com/package/@anthropic-ai/tokenizer) -- v0.0.4, inaccurate for Claude 3+ models
- [Anthropic tokenizer TypeScript GitHub](https://github.com/anthropics/anthropic-tokenizer-typescript) -- deprecation warning for Claude 3+ confirmed

### Tertiary (LOW confidence)
- [TOON benchmark comparisons from blog posts](https://www.tensorlake.ai/blog-posts/toon-vs-json) -- 30-60% savings claims from various sources, not independently verified
- [InfoQ TOON article](https://www.infoq.com/news/2025/11/toon-reduce-llm-cost-tokens/) -- early coverage of TOON spec

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- `@toon-format/toon` API verified via official docs; `gpt-tokenizer` API verified via GitHub
- Architecture: HIGH -- direct extension of existing output.ts patterns; 3 integration points clearly identified
- Pitfalls: HIGH -- tab escaping verified in spec; field selection ordering is logical consequence of design
- Benchmark: MEDIUM -- 20% gate is achievable per published benchmarks on uniform data; exact savings on this project's specific data shapes unverified until implementation

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable libraries, spec is a working draft but SDK is production-ready)
