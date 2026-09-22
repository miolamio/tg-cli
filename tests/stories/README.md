# User stories and acceptance

Every change starts with a Lific card. The card states the user outcome; scenarios
state **Given / When / Then** and how to verify it. This applies to code, bugfixes,
documentation, tooling, and releases. A bugfix must reproduce the reported failure.
Use the existing card rather than creating a duplicate.

The executable [catalog](catalog.json) maps each automated scenario to exact
Vitest file/test names. It currently covers recent daemon, diagnostics, WSS,
login, branding, release, and API-credential work. It is not a claim that every
older review finding or every Telegram operation has full acceptance coverage.
When changing older behavior, extend its existing card and this catalog first.

## Run

```bash
npm run test:stories
npm run test:acceptance
```

Both commands execute the bound test files. The first exits successfully only
when the automated scenarios pass; it still prints **INCOMPLETE** when manual
acceptance is pending. The second also requires all manual scenarios to pass for
the current candidate. Neither command connects to Telegram or sends messages.
The real-terminal login regression uses Python 3's standard-library PTY on
macOS/Linux and a temporary profile without credentials. Missing Python is an
error, not a skipped success.

Reports are written to a fresh `.development/stories-<time>-<pid>/` directory:
`results.json` contains per-scenario status and a candidate content fingerprint;
`vitest.json` and `test.log` retain the underlying run. A missing/renamed test,
skipped assertion, duplicate test name, or failing suite cannot pass its story.
CI uploads these reports separately for each Node version.

## Manual acceptance

Run the exact procedure in the card/catalog on the required environment. A TCP
probe, auth-key handshake, `pong`, or subscription acknowledgement is evidence
only for that step. Full login requires visible input, authorization, persistence,
and a successful subsequent check. Live watch requires an actual received event.
Use controlled profiles and previously authorized actions; never send test
messages to other people without explicit authorization.

After a successful manual check, record it in the Lific card and in local
`.development/story-acceptance.json`. Copy the candidate fingerprint from the
current report. For example (placeholders are not accepted evidence):

```json
{
  "candidate": "<fingerprint from the current report>",
  "scenarios": {
    "TG-57/complete-login": {
      "status": "passed",
      "checkedAt": "<actual ISO timestamp>",
      "environment": "<OS, Node, package version, affected network>",
      "evidence": "<sanitized report path or Lific evidence link>"
    }
  }
}
```

The gate validates completeness and candidate freshness; a human is responsible
for the truth of manual evidence. Never copy historical passes to a new candidate
or manufacture a pass to make the command green. Source, test, catalog, script,
package, or workflow changes invalidate the fingerprint. Keep phone numbers,
codes, passwords, API hashes, sessions, private IDs and message contents out of
all reports. Store only assertions, aggregate timings, and sanitized errors.

## Card template and completion

```markdown
## User story
As <user>, I want <action>, so that <observable outcome>.

## Acceptance scenarios
- ID: TG-N/scenario
- Given: ...
- When: ...
- Then: ...
- Verification: exact automated test name or repeatable manual procedure.
- Result: NOT RUN / PASS / FAIL, revision/version, environment, command, evidence.

## Release and limitations
Target version, known gaps, affected-machine requirements, and linked cards.
```

Keep the card active until every required scenario has evidence. A new open card
may track additional scope, but must not erase a failed acceptance criterion from
an existing card. Record exceptions only when explicitly authorized by the user;
a routine request to publish is not an exception to verification requirements.
Before release, require acceptance, typecheck, build, an isolated package install,
and actually executed CI. After publication, verify registry version/hash/bytes
and the GitHub tag/release; these delivery checks do not prove successful login.

## Current gaps (2026-09-07)

| Card | Result and remaining acceptance |
| --- | --- |
| [TG-53](http://10.0.1.38:3456/TG/issues/TG-53) | Persistent command/API reads verified; real incoming watch delivery unconfirmed. |
| [TG-54](http://10.0.1.38:3456/TG/issues/TG-54) | Diagnostics and failed-connect behavior tested; this does not resolve a remote network failure. |
| [TG-55](http://10.0.1.38:3456/TG/issues/TG-55) | Process, story runner, negative gate tests, and real PTY regression. |
| [TG-56](http://10.0.1.38:3456/TG/issues/TG-56) | WSS implemented; full login on the affected machine unconfirmed. |
| [TG-57](http://10.0.1.38:3456/TG/issues/TG-57) | Phone prompt/option tested; complete remote login unconfirmed. |
| [TG-58](http://10.0.1.38:3456/TG/issues/TG-58) | Branding and clean output scenarios automated; README reviewed. |
| [TG-59](http://10.0.1.38:3456/TG/issues/TG-59) | Historical 0.5.1 publication verified; recheck every new package candidate. |
| [TG-60](http://10.0.1.38:3456/TG/issues/TG-60) | CI jobs never started because of GitHub billing lock. |
| [TG-61](http://10.0.1.38:3456/TG/issues/TG-61) | Own API-ID onboarding and a corresponding live login still need work. |
