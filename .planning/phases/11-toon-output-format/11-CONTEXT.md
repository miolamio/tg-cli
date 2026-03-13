# Phase 11: TOON Output Format - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `--toon` global flag for Token-Oriented Object Notation output — a token-efficient, LLM-optimized alternative to JSON. Uses the official TOON spec (v3.0) and `@toon-format/toon` TypeScript SDK. Mutually exclusive with `--human` and `--jsonl`. Composes with `--fields`. Must pass a benchmark gate of minimum 20% token savings over JSON on synthetic fixtures.

</domain>

<decisions>
## Implementation Decisions

### TOON SDK integration
- Use `@toon-format/toon` npm package — official TypeScript SDK with `encode(value, options?)` API
- No custom format design — follow the official TOON spec v3.0 exactly
- SDK handles all encoding rules: tabular arrays, YAML-like objects, string quoting, escaping, number normalization

### Encoder options
- **Delimiter:** Tab (`\t`) — best token savings since message text often contains commas, avoiding quoting overhead
- **Key folding:** Safe mode on (`keyFolding: 'safe'`) — collapses single-key wrapper chains (e.g., `data.messages` instead of nested `data:` → `messages:`)
- **Indent:** 2 spaces (spec default)
- Pass these as fixed options to `encode()` — no user-configurable TOON sub-options

### Envelope handling
- Encode the full `{ ok: true, data: ... }` envelope through TOON (not just the data payload)
- With key folding, `ok: true` stays top-level and `data.messages[N]{...}:` folds nicely
- Errors also render as TOON: `ok: false`, `error:`, `code:` — consistent format for both success and failure
- Single TOON document output (no streaming) — TOON's biggest win is the tabular format for arrays, splitting per-item would lose the header-once advantage

### Mutual exclusion
- `--toon` is mutually exclusive with both `--human` and `--jsonl`
- Four output modes: JSON (default), `--human`, `--toon`, `--jsonl` — pick exactly one
- Conflicting flags produce a clear `INVALID_OPTIONS` error (same pattern as existing `--jsonl` + `--human` check)

### Fields composition
- `--fields` works with `--toon`: filter first, then encode — apply `applyFieldSelection()` to JSON data, then pass filtered data to `encode()`
- Dot-notation paths work exactly as in JSON mode (e.g., `--fields id,text,media.filename`)
- Messages without a nested field get `null` in the TOON tabular row — TOON handles null natively
- No null stripping — pass data as-is to `encode()`, keeping behavior predictable and lossless

### Benchmark gate
- **Tokenizer:** Claude tokenizer (`@anthropic-ai/tokenizer` or equivalent)
- **Test data:** Synthetic fixtures checked into repo — 100+ messages with varied shapes, 50+ chat list items, 10 user profiles, 30 search results, mixed shapes
- **Gate:** CI test that asserts TOON output is ≥20% fewer tokens than equivalent JSON for each fixture
- **Enforcement:** Test failure blocks CI if token savings drop below threshold

### Claude's Discretion
- Exact synthetic fixture content (realistic message text, media metadata, poll data variations)
- Whether to use `@anthropic-ai/tokenizer` or an alternative Claude-compatible token counter
- How to wire the `--toon` flag into GlobalOptions and the preAction hook (follows existing pattern)
- TOON replacer usage (if any edge cases arise during implementation)

</decisions>

<specifics>
## Specific Ideas

- TOON spec v3.0 (2025-11-24, working draft) — official spec at github.com/toon-format/spec
- TypeScript SDK: `@toon-format/toon` on npm — `encode(value, options?)` is the only function needed
- Tab delimiter preview (what agents will see):
  ```
  ok: true
  data.messages[3	]{id	text	senderName	date}:
    41205	Hello world	Alice	2026-03-13T12:30:00Z
    41206	Thanks, everyone!	Bob	2026-03-13T12:31:00Z
    41207	See you	Alice	2026-03-13T12:32:00Z
  ```
- Primary consumer is Claude Code agents — TOON reduces context window usage for message history, search results, chat lists

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `output.ts`: Clean mode switching with `setOutputMode()`, `setJsonlMode()`, `setFieldSelection()` — add `setToonMode()` following same pattern
- `fields.ts`: `applyFieldSelection()` and `pickFields()` — reuse for pre-filtering data before TOON encoding
- `format.ts`: `formatData()` auto-dispatch — not needed for TOON (SDK handles all formatting), but the data shapes it handles are the same ones TOON will encode
- `types.ts`: `GlobalOptions` — add `toon?: boolean` alongside existing `jsonl?: boolean`

### Established Patterns
- Output mode priority in `outputSuccess()`: JSONL > human > JSON — add TOON as highest priority (TOON > JSONL > human > JSON)
- Mutual exclusion validated in `preAction` hook in `tg.ts` — extend with `--toon` checks
- Mode set via module-level variables (`_humanMode`, `_jsonlMode`) — add `_toonMode`

### Integration Points
- `src/bin/tg.ts`: Add `--toon` global option, extend preAction hook for mutual exclusion validation
- `src/lib/output.ts`: Add `setToonMode()`, extend `outputSuccess()` with TOON path, extend `outputError()` with TOON path
- `src/lib/types.ts`: Add `toon?: boolean` to GlobalOptions
- New dep: `@toon-format/toon` in package.json

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-toon-output-format*
*Context gathered: 2026-03-13*
