# VaultLite V1 Architecture Baseline

## Document status
- Status: accepted baseline
- Source of truth: `docs/plans/2026-03-14-vaultlite-v1-corrected-plan-v2.2.1.md`
- Related docs: `docs/PRD.md`, `docs/SECURITY.md`, `docs/THREAT_MODEL.md`, `docs/adr/`

## Architectural stance
VaultLite V1 is Cloudflare-first and owner-deployed. Domain and contract boundaries must still be portable in design, but portability is not a V1 product promise.

## Runtime model
- Frontend web app: Vue 3 + TypeScript
- Extension: browser extension sharing core packages
- API runtime: Cloudflare Workers
- Metadata DB: D1
- Blob storage: R2

## Trust boundaries
Trusted client:
- performs `local unlock`
- decrypts vault payloads
- encrypts attachments before upload
- builds local-only search index

Untrusted server:
- stores encrypted data and auth-related server state
- manages sessions, invites, quotas, lifecycle, and sync metadata
- never decrypts vault or attachment plaintext

## Monorepo layout
```txt
/apps
  /web
  /api
  /extension

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

/infrastructure
  /migrations
  /scripts

/docs
  /adr
  /plans
  /reviews
  /testing
```

## Package responsibilities
- `packages/domain`: entities, invariants, lifecycle concepts
- `packages/crypto`: crypto helpers, envelopes, KDF policy, signature helpers
- `packages/contracts`: shared request or response and state contracts
- `packages/storage-abstractions`: repositories and storage-facing interfaces
- `packages/runtime-abstractions`: runtime-specific abstractions shared by apps
- `packages/test-utils`: shared fixtures and helpers
- `adapters/cloudflare-storage`: D1 and R2 bindings
- `adapters/cloudflare-runtime`: Worker-specific runtime integration
- `apps/web`: Vue application shell and trusted-client UX
- `apps/api`: Worker API surface
- `apps/extension`: extension-specific UI and integration entrypoints

## Architectural rules
- preserve separation between domain, crypto, contracts, adapters, and apps
- keep Cloudflare-specific code inside adapters or app-runtime edges
- do not place business rules inside adapters
- do not place cryptographic trust in the server
- do not collapse `remote authentication`, `local unlock`, and `session restoration` into one concept

## Sequence of implementation
1. docs, threat model, and ADRs
2. monorepo scaffold and package boundaries
3. contracts and crypto foundation
4. storage and API skeleton
5. onboarding and auth flows
6. client UX, vault features, attachments, sync, and lifecycle controls
7. import/export, extension, and release hardening
