
# VaultLite V1 Corrected Foundation Plan v2.2

## Purpose
This document supersedes the previous corrected foundation plan v2 and incorporates the remaining contract-hardening issues identified during review.

VaultLite V1 is a **Cloudflare-first**, **owner-deployed**, **single-tenant deployment with multiple invited users** password manager project for personal use, family, friends, and trusted acquaintances.

It is **not** positioned as a portable self-hosted platform in V1 and **not** positioned as an enterprise password platform.

## Product Positioning
- **Deployment model:** Cloudflare-first, deployed in the owner's own Cloudflare account.
- **Audience:** owner, family, friends, trusted known users.
- **Tenancy model:** one deployment, multiple users, isolated per-user vaults.
- **Goal:** secure, simple, zero-knowledge, free or low-cost for a small trusted group.
- **Non-goal:** enterprise admin suite, multi-tenant SaaS, broad B2B password-sharing platform.

## Core Model Decisions
These terms are fixed for V1 and must be used consistently in code and documentation.

- **Deployment:** one running VaultLite instance in one owner's Cloudflare account.
- **Tenant:** in V1, equivalent to the deployment. There is only one tenant per deployment.
- **Owner/Admin:** the first administrative user created during bootstrap. This user has operational authority over the deployment, invites, quotas, user lifecycle, and config, but no cryptographic access to other users' vault contents.
- **User Account:** an authenticated identity within the deployment.
- **Vault:** one primary private vault per user in V1.
- **Shared Vault:** not present in V1.
- **Trusted Device:** a device that has completed bootstrap and stores the allowed trusted local state defined by ADR 0006.
- **Remote Authentication:** server roundtrip used to establish or refresh a server session.
- **Local Unlock:** client-side unlock of locally stored encrypted material on a trusted device.
- **Session Restoration:** restoring app state using an existing valid session plus local unlock if required.

## Security Invariants
These are hard rules for V1.

1. The server never receives the master password in plaintext.
2. The server never receives decrypted vault payloads or decrypted attachment bytes.
3. The owner/admin cannot recover another user's vault.
4. A forgotten master password is not recoverable by the system.
5. The Account Kit is for onboarding, new-device bootstrap, and controlled reissue only.
6. The Account Kit must not contain any secret that directly resets the master password.
7. Search is local-only. The server must not execute plaintext content search over vault data.
8. Attachment encryption happens on the trusted client before upload.
9. Password rotation is atomic and versioned.
10. The browser extension remains scoped and limited until the web core is stable.
11. No implementation may blur remote authentication and local unlock into the same flow.
12. The threat model is a design input, not a release-only hardening exercise.
13. Account Kit authenticity must be strongly verifiable in V1, not limited to checksum-only integrity.
14. Browser session controls must be explicitly defined before auth implementation begins.
15. Owner/admin operational authority never implies cross-user vault decryption authority.

## V1 Scope
### In scope
- onboarding by invite token
- master password chosen by the user
- Account Key generation
- Account Kit generation/export
- remote authentication on trusted devices using username + master password when a new server session is needed
- local unlock on trusted devices without Account Key
- new-device bootstrap using username + master password + Account Key or Account Kit
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
- minimal owner/admin user lifecycle operations: list, suspend, reactivate, deprovision

### Out of scope
- email-based recovery
- admin vault recovery
- passkeys
- enterprise SSO / SCIM / SIEM
- multi-tenant organizations
- fine-grained roles
- shared vaults
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
The system is Cloudflare-first in V1. Abstraction boundaries must still exist around runtime and storage so future portability remains possible, but portability is not a V1 promise.

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

## Threat Model Gate
A threat model is required before sensitive architecture implementation begins.

### Required artifacts before auth/storage/sync work
- `docs/THREAT_MODEL.md`
- `docs/SECURITY.md`
- `docs/ARCHITECTURE.md`
- ADR 0001 through ADR 0010

### Threat model minimum coverage
The initial threat model must explicitly cover:
- malicious server operator assumptions and limits
- stolen trusted device
- stolen Account Kit
- stolen master password without Account Kit
- stolen Account Kit without master password
- kit substitution or tampered bootstrap artifact
- browser compromise assumptions
- local storage leakage
- upload of malicious attachment files
- replay and guessing pressure on auth endpoints
- sync conflict and deletion safety
- cookie/session theft and fixation risks
- cross-site request risks for the web app
- admin misuse within operational authority limits

A second threat-model review happens again before release, but the first threat model is a hard design gate, not a final-stage checklist.

## ADR Gates Before Implementation
No sensitive implementation starts until these ADRs exist and are approved.

### ADR 0001 - Deployment Target
Decision:
- Cloudflare-first, owner-deployed.
- Not marketed as fully portable self-hosted in V1.
- Domain code remains adapter-friendly.

Must define:
- why Cloudflare-first was chosen
- what portability is deferred
- what must remain abstracted in V1

### ADR 0002 - Crypto Profile
Must define:
- chosen KDF and parameters
- envelope format and version field
- nonce/IV strategy
- key separation rules
- attachment encryption envelope
- test vector requirements

### ADR 0003 - Auth Protocol and Session Model
Decision direction:
- Account Key does not participate in routine login on trusted devices.
- Account Key participates only in onboarding, new-device bootstrap, and controlled Account Kit reissue/rotation flows.
- Remote authentication and local unlock are separate concepts.

Must define:
- verifier protocol
- server-side stored fields
- anti-enumeration behavior
- rate limiting expectations
- session model
- reauthentication for sensitive actions
- difference between remote authentication, local unlock, and session restoration
- cookie vs token strategy per surface
- HttpOnly / Secure / SameSite policy for web sessions
- CSRF mitigation strategy for mutable web requests
- session fixation mitigation and session rotation points
- session expiration, renewal, and revocation semantics
- extension-specific session handling boundaries

The following behavioral model is fixed for V1:
- **New device:** `server URL + username + master password + Account Key` or Account Kit import.
- **Trusted device with valid session:** local unlock without Account Key.
- **Trusted device with expired or revoked server session:** remote authentication with `username + master password`, then local unlock. No Account Key.

Minimum required web-session posture for V1:
- the web app must use server sessions that are not readable by application JavaScript
- authentication/session tokens must not be stored in LocalStorage
- session identifiers must rotate on login, sensitive reauth, and password rotation
- mutable web requests must be protected against CSRF
- session restoration must not silently bypass local unlock policy

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
- trusted-device state contents
- session restoration boundaries
- when remote authentication is required again
- local session cache invalidation rules
- CSP baseline for the web app
- minimum browser security headers expected from the app surface

Required V1 browser security baseline:
- no auth/session secrets in LocalStorage
- CSP must be defined before production web release
- `frame-ancestors 'none'` or equivalent clickjacking protection must be defined
- content-type sniffing must be disabled for served app assets where applicable

### ADR 0007 - Account Kit Lifecycle and Integrity
Decision:
- JSON versioned format plus QR representation
- contains only bootstrap/configuration secrets
- does not contain master password
- does not contain any recovery secret that resets the master password
- does not contain admin tokens
- reissue does **not** invalidate prior kits by default
- explicit Account Key rotation is a separate sensitive operation and may invalidate prior kits

Must define:
- exact file format
- canonical serialization rules
- versioning
- export rules
- reissue rules
- Account Key rotation behavior
- threat model for kit leakage
- file integrity mechanism
- file authenticity mechanism
- QR integrity mechanism
- QR authenticity mechanism
- deployment fingerprint display/verification
- deployment signing key lifecycle

Minimum content:
- server URL
- username
- account identifier
- account key
- format version
- integrity/authenticity field(s)
- deployment fingerprint

Minimum integrity/authenticity requirement for V1:
- deterministic canonical encoding
- integrity digest over the canonical payload
- **deployment signature over the canonical payload is required in V1**
- the QR representation must preserve verifiable authenticity, either by carrying the signed payload directly or a compact representation that can be verified equivalently
- import UI must verify the signature before accepting the kit
- visible deployment fingerprint must be shown in both export and import UI as a human verification aid

Required V1 trust model for the Account Kit:
- a valid checksum alone is insufficient
- authenticity must prove that the kit was emitted by the current deployment or by a deployment-trusted signing path defined in the ADR
- tampered or unverifiable kits must fail closed during import
- reissue exports a fresh representation of the same Account Key by default
- rotation of the Account Key is a separate sensitive action and may invalidate prior kits

### ADR 0008 - Attachment Lifecycle and Backup
Decision:
- limit file size to **25 MB per file**
- limit attachment storage to **250 MB per user account** in V1
- no deduplication
- no resumable upload
- no preview/OCR/thumbs
- orphan cleanup job required
- versioned backup package format required
- deployment-level soft cost warnings are supported in addition to user-level hard limits

Must define:
- upload lifecycle states
- delete lifecycle
- orphan cleanup behavior
- metadata encryption requirements
- distinction between unbound attachment upload metadata and item-binding metadata
- MIME handling as untrusted input
- export/backup packaging
- restore format even if restore UI is deferred
- quota checks and user warnings
- ordering guarantees between blob upload and metadata attachment
- idempotency model
- expiration of incomplete uploads
- finalize-bind API contract

Required V1 attachment state model:
- `pending`
- `uploaded`
- `attached`
- `deleted`
- `orphaned`

Required safe upload order:
1. client requests upload initialization
2. server creates `pending` record with upload token and expiration
3. client encrypts file locally and uploads encrypted blob
4. server marks record `uploaded`
5. client commits attachment-to-item binding through an explicit finalize-bind operation
6. server marks record `attached`

Required metadata model:
- **unbound attachment upload metadata** is created in `pending` and may be updated in `uploaded`
- this metadata is not yet attached to an item
- **item attachment binding metadata** is created only at finalize-bind / `attached`
- the schema and APIs must keep these two layers distinct

Required failure semantics:
- `pending` records expire automatically
- `uploaded` records without a completed bind become `orphaned` after TTL
- orphan cleanup job removes expired orphaned objects and stale metadata
- upload init and finalize operations must be idempotent by upload token or equivalent identifier
- finalize-bind must use item revision or equivalent concurrency protection to avoid attaching against stale item state

### ADR 0009 - Password Rotation Invariants
Decision:
- password change requires active session + current password
- re-encryption happens client-side
- server commit must be atomic and versioned

Must define:
- expected_bundle_version behavior
- rollback safety
- bundle_version/verifier_version updates
- failure semantics

Required logical operation:
1. client decrypts current bundle
2. client derives new material
3. client sends `new_auth_verifier`, `new_encrypted_bundle`, `expected_bundle_version`
4. server commits only if version matches

### ADR 0010 - Deployment / Owner / User / Vault Model
Decision:
- V1 is one deployment with multiple invited users
- each user has one primary private vault in V1
- there is one initial owner/admin
- bootstrap occurs by CLI/env/local setup
- only authenticated owner/admin can issue invites
- invites are account-scoped
- owner/admin has operational authority only, not cross-user vault decryption authority

Must define:
- first admin bootstrap
- invite authority
- owner-only operational actions
- per-user vault isolation expectations
- no shared vault behavior in V1
- account lifecycle states and allowed transitions
- suspend/reactivate/deprovision behavior
- effect of user lifecycle actions on sessions
- effect of user lifecycle actions on trusted devices
- effect of user lifecycle actions on encrypted blobs and retention/cleanup
- owner/admin operational endpoints and minimum UI surfaces for lifecycle control

Required V1 account lifecycle model:
- `active`
- `suspended`
- `deprovisioned`

Required V1 operational semantics:
- **suspended:** blocks new remote authentication, revokes active sessions, prevents normal access, preserves encrypted data, reversible by owner/admin
- **deprovisioned:** revokes active sessions, invalidates trusted device access, removes normal user access permanently, and triggers retention/cleanup policy defined by operations docs
- owner/admin actions remain operational only and do not decrypt user vault contents

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

### Flow 2 - Remote Authentication on Trusted Device
Use this flow only when a trusted device needs a fresh server session.

1. User enters username + master password.
2. Client performs remote authentication using the defined verifier protocol.
3. Server issues or refreshes the server session if valid.
4. Client continues with local unlock using trusted local state.
5. Account Key is not used in this flow.

### Flow 3 - Local Unlock on Trusted Device
Use this flow when the device is already trusted and a valid local state exists.

1. User opens the app.
2. If a valid server session still exists, the app restores session state.
3. User performs local unlock with the master password.
4. Vault decryption and local search index rebuild happen client-side.
5. No Account Key and no mandatory auth roundtrip are required.

### Flow 4 - Login on New Device
1. User provides server URL, username, master password, and Account Key.
2. Account Kit QR import is allowed.
3. Client obtains the encrypted bundle.
4. Client performs bootstrap and local unlock.
5. New trusted device is registered.
6. Trusted local state is created according to ADR 0006.

### Flow 5 - Session Restoration
1. App starts on a trusted device.
2. If a server session is still valid, restore app session state.
3. If auto-lock conditions require it, request local unlock.
4. If the server session is expired or revoked, fall back to Flow 2.

### Flow 6 - Account Kit Reissue
1. User must already be authenticated and unlocked.
2. Reissue exports a fresh Account Kit representation for the same Account Key by default.
3. Reissue alone does not invalidate prior kits.
4. Account Key rotation is a separate sensitive action.
5. If Account Key rotation is executed, previous kits may be invalidated according to ADR 0007.

### Flow 7 - Password Rotation
1. User is authenticated.
2. User provides current password and new password.
3. Client decrypts current bundle.
4. Client derives new verifier material and re-encrypts the bundle.
5. Client sends atomic update with `expected_bundle_version`.
6. Server commits only if the version matches.
7. If the operation fails, the previous valid state remains intact.

### Flow 8 - Attachment Upload
1. User selects a file.
2. Client validates file size and user-account quota status.
3. Client checks deployment-level soft cost warning thresholds.
4. If a deployment soft warning threshold is crossed, show warning and require explicit confirmation.
5. Client initializes upload and receives `pending` upload state.
6. Client generates file key and encrypts the blob locally.
7. Client uploads encrypted bytes only.
8. Server stores the encrypted object and **unbound encrypted attachment upload metadata** only.
9. Client finalizes the bind between the uploaded attachment record and the item through the finalize-bind API.
10. Server marks the record `attached` only after successful bind completion.
11. Cleanup jobs handle stale `pending` and `orphaned` records.

### Flow 9 - Owner/Admin User Lifecycle Operations
1. Owner/admin lists user accounts and statuses.
2. Owner/admin may suspend an `active` account.
3. Suspension revokes active sessions and blocks new remote authentication for that user.
4. Owner/admin may reactivate a suspended account.
5. Owner/admin may deprovision an account according to the operations policy.
6. Deprovisioning revokes sessions, invalidates trusted-device access, and triggers retention/cleanup rules for encrypted user data and blobs.

## Quota and Cost Warning Policy
V1 should not hard-block uploads merely because the deployment is near a free-plan-like threshold.

Instead, implement two distinct layers:

### Hard product limits per user account
- 25 MB per file
- 250 MB total encrypted attachment storage per user account

### Soft cost warnings per deployment
- configurable warning threshold by percentage of owner-defined deployment quota
- default warning threshold, for example 80%
- explicit confirmation before upload when threshold is crossed
- owner-configurable limits in environment/config

### Optional user-facing warnings
- a user may also be warned when they are near their own account storage limit

Important:
- do not hardcode Cloudflare free-tier values into product logic
- store configurable soft quotas in owner-controlled settings/config
- show current measured usage based on encrypted object sizes and object count metadata
- UI copy must explain that cost warnings are billing-related operational signals, not vault security problems

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
- E2E tests for onboarding, remote auth, local unlock, vault CRUD, attachments, sync, password rotation

### Additional required regression coverage
- migration tests for D1 schema evolution
- backup manifest validation tests
- restore-format validation tests even if restore UI is deferred
- regression tests ensuring secrets are not persisted in forbidden storage locations
- regression tests ensuring Account Kit never includes prohibited fields
- regression tests ensuring Account Kit signature verification fails closed on tampered input
- regression tests ensuring attachment uploads never send plaintext bytes
- regression tests for account lifecycle state effects on auth/session behavior
- secret scanning in CI
- dependency audit in CI

### Extension browser support policy for V1
- Chromium-based browsers are first-class in V1
- Firefox support is optional and may be deferred
- broad browser-matrix support is not a V1 requirement

### Repository hygiene requirements
- `.gitignore` must exist in the initial repository bootstrap
- local secrets, build output, test artifacts, and environment files must be ignored

## Revised Execution Order

### Phase 0 - Documentation, Threat Model, and Hard Gates
1. PRD cleanup
2. SECURITY.md
3. ARCHITECTURE.md
4. THREAT_MODEL.md
5. release checklist skeleton
6. ADR 0001 to ADR 0010

### Phase 1 - Monorepo and Core Boundaries
1. monorepo bootstrap
2. package boundaries
3. storage/runtime abstractions
4. Cloudflare adapters
5. cross-platform scripts in Node/tsx
6. initial `.gitignore`

Required scripts:
- `infrastructure/scripts/check-secrets.ts`
- `infrastructure/scripts/validate-env.ts`
- `infrastructure/scripts/validate-migrations.ts`

### Phase 2 - Contracts and Domain Model
1. contracts package
2. domain entities
3. no-recovery policy
4. device trust policy
5. stable API contracts
6. deployment/user/vault semantics encoded in shared types
7. account lifecycle states encoded in shared types

### Phase 3 - Crypto Package
1. KDF
2. Account Key generation
3. vault envelope
4. blob envelope
5. test vectors
6. versioned ciphertext formats
7. Account Kit canonical payload helpers
8. Account Kit signature helpers and verification tests

### Phase 4 - Storage and API Skeleton
1. migrations
2. repository interfaces
3. Cloudflare storage adapters
4. API route skeleton
5. rate-limit / anti-enumeration hooks in auth-adjacent routes
6. migration validation tests
7. account lifecycle enforcement hooks
8. session middleware security baseline

### Phase 5 - Auth, Onboarding, and Account Kit
1. invite issuance
2. onboarding
3. new-device bootstrap
4. trusted session issuance
5. remote-auth vs local-unlock separation in code contracts
6. Account Kit generation/export and reissue
7. Account Kit signature verification on import
8. zero-recovery messaging in UI

### Phase 6 - Web Shell and Local Security Behavior
1. Vue app shell
2. route guards
3. session store
4. secure local cache
5. auto-lock
6. local unlock behavior
7. session restoration behavior
8. CSP/security header integration
9. CSRF-protected mutable request flow

### Phase 7 - Vault CRUD and Local Search
1. login item CRUD
2. document item CRUD
3. tombstones
4. local decrypted index
5. password generator

### Phase 8 - Attachments and Documents
1. upload initialization and `pending` records
2. encrypted upload
3. finalize bind to item
4. encrypted download
5. attachment deletion
6. orphan cleanup strategy
7. document UX
8. quota/cost warning UI

### Phase 9 - Sync, Devices, and Password Rotation
1. sync service
2. deterministic conflict handling
3. device listing and revocation
4. password rotation atomic flow

### Phase 9.5 - Owner/Admin User Lifecycle Operations
1. user listing and status view
2. suspend endpoint and operational UI
3. reactivate endpoint and operational UI
4. deprovision endpoint and operational UI
5. session revocation and trusted-device invalidation on lifecycle change
6. lifecycle regression tests across auth/session/device behavior

### Phase 10 - Import, Export, and Backup Format
1. CSV login import
2. JSON export
3. encrypted backup package format
4. attachment-inclusive manifest
5. restore format fixed in docs even if full restore UI is deferred
6. backup validation tests

### Phase 11 - Browser Extension
Scope of first delivery:
- unlock
- credential listing
- manual fill

Deferred:
- aggressive autofill heuristics
- auto-save heuristics until core behavior is stable
- broad browser matrix until Chromium path is stable

### Phase 12 - Final Hardening and Release Readiness
1. threat-model review update
2. operations doc
3. release doc
4. secret scanning verification
5. dependency audit verification
6. env validation
7. residual risk log
8. release go/no-go checklist

## Corrected File Targets for the Plan
### Top-level documentation
- `AGENTS.md`
- `docs/PRD.md`
- `docs/SECURITY.md`
- `docs/ARCHITECTURE.md`
- `docs/THREAT_MODEL.md`
- `docs/OPERATIONS.md`
- `docs/RELEASE.md`
- `docs/BACKUP_FORMAT.md`
- `docs/testing/release-checklist.md`

### ADRs
- `docs/adr/0001-deployment-target.md`
- `docs/adr/0002-crypto-profile.md`
- `docs/adr/0003-auth-protocol-and-session-model.md`
- `docs/adr/0004-search-model.md`
- `docs/adr/0005-sync-conflict-policy.md`
- `docs/adr/0006-local-storage-policy.md`
- `docs/adr/0007-account-kit-lifecycle-and-integrity.md`
- `docs/adr/0008-attachment-lifecycle-and-backup.md`
- `docs/adr/0009-password-rotation-invariants.md`
- `docs/adr/0010-deployment-owner-user-vault-model.md`

## Final Notes for Execution
- Do not start coding auth before ADR 0003 is approved.
- Do not start attachments before ADR 0008 is approved.
- Do not start password rotation before ADR 0009 is approved.
- Do not start onboarding UI before ADR 0007 is approved.
- Do not start operational multi-user management before ADR 0010 is approved.
- Do not treat threat modeling as a release-only phase.
- Do not let browser extension work bypass the web-core stability gate.
- Do not describe V1 as a portable self-hosted platform; describe it as Cloudflare-first and owner-deployed.
- Do not let implementation reintroduce ambiguity between remote authentication, local unlock, and session restoration.

## Summary of Changes vs Previous Corrected Plan v2
- promoted Account Kit authenticity from optional hardening to required V1 behavior
- clarified Account Kit trust model, signature requirement, and import failure behavior
- separated unbound attachment upload metadata from item-binding metadata
- made finalize-bind an explicit required API/state transition for attachments
- added concrete session/browser security requirements to ADR 0003 and ADR 0006
- added minimal user account lifecycle operations for owner/admin in V1
- promoted user lifecycle from implicit enforcement to an explicit execution phase with endpoints, operational UI, and regression coverage
- standardized password-rotation versioning on `expected_bundle_version`
- standardized lifecycle state naming on `deprovisioned`
- added account lifecycle effects to contracts, flows, API skeleton, and regression coverage
