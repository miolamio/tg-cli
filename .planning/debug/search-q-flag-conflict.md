---
status: diagnosed
trigger: "tg message search -q keyword fails with required option not specified"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - global -q/--quiet shadows local -q/--query
test: code review of option definitions
expecting: Commander resolves -q to global --quiet, leaving --query unset
next_action: return diagnosis

## Symptoms

expected: `tg message search -q "keyword"` should search messages for "keyword"
actual: Fails with `error: required option '-q, --query <text>' not specified`
errors: `error: required option '-q, --query <text>' not specified`
reproduction: Run `tg message search -q "test"` vs `tg message search --query "test"`
started: Since search command was added (inherent design conflict)

## Eliminated

(none needed - first hypothesis confirmed)

## Evidence

- timestamp: 2026-03-11T00:00:00Z
  checked: src/bin/tg.ts line 44
  found: Global option defined as `-q, --quiet` on root program
  implication: -q is claimed globally by the root Command

- timestamp: 2026-03-11T00:00:00Z
  checked: src/commands/message/index.ts line 30
  found: Search subcommand defines `.requiredOption('-q, --query <text>', ...)`
  implication: Local -q conflicts with global -q; Commander resolves -q to global --quiet

- timestamp: 2026-03-11T00:00:00Z
  checked: Commander behavior (known)
  found: Commander propagates global options. When -q is used on a subcommand, it matches the global -q/--quiet first. The value "keyword" is consumed as --quiet's argument (or discarded since quiet is boolean). --query remains unset, triggering requiredOption error.
  implication: Root cause confirmed

## Resolution

root_cause: |
  Short flag collision between global `-q, --quiet` (src/bin/tg.ts:44) and
  local `-q, --query <text>` (src/commands/message/index.ts:30). Commander
  resolves `-q` at the global level first, setting `quiet = true` and never
  populating `query`. Since `--query` uses `requiredOption()`, Commander
  throws the "required option not specified" error.
fix: (research only - not applied)
verification: (research only)
files_changed: []
