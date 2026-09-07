# Changelog

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
