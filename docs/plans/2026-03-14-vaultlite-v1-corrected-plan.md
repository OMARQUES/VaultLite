# VaultLite V1 Corrected Foundation Plan

## Purpose
This document replaces the earlier foundation plan with the critical review incorporated as explicit decisions, missing ADRs, and a revised execution order.

VaultLite V1 is a **Cloudflare-first**, **account-owned deployment** password manager project for personal use, family, friends, and trusted acquaintances.

It is **not** positioned as a broad enterprise product and **not** positioned as a truly portable self-hosted platform in V1.

## Product Positioning
- **Deployment model:** Cloudflare-first, deployed in the owner's own Cloudflare account.
- **Audience:** owner, family, friends, known users.
- **Tenancy model:** single-tenant.
- **Goal:** secure, simple, free or very low-cost, zero-knowledge.
- **Non-goal:** enterprise admin suite, multi-tenant SaaS, corporate-grade delegation.

## Security Invariants
These are hard rules for V1:

1. The server never receives the master password in plaintext.
2. The server never receives decrypted vault payloads or decrypted attachment bytes.
3. The admin/owner cannot recover another user's vault.
4. A forgotten master password is not recoverable by the system.
5. The Account Kit is for onboarding, new-device bootstrap, and controlled reissue only.
6. The Account Kit must not contain any secret that directly resets the master password.
7. Search must remain local-only. The server must not be able to execute content search over plaintext vault data.
8. Attachment encryption happens on the trusted client before upload.
9. Password rotation must be atomic and versioned.
10. Browser extension scope is limited until the web core is stable.

## V1 Scope
### In scope
- onboarding by invite token
- master password chosen by the user
- Account Key generation
- Account Kit generation/export
- login on trusted device with username + master password
- new-device bootstrap with username + master password + Account Key / Account Kit
- web vault CRUD
- login items
- document items
- encrypted attachments
- local-only search
- password generator
- sync
- device management
- password rotation
- import/export

### Out of scope
- email-based recovery
- admin vault recovery
- passkeys
- enterprise SSO / SCIM / SIEM
- multi-tenant organizations
- fine-grained roles
- attachment preview / OCR / thumbnails
- resumable upload
- attachment deduplication
- mobile native app
- advanced autofill heuristics in the first extension delivery

## Final Technical Positioning
### Runtime and platform
- **Runtime:** Cloudflare Workers
- **Metadata DB:** D1
- **Blob storage:** R2
- **Frontend:** Vue 3 + TypeScript
- **Extension:** Vue 3 + shared core packages
- **Testing:** Vitest, Playwright

### Design consequence
The system is Cloudflare-first in V1. Abstraction boundaries should still exist around runtime and storage so future portability remains possible, but portability is not a V1 promise.

## Revised Monorepo Layout
```txt
/packages
  /domain
  /crypto
  /contracts
  /storage-abstractions
  /runtime-abstractions
  /test-utils

/adapters
  /cloudflare-storage
  /cloudflare-runtime

/apps
  /web
  /extension
  /api

/infrastructure
  /migrations
  /scripts

/docs
  /adr
  /testing
```

## ADR Gates Before Implementation
No sensitive implementation starts until these ADRs exist and are approved.

### ADR 0001 - Deployment Target
Decision:
- Cloudflare-first, account-owned deployment.
- Not marketed as fully portable self-hosted in V1.
- Domain code remains adapter-friendly.

Must define:
- why Cloudflare-first was chosen
- what portability is deferred
- what must remain abstracted even in V1

### ADR 0002 - Crypto Profile
Must define:
- chosen KDF and parameters
- envelope format and version field
- nonce/IV strategy
- key separation rules
- attachment encryption envelope
- test vector requirements

### ADR 0003 - Auth Protocol
Decision direction:
- Account Key does not participate in routine login on trusted devices.
- Routine login uses username + master password + trusted local session.
- Account Key participates in onboarding, new-device bootstrap, and controlled reissue flows only.

Must define:
- verifier protocol
- server-side stored fields
- anti-enumeration behavior
- rate limiting expectations
- session model
- reauthentication for sensitive actions

### ADR 0004 - Search Model
Decision:
- local-only decrypted index
- no server-side plaintext search
- no blind indexes in V1

Must define:
- searchable fields
- index storage location
- rebuild behavior after lock/unlock/sync

### ADR 0005 - Sync Conflict Policy
Must define:
- per-item optimistic concurrency
- revision handling
- tombstones
- deletion semantics
- deterministic conflict behavior

### ADR 0006 - Local Storage Policy
Must define:
- what may be stored in IndexedDB
- what may never be stored in LocalStorage
- auto-lock timer behavior
- secret wipe rules in memory
- trusted device policy
- session restoration boundaries

### ADR 0007 - Account Kit Lifecycle
Decision:
- JSON versioned format plus QR representation
- contains only bootstrap/configuration secrets
- does not contain master password
- does not contain any recovery secret that resets the master password
- does not contain admin tokens

Must define:
- exact format
- versioning
- export rules
- reissue rules
- optional Account Key rotation behavior
- threat model for kit leakage

Minimum content:
- server URL
- username
- account identifier
- account key
- format version

### ADR 0008 - Attachment Lifecycle and Backup
Decision:
- limit file size to **25 MB per file**
- limit account attachment storage to **250 MB per account** in V1
- no deduplication
- no resumable upload
- no preview/OCR/thumbs
- orphan cleanup job required
- versioned backup package format required

Must define:
- upload lifecycle
- delete lifecycle
- orphan cleanup behavior
- metadata encryption requirements
- MIME handling as untrusted input
- export/backup packaging
- restore format even if restore UI is deferred
- quota checks and user warnings

### ADR 0009 - Password Rotation Invariants
Decision:
- password change requires active session + current password
- re-encryption happens client-side
- server commit must be atomic and versioned

Must define:
- expected_version behavior
- rollback safety
- key_version/verifier_version updates
- failure semantics

Required logical operation:
1. client decrypts current bundle
2. client derives new material
3. client sends `new_auth_verifier`, `new_encrypted_bundle`, `expected_key_version`
4. server commits only if version matches

### ADR 0010 - Tenant / Bootstrap Admin Model
Decision:
- V1 is single-tenant
- there is one initial owner/admin
- bootstrap occurs by CLI/env/local setup
- only authenticated admin can issue invites
- invites are account-scoped

Must define:
- first admin bootstrap
- invite authority
- owner-only operational actions

## Corrected Functional Flows

### Flow 1 - User Creation by Invite
1. Owner/admin creates an invite token with expiration.
2. User opens invite link or scans QR.
3. Trusted client generates:
   - Account Key
   - Vault Root Key
   - initial device keys
4. User chooses the master password.
5. Client derives auth material and encrypts the account bundle locally.
6. Server stores only verifier material, encrypted bundle, non-secret metadata, and device registration.
7. Client must export the Account Kit before onboarding completes.
8. User must acknowledge that forgotten master passwords are not recoverable.

### Flow 2 - Routine Login on Trusted Device
1. User enters username + master password.
2. Client uses trusted-device state and local session policy.
3. Server validates using the defined verifier protocol.
4. Unlock and local index rebuild happen client-side.

### Flow 3 - Login on New Device
1. User provides server URL, username, master password, and Account Key.
2. Account Kit QR import is allowed.
3. Client obtains the encrypted bundle.
4. Client performs unlock/bootstrap locally.
5. New trusted device is registered.

### Flow 4 - Account Kit Reissue
1. User must already be authenticated and unlocked.
2. Reissue may regenerate a new Account Kit.
3. Optional Account Key rotation may invalidate previous kits if the ADR chooses that policy.

### Flow 5 - Password Rotation
1. User is authenticated.
2. User provides current password and new password.
3. Client decrypts current bundle.
4. Client derives new verifier material and re-encrypts the bundle.
5. Client sends atomic update with `expected_key_version`.
6. Server commits only if the version matches.
7. If the operation fails, the previous valid state remains intact.

### Flow 6 - Attachment Upload
1. User selects a file.
2. Client validates file size and account quota status.
3. If the account is near configured Cloudflare cost thresholds, show a warning and require explicit confirmation.
4. Client generates file key and encrypts the blob locally.
5. Client uploads encrypted bytes only.
6. Server stores encrypted object and encrypted metadata only.

## Quota and Cost Warning Policy
V1 should not hard-block uploads merely because the account is near the free plan threshold.

Instead, implement:
- hard application limits:
  - 25 MB per file
  - 250 MB total encrypted attachment storage per account
- soft cost warnings:
  - configurable warning threshold by percentage of owner-defined quota
  - default warning threshold, for example 80%
  - explicit confirmation before upload when threshold is crossed
- operator-configurable limits in environment/config
- UI copy that explains the warning is about possible Cloudflare billing, not a vault security problem

Important:
- do not hardcode Cloudflare free-tier values into the product logic
- store configurable soft quotas in owner-controlled settings/config
- show current measured usage based on encrypted object sizes and object count metadata

## Testing Policy
### Test-first is mandatory for:
- crypto
- auth
- sync
- password rotation

### Smoke tests are sufficient for:
- scaffold
- package wiring
- empty layouts
- base routing shell

### Minimum required test layers
- unit tests for crypto/domain rules
- integration tests for API/storage/auth flows
- E2E tests for onboarding, login, vault CRUD, attachments, sync, password rotation

## Revised Execution Order

### Phase 0 - Documentation and Hard Gates
1. PRD cleanup
2. SECURITY.md
3. ARCHITECTURE.md
4. release checklist
5. ADR 0001 to ADR 0010

### Phase 1 - Monorepo and Core Boundaries
1. monorepo bootstrap
2. package boundaries
3. storage/runtime abstractions
4. Cloudflare adapters
5. cross-platform scripts in Node/tsx

Required scripts:
- `infrastructure/scripts/check-secrets.ts`
- `infrastructure/scripts/validate-env.ts`
- `infrastructure/scripts/validate-migrations.ts`

### Phase 2 - Contracts and Domain Model
1. contracts package
2. domain entities
3. recovery/no-recovery policy
4. device trust policy
5. stable API contracts

### Phase 3 - Crypto Package
1. KDF
2. account key generation
3. vault envelope
4. blob envelope
5. test vectors
6. versioned ciphertext formats

### Phase 4 - Storage and API Skeleton
1. migrations
2. repository interfaces
3. Cloudflare storage adapters
4. API route skeleton
5. rate-limit / anti-enumeration hooks in auth-adjacent routes

### Phase 5 - Auth, Onboarding, and Account Kit
1. invite issuance
2. onboarding
3. new-device bootstrap
4. trusted session issuance
5. Account Kit generation/export
6. zero-recovery messaging in UI

### Phase 6 - Web Shell and Local Security Behavior
1. Vue app shell
2. route guards
3. session store
4. secure local cache
5. auto-lock
6. lock/unlock behavior

### Phase 7 - Vault CRUD and Local Search
1. login item CRUD
2. document item CRUD
3. tombstones
4. local decrypted index
5. password generator

### Phase 8 - Attachments and Documents
1. encrypted upload
2. encrypted download
3. attachment deletion
4. orphan cleanup strategy
5. document UX
6. quota/cost warning UI

### Phase 9 - Sync, Devices, and Password Rotation
1. sync service
2. deterministic conflict handling
3. device listing and revocation
4. password rotation atomic flow

### Phase 10 - Import, Export, and Backup Format
1. CSV login import
2. JSON export
3. encrypted backup package format
4. attachment-inclusive manifest
5. restore format fixed in docs even if full restore UI is deferred

### Phase 11 - Browser Extension
Scope of first delivery:
- unlock
- credential listing
- manual fill

Deferred:
- aggressive autofill heuristics
- auto-save heuristics until core behavior is stable

### Phase 12 - Hardening and Release Readiness
1. threat model
2. operations doc
3. release doc
4. secret scanning
5. dependency audit
6. env validation
7. residual risk log

## Corrected File Targets for the Plan
### Top-level documentation
- `AGENTS.md`
- `docs/PRD.md`
- `docs/SECURITY.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- `docs/THREAT_MODEL.md`
- `docs/RELEASE.md`
- `docs/BACKUP_FORMAT.md`
- `docs/testing/release-checklist.md`

### ADRs
- `docs/adr/0001-deployment-target.md`
- `docs/adr/0002-crypto-profile.md`
- `docs/adr/0003-auth-protocol.md`
- `docs/adr/0004-search-model.md`
- `docs/adr/0005-sync-conflict-policy.md`
- `docs/adr/0006-local-storage-policy.md`
- `docs/adr/0007-account-kit-lifecycle.md`
- `docs/adr/0008-attachment-lifecycle-and-backup.md`
- `docs/adr/0009-password-rotation-invariants.md`
- `docs/adr/0010-tenant-bootstrap-admin-model.md`

## Final Notes for Execution
- Do not start coding auth before ADR 0003 is approved.
- Do not start attachments before ADR 0008 is approved.
- Do not start password rotation before ADR 0009 is approved.
- Do not start onboarding UI before ADR 0007 is approved.
- Do not let browser extension work bypass the web-core stability gate.
- Do not describe V1 as a portable self-hosted platform; describe it as Cloudflare-first and owner-deployed.

## Summary of Changes vs Previous Foundation Plan
- Fixed deployment positioning to Cloudflare-first.
- Added four missing ADRs: Account Kit, Attachments/Backup, Password Rotation, Tenant/Admin Bootstrap.
- Promoted search to explicit local-only policy.
- Fixed auth position so Account Key is not part of routine login.
- Added attachment quota and cost-warning policy.
- Replaced PowerShell-only ops scripts with cross-platform Node/tsx scripts.
- Strengthened package boundaries to keep Cloudflare coupling out of core domain logic.
- Revised execution order so documentation and architectural gates happen before risky implementation.
