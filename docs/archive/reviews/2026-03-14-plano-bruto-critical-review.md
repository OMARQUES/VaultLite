# PlanoBruto Critical Review

Scope reviewed:
- `PlanoBruto.txt`

Summary:
- The raw document is a good product and backlog sketch.
- It is not implementation-ready yet.
- The main weaknesses are not missing features; they are missing security and architecture decisions that would force rework later.

## Findings

### 1. Blocker: "self-hosted" conflicts with a Cloudflare-only backend

References:
- `PlanoBruto.txt:7`
- `PlanoBruto.txt:105`
- `PlanoBruto.txt:118`
- `PlanoBruto.txt:119`
- `PlanoBruto.txt:120`
- `PlanoBruto.txt:493`

Why this matters:
- The product is positioned as self-hosted, but the proposed stack is Cloudflare Workers plus D1 plus R2.
- That is a platform dependency, not a neutral self-hosted architecture.
- If portability is a product promise, storage and runtime need an abstraction boundary from day one.

Correction:
- Decide whether VaultLite is:
  - Cloudflare-first and not truly self-hosted, or
  - portable/self-hosted with Cloudflare as one deployment target.

### 2. Blocker: authentication is under-specified and vulnerable to ad hoc design

References:
- `PlanoBruto.txt:176`
- `PlanoBruto.txt:206`
- `PlanoBruto.txt:207`
- `PlanoBruto.txt:539`
- `PlanoBruto.txt:555`
- `PlanoBruto.txt:560`

Why this matters:
- The plan uses `auth_verifier`, but does not define the verifier protocol.
- Without a defined protocol, implementation teams tend to invent an unsafe login scheme.
- The document never states how the server verifies a login without receiving the master password or a reusable equivalent.

Correction:
- Freeze the auth protocol in an ADR before any code.
- Version the verifier format and KDF parameters from the start.

### 3. Blocker: the crypto model is too vague for a zero-knowledge product

References:
- `PlanoBruto.txt:25`
- `PlanoBruto.txt:30`
- `PlanoBruto.txt:402`
- `PlanoBruto.txt:403`
- `PlanoBruto.txt:404`
- `PlanoBruto.txt:405`
- `PlanoBruto.txt:406`

Why this matters:
- The plan says "do not invent crypto", but still leaves the actual design open.
- There is no fixed KDF, envelope version, nonce strategy, key separation rule, or test-vector requirement.
- That is a direct path to incompatible clients or accidental crypto debt.

Correction:
- Define the crypto profile before implementation.
- Add test vectors and versioned ciphertext envelopes as non-negotiable requirements.

### 4. High: sync is specified as "merge simples por revision", which is not enough

References:
- `PlanoBruto.txt:780`
- `PlanoBruto.txt:781`
- `PlanoBruto.txt:782`
- `PlanoBruto.txt:783`
- `PlanoBruto.txt:787`
- `PlanoBruto.txt:788`

Why this matters:
- A password vault is write-heavy on small records across devices.
- "simple merge by revision" is where silent data loss starts.
- The plan does not define tombstones, optimistic concurrency, or deterministic conflict handling.

Correction:
- Add conflict rules, deletion semantics, and per-item versioning before sync work starts.

### 5. High: search and tags conflict with encrypted storage as written

References:
- `PlanoBruto.txt:181`
- `PlanoBruto.txt:236`
- `PlanoBruto.txt:246`
- `PlanoBruto.txt:667`
- `PlanoBruto.txt:675`

Why this matters:
- The model stores encrypted metadata and encrypted payloads.
- The backlog still asks for search and tags, but does not define what is searchable or where indexing lives.
- If this is not decided early, the team will either leak metadata or rebuild search later.

Correction:
- Choose one search model explicitly:
  - local-only decrypted index
  - metadata-only search
  - blind indexes with accepted leakage

### 6. High: local secret handling is missing

References:
- `PlanoBruto.txt:585`
- `PlanoBruto.txt:592`
- `PlanoBruto.txt:625`
- `PlanoBruto.txt:626`
- `PlanoBruto.txt:631`

Why this matters:
- The web app must cache something to remain usable.
- The plan never defines what may live in memory, IndexedDB, LocalStorage, or extension storage.
- There is no auto-lock, secret wipe, session restore, or device trust policy written down.

Correction:
- Add a local storage policy and inactivity lock policy before the first UI auth implementation.

### 7. High: Account Kit is a single-point secret but its format and lifecycle are undefined

References:
- `PlanoBruto.txt:28`
- `PlanoBruto.txt:175`
- `PlanoBruto.txt:277`
- `PlanoBruto.txt:470`
- `PlanoBruto.txt:482`
- `PlanoBruto.txt:483`

Why this matters:
- The Account Kit becomes critical for new-device bootstrap.
- The document says what it contains, but not how it is protected, rotated, revoked, or reissued.
- A leaked Account Kit changes the threat model materially.

Correction:
- Specify Account Kit format, storage guidance, regeneration flow, and breach impact.

### 8. High: attachment security and operational limits are incomplete

References:
- `PlanoBruto.txt:705`
- `PlanoBruto.txt:711`
- `PlanoBruto.txt:713`
- `PlanoBruto.txt:724`
- `PlanoBruto.txt:725`
- `PlanoBruto.txt:864`

Why this matters:
- Attachment encryption alone is not enough.
- The plan omits size limits, quota enforcement, deletion guarantees, retry behavior, and upload abuse handling.
- Backup/export semantics for encrypted blobs are also not defined.

Correction:
- Add attachment lifecycle rules, limits, and backup packaging rules before implementation.

### 9. High: password rotation needs atomicity and versioning, not only "session + current password"

References:
- `PlanoBruto.txt:21`
- `PlanoBruto.txt:816`
- `PlanoBruto.txt:821`
- `PlanoBruto.txt:822`
- `PlanoBruto.txt:829`

Why this matters:
- Changing a master password changes verifier state and encrypted key material.
- If the operation is interrupted mid-flight, the user can lose access.
- The raw plan does not require atomic updates, rollback behavior, or versioned re-encryption.

Correction:
- Add a password-rotation ADR and implementation invariants before coding the feature.

### 10. Medium: operator concerns for a self-hosted product are mostly absent

References:
- `PlanoBruto.txt:7`
- `PlanoBruto.txt:153`
- `PlanoBruto.txt:164`
- `PlanoBruto.txt:315`
- `PlanoBruto.txt:316`
- `PlanoBruto.txt:317`
- `PlanoBruto.txt:318`

Why this matters:
- Self-hosted products live or die on backup, restore, secrets management, and migration safety.
- The document describes product features but not operator workflows.

Correction:
- Add `OPERATIONS.md`, backup strategy, restore drills, and environment validation requirements.

### 11. Medium: invite authority and account administration are not defined

References:
- `PlanoBruto.txt:172`
- `PlanoBruto.txt:223`
- `PlanoBruto.txt:230`
- `PlanoBruto.txt:517`

Why this matters:
- Someone has to mint invites.
- The plan never defines who that actor is, how the first admin exists, or whether this is single-tenant or multi-tenant.

Correction:
- Decide whether invites are:
  - local bootstrap only
  - admin-generated
  - tenant-scoped

### 12. Medium: extension scope is still too ambitious for the maturity level of the core

References:
- `PlanoBruto.txt:11`
- `PlanoBruto.txt:288`
- `PlanoBruto.txt:292`
- `PlanoBruto.txt:293`
- `PlanoBruto.txt:294`
- `PlanoBruto.txt:876`
- `PlanoBruto.txt:896`
- `PlanoBruto.txt:909`

Why this matters:
- Browser extension autofill is security-sensitive and browser-specific.
- Shipping it too early multiplies auth, storage, and UX complexity before the core vault is stable.

Correction:
- Reduce V1 extension scope to unlock plus manual fill after web parity exists.

### 13. Medium: abuse prevention and web security controls are not called out

References:
- `PlanoBruto.txt:510`
- `PlanoBruto.txt:524`
- `PlanoBruto.txt:552`
- `PlanoBruto.txt:567`

Why this matters:
- The auth backlog mentions clear errors and no token storage in clear, but not:
  - rate limiting
  - anti-enumeration
  - CSRF strategy
  - CSP
  - XSS hardening
  - session fixation controls

Correction:
- Add explicit security acceptance criteria for every auth and session task.

### 14. Medium: test strategy is broad, but not deep enough for this risk profile

References:
- `PlanoBruto.txt:357`
- `PlanoBruto.txt:420`
- `PlanoBruto.txt:727`
- `PlanoBruto.txt:954`
- `PlanoBruto.txt:957`

Why this matters:
- The document asks for tests, but not for:
  - crypto test vectors
  - multi-device sync tests
  - migration tests
  - security regression tests
  - extension browser matrix tests

Correction:
- Define a release checklist and required test layers up front.

## Recommended Changes Adopted In The New Plan

1. Added ADR gates before code.
2. Moved browser extension behind web-core stability.
3. Added local secret handling and auto-lock as first-class work.
4. Added tombstones, key versioning, and conflict-policy requirements.
5. Added self-hosted operations and release hardening as explicit milestones.
