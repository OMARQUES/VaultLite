# VaultLite V1 Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform `PlanoBruto.txt` into an executable V1 roadmap with explicit security decisions, a realistic delivery order, and a codebase structure that can be implemented without redefining core architecture mid-flight.

**Architecture:** Build a TypeScript monorepo where all sensitive cryptography runs only on trusted clients, while the API stores encrypted payloads, encrypted blobs, and non-secret metadata. Freeze the crypto, auth, sync, and local-storage decisions before implementation so the project does not drift into accidental server trust or incompatible client behavior. Deliver the web core first, then sync hardening, then browser extension.

**Tech Stack:** `pnpm`, TypeScript, Vue 3, Vite, Cloudflare Worker-compatible API layer, Zod, Vitest, Playwright, Web Crypto plus a vetted crypto library chosen by ADR, SQLite/D1-compatible schema design, R2-compatible blob storage abstraction.

---

## Execution Gates

Do not start implementation before these decisions are written and approved in ADRs:

1. Deployment target: truly self-hosted portable backend, or Cloudflare-first managed deployment.
2. Authentication protocol: define the verifier protocol explicitly instead of inventing it ad hoc.
3. Search model: local-only search, blind indexes, or metadata-only search.
4. Sync conflict policy: per-item optimistic concurrency, tombstones, and conflict resolution behavior.
5. Local secret handling: IndexedDB/session storage boundaries, auto-lock policy, and device trust rules.

## Delivery Order

1. Product and security docs
2. Monorepo and tooling
3. Shared contracts and domain rules
4. Crypto package
5. Storage schema and API skeleton
6. Onboarding and login
7. Web vault CRUD
8. Attachments
9. Sync and device management
10. Import/export
11. Browser extension
12. Hardening and release readiness

### Task 1: Freeze Product, Security, and ADR Baseline

**Files:**
- Create: `AGENTS.md`
- Create: `docs/PRD.md`
- Create: `docs/SECURITY.md`
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/adr/0001-deployment-target.md`
- Create: `docs/adr/0002-crypto-profile.md`
- Create: `docs/adr/0003-auth-protocol.md`
- Create: `docs/adr/0004-search-model.md`
- Create: `docs/adr/0005-sync-conflict-policy.md`
- Create: `docs/adr/0006-local-storage-policy.md`
- Create: `docs/testing/release-checklist.md`

**Step 1: Write the acceptance checklist**

Create `docs/testing/release-checklist.md` with explicit checks for:
- server never receives master password in clear
- server never receives decrypted vault payloads
- admin cannot reset vault access
- onboarding cannot complete without Account Kit export
- extension work is blocked until web auth and sync are stable

**Step 2: Resolve architecture decisions in docs**

Write the ADRs before creating any application code. Each ADR must record:
- problem statement
- selected option
- rejected options
- security consequences
- migration cost if changed later

**Step 3: Normalize the product scope**

Move the raw product description into `docs/PRD.md`, but trim V1 to:
- onboarding
- login
- vault CRUD
- attachments
- sync
- device management
- password change

Push browser extension autofill beyond core web stability.

**Step 4: Validate document consistency**

Run:

```bash
rg -n "self-hosted|Cloudflare|Account Kit|master password|zero-knowledge" AGENTS.md docs
```

Expected:
- the same recovery model appears in all docs
- deployment target is not described two different ways

**Step 5: Commit**

```bash
git add AGENTS.md docs
git commit -m "docs: freeze vaultlite v1 architecture and security baseline"
```

### Task 2: Bootstrap the Monorepo and Tooling

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `playwright.config.ts`
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/main.ts`
- Create: `apps/extension/package.json`
- Create: `apps/extension/tsconfig.json`
- Create: `apps/api-worker/package.json`
- Create: `apps/api-worker/tsconfig.json`
- Create: `packages/crypto/package.json`
- Create: `packages/domain/package.json`
- Create: `packages/shared-types/package.json`
- Create: `packages/storage/package.json`
- Create: `packages/test-utils/package.json`

**Step 1: Create the workspace skeleton**

Create the directories and package manifests only. Do not add business logic yet.

**Step 2: Add uniform commands**

Root scripts must include:
- `lint`
- `typecheck`
- `test`
- `build`
- `test:e2e`

**Step 3: Add minimal smoke tests**

Create one smoke test per package so CI fails if package wiring breaks.

**Step 4: Validate the workspace**

Run:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected:
- all packages resolve
- no app depends on undeclared local packages

**Step 5: Commit**

```bash
git add .
git commit -m "chore: bootstrap vaultlite monorepo"
```

### Task 3: Define Shared Domain Rules and API Contracts

**Files:**
- Create: `packages/shared-types/src/contracts/auth.ts`
- Create: `packages/shared-types/src/contracts/invites.ts`
- Create: `packages/shared-types/src/contracts/vault.ts`
- Create: `packages/shared-types/src/contracts/attachments.ts`
- Create: `packages/shared-types/src/index.ts`
- Create: `packages/domain/src/entities/user.ts`
- Create: `packages/domain/src/entities/device.ts`
- Create: `packages/domain/src/entities/vault.ts`
- Create: `packages/domain/src/entities/item.ts`
- Create: `packages/domain/src/entities/attachment.ts`
- Create: `packages/domain/src/policies/recovery-policy.ts`
- Create: `packages/domain/src/policies/device-trust-policy.ts`
- Create: `packages/domain/src/__tests__/contracts.spec.ts`

**Step 1: Write failing contract tests**

Add tests for:
- onboarding payload never includes master password
- login contract never exposes decrypted secrets
- attachment metadata contract supports encrypted metadata only
- username duplication returns a stable error shape

**Step 2: Run the failing tests**

Run:

```bash
pnpm --filter @vaultlite/domain test
```

Expected:
- failures for missing contract definitions

**Step 3: Implement the minimum shared types and schemas**

Use Zod or an equivalent schema library. Include:
- version fields for encrypted payloads
- opaque `auth_verifier` type, not a free-form string
- explicit tombstone shape for deleted items

**Step 4: Re-run tests**

Run:

```bash
pnpm --filter @vaultlite/domain test
pnpm --filter @vaultlite/shared-types typecheck
```

Expected:
- contract tests pass
- no cross-package type leaks

**Step 5: Commit**

```bash
git add packages/domain packages/shared-types
git commit -m "feat: add shared contracts and domain policies"
```

### Task 4: Implement the Client Crypto Package with Test Vectors

**Files:**
- Create: `packages/crypto/src/kdf.ts`
- Create: `packages/crypto/src/account-key.ts`
- Create: `packages/crypto/src/vault-root-key.ts`
- Create: `packages/crypto/src/envelope.ts`
- Create: `packages/crypto/src/blob-envelope.ts`
- Create: `packages/crypto/src/version.ts`
- Create: `packages/crypto/src/index.ts`
- Create: `packages/crypto/test/kdf.spec.ts`
- Create: `packages/crypto/test/envelope.spec.ts`
- Create: `packages/crypto/test/blob-envelope.spec.ts`
- Create: `packages/crypto/test/test-vectors.spec.ts`
- Create: `docs/crypto/test-vectors.md`

**Step 1: Write failing tests first**

Cover:
- deterministic KDF output for fixed vectors
- successful encrypt/decrypt for JSON payloads
- successful encrypt/decrypt for binary attachments
- rejection of bad version, nonce, or tag

**Step 2: Run tests to confirm failure**

Run:

```bash
pnpm --filter @vaultlite/crypto test
```

Expected:
- tests fail because the implementation does not exist yet

**Step 3: Implement the minimum crypto API**

Rules:
- no custom crypto design
- one small surface area for the rest of the app
- include versioned envelopes from day one
- separate item encryption from attachment encryption

**Step 4: Re-run tests and typecheck**

Run:

```bash
pnpm --filter @vaultlite/crypto test
pnpm --filter @vaultlite/crypto typecheck
```

Expected:
- tests pass
- no untyped `any` in public crypto APIs

**Step 5: Commit**

```bash
git add packages/crypto docs/crypto
git commit -m "feat: add client crypto package and test vectors"
```

### Task 5: Add Storage Schema, Migrations, and API Skeleton

**Files:**
- Create: `infrastructure/migrations/0001_initial.sql`
- Create: `infrastructure/migrations/0002_sync_tombstones.sql`
- Create: `packages/storage/src/schema.ts`
- Create: `packages/storage/src/repositories/users.ts`
- Create: `packages/storage/src/repositories/devices.ts`
- Create: `packages/storage/src/repositories/vaults.ts`
- Create: `packages/storage/src/repositories/items.ts`
- Create: `packages/storage/src/repositories/attachments.ts`
- Create: `apps/api-worker/src/index.ts`
- Create: `apps/api-worker/src/routes/health.ts`
- Create: `apps/api-worker/src/routes/invites.ts`
- Create: `apps/api-worker/src/routes/auth.ts`
- Create: `apps/api-worker/src/routes/vault.ts`
- Create: `apps/api-worker/src/routes/attachments.ts`
- Create: `apps/api-worker/src/__tests__/routes.spec.ts`

**Step 1: Write failing integration tests**

Cover:
- invite token stored hashed only
- duplicate username rejected
- item deletion produces a tombstone record
- attachment record cannot store plaintext filename

**Step 2: Run the failing tests**

Run:

```bash
pnpm --filter @vaultlite/api-worker test
```

Expected:
- repository and route tests fail

**Step 3: Implement schema and route skeleton**

Required fields beyond the raw plan:
- `schema_version`
- `cipher_version`
- `deleted_at` for tombstones where needed
- `key_version` for future rotation

**Step 4: Re-run tests and migration validation**

Run:

```bash
pnpm --filter @vaultlite/api-worker test
pnpm exec tsx infrastructure/scripts/validate-migrations.ts
```

Expected:
- tests pass
- migrations apply in order

**Step 5: Commit**

```bash
git add infrastructure packages/storage apps/api-worker
git commit -m "feat: add storage schema and api skeleton"
```

### Task 6: Implement Invite, Onboarding, and New-Device Login Flows

**Files:**
- Create: `apps/api-worker/src/routes/onboarding.ts`
- Create: `apps/api-worker/src/routes/sessions.ts`
- Create: `packages/domain/src/services/onboarding-service.ts`
- Create: `packages/domain/src/services/login-service.ts`
- Create: `packages/domain/src/__tests__/onboarding.spec.ts`
- Create: `packages/domain/src/__tests__/login.spec.ts`
- Create: `apps/web/src/features/onboarding/api.ts`
- Create: `apps/web/src/features/login/api.ts`

**Step 1: Write failing tests for the auth flow**

Cover:
- invite cannot be reused
- login rejects wrong verifier without leaking whether username exists
- onboarding persists encrypted bundle and initial trusted device
- session issuance respects revocation state

**Step 2: Run tests to confirm failure**

Run:

```bash
pnpm --filter @vaultlite/domain test
pnpm --filter @vaultlite/api-worker test
```

Expected:
- auth flow tests fail

**Step 3: Implement the minimum end-to-end flow**

Rules:
- the worker never receives raw master password
- the verifier protocol must match `docs/adr/0003-auth-protocol.md`
- first device bootstrap must follow `docs/adr/0006-local-storage-policy.md`

**Step 4: Re-run tests**

Run:

```bash
pnpm --filter @vaultlite/domain test
pnpm --filter @vaultlite/api-worker test
```

Expected:
- invite, onboarding, and login tests pass

**Step 5: Commit**

```bash
git add apps/api-worker apps/web packages/domain
git commit -m "feat: implement onboarding and new-device login flows"
```

### Task 7: Build the Web App Shell, Session Handling, and Auto-Lock

**Files:**
- Create: `apps/web/src/router/index.ts`
- Create: `apps/web/src/layouts/PublicLayout.vue`
- Create: `apps/web/src/layouts/AuthenticatedLayout.vue`
- Create: `apps/web/src/features/session/session-store.ts`
- Create: `apps/web/src/features/session/auto-lock.ts`
- Create: `apps/web/src/features/session/secure-cache.ts`
- Create: `apps/web/src/features/login/LoginPage.vue`
- Create: `apps/web/src/features/onboarding/OnboardingPage.vue`
- Create: `apps/web/src/features/vault/VaultPage.vue`
- Create: `apps/web/src/features/session/__tests__/session-store.spec.ts`
- Create: `apps/web/e2e/auth-shell.spec.ts`

**Step 1: Write failing web tests**

Cover:
- public routes redirect after login
- authenticated routes lock after inactivity
- onboarding cannot finish without Account Kit export confirmation
- session restore never reconstructs plaintext vault data from unsafe storage

**Step 2: Run tests to confirm failure**

Run:

```bash
pnpm --filter @vaultlite/web test
pnpm --filter @vaultlite/web test:e2e
```

Expected:
- component and e2e tests fail

**Step 3: Implement the minimum shell**

Requirements:
- route guards
- session bootstrap
- inactivity lock
- consistent zero-recovery messaging on onboarding and password change screens

**Step 4: Re-run tests**

Run:

```bash
pnpm --filter @vaultlite/web test
pnpm --filter @vaultlite/web test:e2e
```

Expected:
- route and auto-lock tests pass

**Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add web shell session handling and auto-lock"
```

### Task 8: Implement Vault CRUD, Local Search, and Password Generator

**Files:**
- Create: `apps/web/src/features/vault/items/item-types.ts`
- Create: `apps/web/src/features/vault/items/item-store.ts`
- Create: `apps/web/src/features/vault/items/item-editor.vue`
- Create: `apps/web/src/features/vault/items/item-list.vue`
- Create: `apps/web/src/features/vault/search/local-index.ts`
- Create: `apps/web/src/features/vault/search/search.spec.ts`
- Create: `apps/web/src/features/password-generator/generator.ts`
- Create: `apps/web/src/features/password-generator/generator.spec.ts`
- Create: `apps/web/e2e/vault-crud.spec.ts`

**Step 1: Write failing tests for CRUD and search**

Cover:
- create, edit, delete login items
- create document items
- deleted items become tombstones for sync
- search uses only locally available decrypted data or explicitly allowed metadata

**Step 2: Run the failing tests**

Run:

```bash
pnpm --filter @vaultlite/web test
pnpm --filter @vaultlite/web test:e2e
```

Expected:
- CRUD and search tests fail

**Step 3: Implement the minimum local vault behavior**

Rules:
- do not invent server-side plaintext search
- do not send searchable secrets to the API
- keep item revisions explicit

**Step 4: Re-run tests**

Run:

```bash
pnpm --filter @vaultlite/web test
pnpm --filter @vaultlite/web test:e2e
```

Expected:
- CRUD, search, and generator tests pass

**Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add local vault crud search and password generator"
```

### Task 9: Implement Encrypted Attachments and Document UX

**Files:**
- Create: `apps/web/src/features/attachments/upload.ts`
- Create: `apps/web/src/features/attachments/download.ts`
- Create: `apps/web/src/features/attachments/attachment-store.ts`
- Create: `apps/web/src/features/attachments/__tests__/attachments.spec.ts`
- Create: `apps/web/src/features/documents/DocumentEditor.vue`
- Create: `apps/web/e2e/attachments.spec.ts`
- Create: `apps/api-worker/src/routes/blob-upload.ts`
- Create: `packages/storage/src/blob-store.ts`

**Step 1: Write failing attachment tests**

Cover:
- uploaded blob is encrypted before request dispatch
- plaintext filename is not present in API payload
- download restores the original bytes
- delete removes metadata and object reference

**Step 2: Run tests to confirm failure**

Run:

```bash
pnpm --filter @vaultlite/web test
pnpm --filter @vaultlite/web test:e2e
pnpm --filter @vaultlite/api-worker test
```

Expected:
- attachment tests fail

**Step 3: Implement the minimum encrypted attachment flow**

Requirements:
- file size limits in UI and API
- content-type treated as untrusted input
- no preview, OCR, or thumbnails in V1

**Step 4: Re-run tests**

Run:

```bash
pnpm --filter @vaultlite/web test
pnpm --filter @vaultlite/web test:e2e
pnpm --filter @vaultlite/api-worker test
```

Expected:
- upload and download tests pass

**Step 5: Commit**

```bash
git add apps/web apps/api-worker packages/storage
git commit -m "feat: add encrypted attachments and document item ux"
```

### Task 10: Implement Sync, Device Revocation, and Password Rotation

**Files:**
- Create: `packages/domain/src/services/sync-service.ts`
- Create: `packages/domain/src/services/device-service.ts`
- Create: `packages/domain/src/services/password-rotation-service.ts`
- Create: `packages/domain/src/__tests__/sync.spec.ts`
- Create: `packages/domain/src/__tests__/device-service.spec.ts`
- Create: `packages/domain/src/__tests__/password-rotation.spec.ts`
- Create: `apps/api-worker/src/routes/sync.ts`
- Create: `apps/web/src/features/sync/sync-client.ts`
- Create: `apps/web/src/features/devices/DevicesPage.vue`
- Create: `apps/web/src/features/account/ChangePasswordPage.vue`
- Create: `apps/web/e2e/sync-and-devices.spec.ts`

**Step 1: Write failing tests**

Cover:
- concurrent edits generate deterministic conflict behavior
- revoked devices lose access on next request
- password rotation requires current password plus active session
- password rotation preserves vault readability after re-encryption

**Step 2: Run tests to confirm failure**

Run:

```bash
pnpm --filter @vaultlite/domain test
pnpm --filter @vaultlite/api-worker test
pnpm --filter @vaultlite/web test:e2e
```

Expected:
- sync and revocation tests fail

**Step 3: Implement the minimum sync and account control layer**

Rules:
- no "merge simple by revision" without explicit conflict semantics
- device revocation invalidates sessions and refresh paths
- password rotation updates verifier version and key version atomically

**Step 4: Re-run tests**

Run:

```bash
pnpm --filter @vaultlite/domain test
pnpm --filter @vaultlite/api-worker test
pnpm --filter @vaultlite/web test:e2e
```

Expected:
- sync, device, and password rotation tests pass

**Step 5: Commit**

```bash
git add packages/domain apps/api-worker apps/web
git commit -m "feat: add sync device revocation and password rotation"
```

### Task 11: Implement Import, Export, and Backup Packaging

**Files:**
- Create: `apps/web/src/features/import/csv-import.ts`
- Create: `apps/web/src/features/import/csv-import.spec.ts`
- Create: `apps/web/src/features/export/export-json.ts`
- Create: `apps/web/src/features/export/export-backup.ts`
- Create: `apps/web/src/features/export/export.spec.ts`
- Create: `docs/BACKUP_FORMAT.md`
- Create: `apps/web/e2e/import-export.spec.ts`

**Step 1: Write failing tests**

Cover:
- CSV preview handles malformed rows without partial silent import
- export format distinguishes plaintext convenience export from encrypted backup
- attachment-inclusive backup references every blob deterministically

**Step 2: Run tests to confirm failure**

Run:

```bash
pnpm --filter @vaultlite/web test
pnpm --filter @vaultlite/web test:e2e
```

Expected:
- import and export tests fail

**Step 3: Implement the minimum import/export layer**

Requirements:
- explicit user warning when generating plaintext export
- encrypted backup format documented
- restore path deferred, but file format fixed now

**Step 4: Re-run tests**

Run:

```bash
pnpm --filter @vaultlite/web test
pnpm --filter @vaultlite/web test:e2e
```

Expected:
- import and export tests pass

**Step 5: Commit**

```bash
git add apps/web docs/BACKUP_FORMAT.md
git commit -m "feat: add import export and backup packaging"
```

### Task 12: Add the Browser Extension Only After Web Core Stability

**Files:**
- Create: `apps/extension/src/background/index.ts`
- Create: `apps/extension/src/content/fill.ts`
- Create: `apps/extension/src/popup/main.ts`
- Create: `apps/extension/src/popup/App.vue`
- Create: `apps/extension/src/session/extension-session.ts`
- Create: `apps/extension/src/__tests__/extension-session.spec.ts`
- Create: `apps/extension/e2e/autofill.spec.ts`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `AGENTS.md`

**Step 1: Write failing extension tests**

Cover:
- extension unlock respects the same local secret policy as the web app
- save-login flow never overwrites without confirmation
- manual fill failures do not crash the extension runtime

**Step 2: Run tests to confirm failure**

Run:

```bash
pnpm --filter @vaultlite/extension test
pnpm --filter @vaultlite/extension test:e2e
```

Expected:
- extension tests fail

**Step 3: Implement the smallest useful extension**

Scope for first delivery:
- unlock
- list credentials
- manual fill

Defer auto-save heuristics until the manual flow is stable.

**Step 4: Re-run tests**

Run:

```bash
pnpm --filter @vaultlite/extension test
pnpm --filter @vaultlite/extension test:e2e
```

Expected:
- extension core tests pass

**Step 5: Commit**

```bash
git add apps/extension docs/ARCHITECTURE.md AGENTS.md
git commit -m "feat: add browser extension core flows"
```

### Task 13: Release Hardening, Security Review, and Self-Hosted Ops

**Files:**
- Create: `docs/OPERATIONS.md`
- Create: `docs/THREAT_MODEL.md`
- Create: `docs/RELEASE.md`
- Create: `docs/SECURITY_TESTS.md`
- Create: `infrastructure/scripts/check-secrets.ps1`
- Create: `infrastructure/scripts/validate-env.ps1`
- Modify: `docs/SECURITY.md`
- Modify: `docs/testing/release-checklist.md`

**Step 1: Write the hardening checklist**

Cover:
- CSP and frontend XSS defenses
- cookie or token session storage rules
- rate limiting and anti-enumeration
- backup and restore expectations for self-hosted operators
- dependency audit and secret scan requirements

**Step 2: Add automated checks**

Add commands for:
- dependency audit
- secret scan
- environment validation
- smoke startup for web and API

**Step 3: Run the release checklist**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
npm audit --workspaces
rg -n "BEGIN .*PRIVATE KEY|AKIA|sk_live|Bearer " .
```

Expected:
- no critical dependency issues left unresolved
- no hardcoded secrets in the repository

**Step 4: Record residual risks**

`docs/RELEASE.md` must list:
- known limitations
- deferred scope
- operational assumptions
- security caveats that remain acceptable for V1

**Step 5: Commit**

```bash
git add docs infrastructure/scripts
git commit -m "docs: add release hardening threat model and ops guidance"
```

## Notes for Whoever Executes This Plan

- Treat `docs/adr/0003-auth-protocol.md` as a hard gate. If it is weak or vague, stop.
- Treat search, sync, and local cache as security-sensitive, not just UX work.
- Do not implement browser autofill before the web vault is stable and tested.
- Keep one PR per task. If a task becomes larger than one PR, split it before coding.
- Every API and storage contract needs version fields from the first commit.

Plan complete and saved to `docs/plans/2026-03-14-vaultlite-v1-foundation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
