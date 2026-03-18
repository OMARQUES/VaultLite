# VaultLite V1 Security Baseline

## Document status
- Status: accepted baseline
- Source of truth: `docs/plans/2026-03-14-vaultlite-v1-corrected-plan-v2.2.1.md`
- Related docs: `docs/THREAT_MODEL.md`, `docs/ARCHITECTURE.md`, `docs/adr/`

## Security invariants
1. The server never receives the master password in plaintext.
2. The server never receives decrypted vault payloads.
3. The server never receives decrypted attachment bytes.
4. The owner/admin cannot recover another user's vault.
5. A forgotten master password is not recoverable by the system.
6. Search is local-only.
7. Attachments are encrypted on the trusted client before upload.
8. Password rotation is atomic and versioned.
9. `remote authentication`, `local unlock`, and `session restoration` must remain separate concepts.
10. Browser session controls must be explicit before auth implementation.

## Authentication and session constraints
- Never send the master password in plaintext.
- Never store auth or session secrets in LocalStorage.
- Web sessions must be server-controlled and not readable by application JavaScript.
- Mutable browser requests must be protected against CSRF.
- Session identifiers must rotate on login, sensitive reauth, and password rotation.
- `session restoration` must not bypass `local unlock` policy.

## Account Kit constraints
Account Kit must not contain:
- master password
- any recovery secret that resets the master password
- admin tokens

Account Kit must:
- follow the versioned signed format defined in ADR 0007
- be strongly verifiable for authenticity and deployment binding
- remain scoped to onboarding, trusted-device bootstrap, and approved reissue flows

## Local storage constraints
- Allowed local state must be defined by ADR 0006.
- IndexedDB may hold only approved encrypted or non-sensitive local state.
- LocalStorage must not contain auth/session secrets or other forbidden state.
- Trusted local state must not persist `accountKey` or Account Kit payloads containing `accountKey`.
- Only encrypted `localUnlockEnvelope` is allowed for local unlock continuity.
- Auto-lock and secret wipe behavior are mandatory parts of the design.

## Runtime fail-closed constraints
- `VAULTLITE_RUNTIME_MODE` is mandatory and must be explicit (`development`, `test`, `production`).
- Production runtime must fail closed when bootstrap token posture is weak or default.
- Production runtime must fail closed when Account Kit signing keypair is missing.
- Production runtime must fail closed when distributed storage bindings are missing.

## Abuse-resistance constraints
- Authentication abuse limits are bounded to deterministic windows (`5 attempts / 5 minutes` for auth-critical paths).
- Rate-limited responses remain anti-enumeration safe.
- Successful authentication resets only scoped counters; IP burst counters are retained.

## Input size ceilings
- Vault item encrypted payload is capped at `256KB`.
- Attachment init declared size is capped at `25MB`.
- Attachment upload envelope request body is capped with explicit server-side cutoff.
- Upload validation must reject envelope metadata that does not match declared attachment size.

## Security header baseline
- API responses must emit baseline headers on success and error paths:
  - `content-security-policy`
  - `x-content-type-options`
  - `x-frame-options`
  - `referrer-policy`
  - `permissions-policy`
  - `cache-control: no-store`
- HSTS is applied only when runtime mode is `production` and configured `serverUrl` uses HTTPS.

## Search constraints
- Search is local-only.
- No server-side plaintext search.
- No blind-index search in V1.

## Attachment constraints
- Attachment encryption happens on the client before upload.
- Attachment lifecycle must follow the canonical states from ADR 0008.
- Upload and finalize steps must remain explicit and testable.

## User lifecycle constraints
- Lifecycle states must use canonical terms.
- `deprovisioned` is an operational lifecycle state, not a vault-recovery path.
- Owner/admin lifecycle authority never implies decryption authority over user vaults.

## Coding rules derived from security baseline
- Do not improvise auth flows.
- Do not move sensitive crypto logic to the server.
- Do not write recovery semantics that are not in scope.
- Do not mix security-sensitive vocabulary.
