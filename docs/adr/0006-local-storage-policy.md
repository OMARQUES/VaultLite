# ADR 0006: Local Storage Policy

- Status: Accepted
- Date: 2026-03-15

## Context
Trusted-device usability requires some local state, but local persistence is also a major attack surface.

## Decision
- IndexedDB may store only explicitly approved encrypted or low-sensitivity local state.
- LocalStorage must not contain auth or session secrets.
- Auto-lock and local invalidation rules are mandatory.
- `session restoration` must respect local unlock policy.
- The web app must ship with a CSP baseline and browser security headers defined before production use.

## Required rules
- define allowed IndexedDB state
- define forbidden local state
- define auto-lock timer behavior
- define in-memory wipe expectations
- define session restoration boundaries
- define minimum browser security headers

## Consequences
- Web cache and unlock flows depend on this ADR.
- Extension and web storage code must enforce allowlist-based persistence.
