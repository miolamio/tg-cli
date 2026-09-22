# Changelog

## Unreleased

- Add `session import-desktop <tdata>` to reuse a selected official Desktop
  authorization in a new CLI profile without requesting another login code.
  Multiple accounts require `--account INDEX`; `--ask-passcode` reads a local
  Desktop passcode privately. The source files remain unchanged.
- Verify the selected identity online before saving; require closed source
  clients and check existing CLI profiles for duplicate keys. Save the Desktop
  preset and selected transport, and warn about later environment overrides.
- Keep config files private across subsequent writes. Add TG-63 user-story
  tests with synthetic Desktop storage fixtures.
- Add the TG-55 story acceptance catalog, negative gate tests, real-terminal
  login regression and CI evidence reports. Pending manual scenarios remain
  pending; these changes do not establish completion of code-based WSS login.

## 0.5.1 — 2026-09-07

- Ask for the phone number before networking during login and accept it through
  `auth login --phone` in international format.
- Pause the client's diagnostics while reading login input, restoring them
  afterward so verbose keepalive logs cannot overwrite the code/2FA prompt.

## 0.5.0 — 2026-09-07

- Add `--transport tcp|wss` for login, direct commands, session verification,
  and the daemon. Successful login/import remembers the choice per profile;
  existing profiles keep TCP by default.
- Route WSS through official Telegram DC domains over TLS, including DC
  migration and media connections, without rewriting saved session addresses.
- Bound and cancel pending WSS upgrades, retain safe transport diagnostics,
  and report the active transport in daemon status.

## 0.4.0 — 2026-09-07

- Add the little daemon mascot to interactive login, root help and the README.
  Respect terminal detection, `--quiet`, `NO_COLOR` and `TERM=dumb`; keep
  command data on stdout free of decorative output.
- Preserve safe transport error categories and codes before gramjs discards
  the underlying receive failure. Report diagnostics on stderr for login,
  direct commands and daemon connections, without exposing raw SDK errors,
  protocol payloads or session material.
- Return `CONNECTION_FAILED` when gramjs exhausts its connection retries.
  Login stops before requesting authorization or saving a session, direct
  commands stop before their action, and a daemon does not report readiness
  with a failed connection. Existing connected clients remain supported.
- Document connection troubleshooting and restarting the daemon after an
  upgrade. The reported login failure on another machine still needs
  verification there; this release does not claim to fix its network cause.

## 0.3.0 — 2026-09-07

- Execute 35 chat, message, media, user and contact operations through a
  persistent daemon with `--daemon` or the public `DaemonClient.execute` API.
- Support `--idle-timeout 0`, live-message subscriptions and concurrent
  requests with separate output, stdin, working directories and deadlines.
- Harden session ownership, shutdown, authentication, input validation,
  contact/message search, serialization and partial error reporting.
- Publish the ESM library API with TypeScript declarations and build the
  package automatically before packing or publishing.
