---
status: diagnosed
trigger: "tg chat list returns empty chats: [] despite total: 83"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - gramjs has inverted logic in ignoreMigrated filter
test: Code reading of dialogs.js lines 132-135
expecting: When ignoreMigrated=true, migrated chats should be EXCLUDED
next_action: Return diagnosis

## Symptoms

expected: `tg chat list` returns 83 chats matching the `total: 83`
actual: Returns `chats: []` with `total: 83`
errors: None (silent data loss)
reproduction: Run `tg chat list` with default options
started: Since ignoreMigrated: true was added to getDialogs call

## Eliminated

(none needed - root cause found on first hypothesis)

## Evidence

- timestamp: 2026-03-11T00:01:00Z
  checked: src/commands/chat/list.ts line 37
  found: getDialogs called with `ignoreMigrated: true`
  implication: This flag is passed to gramjs iterator

- timestamp: 2026-03-11T00:02:00Z
  checked: node_modules/telegram/client/dialogs.js lines 132-135
  found: >
    Filter logic reads:
    ```
    if (!this.ignoreMigrated ||
        (cd.entity != undefined && "migratedTo" in cd.entity)) {
        this.buffer.push(cd);
    }
    ```
    When ignoreMigrated=true: `!true = false`, so first branch is false.
    Then it checks `"migratedTo" in cd.entity` - only MIGRATED chats pass.
    This means: when ignoreMigrated=true, ONLY migrated chats are kept (inverted).
    Since most chats are NOT migrated, almost nothing passes the filter -> empty array.
  implication: This is a confirmed bug in gramjs - the boolean logic is inverted

- timestamp: 2026-03-11T00:03:00Z
  checked: gramjs Dialog constructor (dialog.js custom)
  found: entity is set from entities map via getPeerId. "migratedTo" is a property on Chat objects that have been migrated to supergroups.
  implication: Normal chats/supergroups/channels do NOT have migratedTo, so they are all filtered OUT when ignoreMigrated=true

- timestamp: 2026-03-11T00:04:00Z
  checked: Upstream gramjs master (github.com/gram-js/gramjs/blob/master/gramjs/client/dialogs.ts lines 164-167)
  found: Same inverted logic exists in current upstream master. Bug is NOT fixed in any version.
  implication: This is an existing upstream bug, not a version regression

- timestamp: 2026-03-11T00:05:00Z
  checked: Telethon (Python original, github.com/LonamiWebs/Telethon/blob/v1/telethon/client/dialogs.py lines 90-91)
  found: >
    Telethon has: `if not self.ignore_migrated or getattr(cd.entity, 'migrated_to', None) is None`
    gramjs has:   `if (!this.ignoreMigrated || (cd.entity != undefined && "migratedTo" in cd.entity))`
    The second clause is INVERTED in gramjs.
    Telethon checks `migrated_to is None` (entity is NOT migrated -> keep it).
    gramjs checks `"migratedTo" in cd.entity` (entity IS migrated -> keep it).
  implication: >
    Confirmed port bug. When porting from Python to JS, the condition was inverted.
    Telethon: keep if NOT migrated. gramjs: keep if IS migrated. Exact opposite.

## Resolution

root_cause: >
  UPSTREAM gramjs bug (port error from Telethon Python -> JS).
  File: `node_modules/telegram/client/dialogs.js` lines 132-135
  Upstream: `gramjs/client/dialogs.ts` lines 164-167

  The boolean condition is INVERTED compared to the original Telethon source.

  Telethon (CORRECT):
    `if not self.ignore_migrated or getattr(cd.entity, 'migrated_to', None) is None:`
    -> Keep dialog if: ignoring is off, OR entity is NOT migrated

  gramjs (BUGGY):
    `if (!this.ignoreMigrated || (cd.entity != undefined && "migratedTo" in cd.entity))`
    -> Keep dialog if: ignoring is off, OR entity IS migrated (INVERTED!)

  When ignoreMigrated=true:
  - All NON-migrated chats (vast majority) are DROPPED
  - Only MIGRATED chats are KEPT
  - Result: empty or near-empty array, while total reflects true count

  The correct gramjs code should be:
  ```
  if (!this.ignoreMigrated ||
      (cd.entity != undefined && !("migratedTo" in cd.entity))) {
      this.buffer.push(cd);
  }
  ```
  (Note the added `!` before the `"migratedTo" in cd.entity` check)

fix: (not applied - diagnosis only)
verification: (not applied - diagnosis only)
files_changed: []
