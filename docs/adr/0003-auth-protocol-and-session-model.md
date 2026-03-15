# ADR 0003: Auth Protocol and Session Model

- Status: Accepted
- Date: 2026-03-15

## Context
The project repeatedly risked mixing trusted-device unlock, remote auth, and bootstrap behavior. The browser session model also needs explicit rules before implementation.

## Decision
- `remote authentication`, `local unlock`, and `session restoration` are separate concepts.
- Account Key does not participate in routine trusted-device login when a server session must be refreshed.
- Trusted device with valid session: use `local unlock` only.
- Trusted device with expired or revoked session: require `remote authentication` with username + master password, then `local unlock` if needed.
- New device bootstrap: use the approved combination of server URL, username, master password, Account Key, or Account Kit import.
- Web uses server-controlled sessions that are not readable by application JavaScript.
- No auth or session secrets are stored in LocalStorage.
- Mutable browser requests require CSRF protection.
- Session identifiers rotate on login, sensitive reauth, and password rotation.

## Consequences
- The codebase must not use ambiguous labels such as generic `login` when the exact auth state matters.
- API and web contracts must encode the different state transitions explicitly.
- Session middleware is a design prerequisite, not final hardening.
