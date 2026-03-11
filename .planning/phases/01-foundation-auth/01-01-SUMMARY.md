---
phase: 01-foundation-auth
plan: 01
subsystem: infra
tags: [typescript, esm, tsup, vitest, conf, zod, commander, picocolors]

# Dependency graph
requires:
  - phase: none
    provides: greenfield project
provides:
  - "@miolamio/tg-cli npm package skeleton with ESM, TypeScript, build, test infra"
  - "Core library modules: types, output, errors, config, prompt"
  - "JSON output envelope pattern (stdout for data, stderr for status)"
  - "Credential resolution chain (env vars > config file)"
affects: [01-02, 01-03, all-phases]

# Tech tracking
tech-stack:
  added: [telegram, commander, zod, conf, picocolors, proper-lockfile, typescript, tsup, vitest]
  patterns: [json-envelope-stdout, stderr-status-logging, esm-module-type, conf-xdg-config, credential-resolution-chain]

key-files:
  created:
    - package.json
    - tsconfig.json
    - tsup.config.ts
    - vitest.config.ts
    - .gitignore
    - src/lib/types.ts
    - src/lib/output.ts
    - src/lib/errors.ts
    - src/lib/config.ts
    - src/lib/prompt.ts
    - tests/unit/output.test.ts
    - tests/unit/config.test.ts
  modified: []

key-decisions:
  - "ESM-only project (type: module) since conf v15 requires it"
  - "tsup bundles CLI with shebang banner, telegram kept external to avoid bundle bloat"
  - "No schema option in Conf constructor to avoid conf's JSON Schema validation issues with TypeScript generics"
  - "readline/promises writes prompts to stderr to keep stdout clean for JSON data"

patterns-established:
  - "JSON envelope pattern: outputSuccess/outputError write to stdout, logStatus writes to stderr"
  - "Credential resolution: env vars (TG_API_ID, TG_API_HASH) take priority over config file"
  - "Error class hierarchy: TgError base -> CredentialError, SessionError, FloodWaitError"
  - "TDD workflow: failing tests first, then minimal implementation"

requirements-completed: [INFRA-01, INFRA-04, INFRA-06, OUT-01, OUT-02, OUT-06]

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 1 Plan 1: Project Scaffolding & Core Libraries Summary

**ESM TypeScript CLI skeleton with tsup build, vitest tests, and 5 core library modules (types, output, errors, config, prompt) providing JSON envelope output and credential resolution**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T05:36:59Z
- **Completed:** 2026-03-11T05:41:15Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Scaffolded greenfield @miolamio/tg-cli ESM TypeScript project with all build and test infrastructure
- Implemented 5 core library modules that all subsequent plans depend on (types, output, errors, config, prompt)
- Established JSON envelope pattern: stdout for data (`{ok, data}` or `{ok, error, code?}`), stderr for status messages
- All 14 unit tests pass covering output envelope structure, stderr routing, quiet mode, and credential resolution

## Task Commits

Each task was committed atomically:

1. **Task 1: Project scaffolding and build infrastructure** - `4f368da` (feat)
2. **Task 2 RED: Failing tests for output and config** - `f1eca78` (test)
3. **Task 2 GREEN: Core library modules implementation** - `ab95d8b` (feat)

_Note: Task 2 used TDD with separate RED and GREEN commits._

## Files Created/Modified
- `package.json` - npm package definition with @miolamio/tg-cli name, ESM type, bin entries
- `tsconfig.json` - TypeScript config for ES2022, Node16 module resolution, strict mode
- `tsup.config.ts` - Build config with ESM output, shebang banner, telegram external
- `vitest.config.ts` - Test runner config for tests/**/*.test.ts with globals
- `.gitignore` - Ignores node_modules, dist, session files, env files
- `src/lib/types.ts` - GlobalOptions, ProfileData, TgConfig, OutputEnvelope types
- `src/lib/output.ts` - outputSuccess, outputError (stdout), logStatus (stderr)
- `src/lib/errors.ts` - TgError, CredentialError, SessionError, FloodWaitError, formatError
- `src/lib/config.ts` - createConfig (conf/XDG), resolveCredentials, getCredentialsOrThrow
- `src/lib/prompt.ts` - readline/promises wrapper with stderr output for prompts
- `tests/unit/output.test.ts` - 9 tests for JSON envelope structure and stderr routing
- `tests/unit/config.test.ts` - 5 tests for credential resolution (env, config, null, priority)

## Decisions Made
- Used ESM-only project (`"type": "module"`) since conf v15 requires it; ESM can import CJS packages (telegram/gramjs)
- Kept `telegram` as external in tsup config to avoid bundling the large gramjs library
- Omitted `schema` option from Conf constructor -- conf's JSON Schema validation is separate from TypeScript type safety and adds complexity without value here
- readline/promises prompts write to stderr, keeping stdout exclusively for JSON data output

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All core library modules are ready for consumption by Plan 02 (session store, client wrapper, auth commands)
- Build infrastructure (tsup) is configured but not yet tested with actual entry point (Plan 03 creates src/bin/tg.ts)
- Test infrastructure (vitest) is proven working with 14 passing tests

---
*Phase: 01-foundation-auth*
*Completed: 2026-03-11*
