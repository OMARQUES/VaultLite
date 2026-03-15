# VaultLite V1 Threat Model

## Document status
- Status: initial design gate
- Source of truth: `docs/plans/2026-03-14-vaultlite-v1-corrected-plan-v2.2.1.md`
- Related docs: `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/adr/`

## System assumptions
- The server is honest-but-curious at best and must be treated as unable to decrypt vault contents.
- The deployment owner may have operational authority but must not gain cryptographic access to user vault contents.
- Trusted devices may be lost, stolen, or partially compromised.
- Browser storage may leak if the local storage policy is weak.

## Assets to protect
- master password
- derived key material and vault encryption material
- Account Key
- Account Kit contents
- encrypted vault payloads
- encrypted attachment blobs
- active server sessions
- trusted-device local state

## Threats and required design response

### Malicious or curious server operator
- Risk: reads stored metadata, sessions, and encrypted payloads.
- Required response: zero-knowledge storage, no plaintext vault or attachment data, explicit operational-only admin authority.

### Stolen trusted device
- Risk: attacker gains local device access.
- Required response: explicit local storage policy, auto-lock, memory wipe behavior, trusted-device boundaries, revocation support.

### Stolen Account Kit
- Risk: bootstrap artifact is exposed.
- Required response: Account Kit must be signed, versioned, deployment-bound, and insufficient by itself to recover the vault without the other approved bootstrap inputs.

### Stolen master password without Account Key or trusted-device state
- Risk: credential-only theft.
- Required response: auth protocol and verifier design must not expose vault plaintext and must keep new-device bootstrap distinct from routine trusted-device flows.

### Stolen Account Kit without master password
- Risk: attacker attempts bootstrap with incomplete material.
- Required response: bootstrap requires the approved combination of inputs, and Account Kit must not become a password reset mechanism.

### Tampered Account Kit or bootstrap artifact substitution
- Risk: attacker swaps URL, fingerprint, or bootstrap contents.
- Required response: strong authenticity verification, canonical serialization, version checks, fail-closed import behavior.

### Browser compromise or XSS-capable client bug
- Risk: attacker gains script-level access to the app runtime.
- Required response: CSP baseline, secure session posture, no auth or session secrets in LocalStorage, minimize sensitive in-memory lifetime.

### Local storage leakage
- Risk: unintended local persistence of sensitive state.
- Required response: allowlist-based local storage policy, explicit prohibitions, wipe behavior, and lock-state rules.

### Auth endpoint abuse and guessing pressure
- Risk: brute force, credential stuffing, or user enumeration.
- Required response: rate limiting, generic failure behavior, anti-enumeration posture, explicit session model.

### Cookie theft, session fixation, and CSRF
- Risk: session misuse in the browser surface.
- Required response: server-controlled sessions, rotation points, SameSite or CSRF policy, fixation mitigation, explicit revocation rules.

### Sync conflict and deletion safety failures
- Risk: data loss, ghost items, or undeclared conflict behavior.
- Required response: deterministic sync conflict policy, tombstones, explicit revision handling.

### Malicious attachment files or partial upload states
- Risk: unsafe blob handling, orphaned objects, storage abuse.
- Required response: client-side encryption, explicit `pending` to attached flow, cleanup policy, quota handling.

### Admin misuse within operational limits
- Risk: operator overreach through lifecycle or config powers.
- Required response: operational controls remain separate from cryptographic access; lifecycle states never bypass user vault isolation.

## Trust-boundary conclusions
- vault plaintext exists only on the trusted client
- attachment plaintext exists only on the trusted client
- Account Kit is bootstrap-critical and must be authenticated strongly
- session security is part of the design gate, not release-only polish
- lifecycle operations are security-relevant because they affect sessions and trusted devices
