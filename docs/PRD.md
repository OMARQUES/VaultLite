# VaultLite V1 Product Requirements Document

## Document status
- Status: accepted baseline
- Source of truth: `docs/plans/2026-03-14-vaultlite-v1-corrected-plan-v2.2.1.md`
- Related docs: `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/THREAT_MODEL.md`, `docs/adr/`

## Product summary
VaultLite is an open source, Cloudflare-first, zero-knowledge password manager for personal use, family, friends, and other known trusted users.

V1 is owner-deployed, single-tenant per deployment, and supports multiple invited users. It is not an enterprise product and is not positioned as a portable self-hosted platform in V1.

## Audience
- Primary: deployment owner
- Secondary: invited users such as family, friends, and known trusted contacts
- Excluded for V1: enterprise administrators, large organizations, multi-tenant SaaS operators

## Product goals
- Provide a simple zero-knowledge password manager for a small trusted group
- Keep vault contents inaccessible to the server
- Support trusted multi-device usage without turning Account Kit into password recovery
- Keep operations low-cost and realistic for an owner-managed Cloudflare deployment

## Non-goals
- Enterprise admin suite
- Multi-tenant SaaS platform
- Shared vaults
- Fine-grained roles
- Email-based recovery
- Admin recovery of user vaults
- Mobile native app
- Advanced first-release extension capture heuristics

## Core model
- Deployment: one VaultLite instance in one owner's Cloudflare account
- Tenant: equivalent to the deployment in V1
- Owner/Admin: operational authority over invites, quotas, config, and user lifecycle, but no cryptographic access to other users' vaults
- User Account: authenticated identity inside one deployment
- Vault: one primary private vault per user in V1
- Trusted Device: device that completed bootstrap and stores only trusted local state allowed by policy

## Canonical terminology
These terms are fixed in code and documentation:
- `remote authentication`
- `local unlock`
- `session restoration`
- `expected_bundle_version`
- `deprovisioned`

## V1 in scope
- invite-based onboarding
- user-chosen master password
- Account Key generation
- Account Kit generation and export
- `remote authentication` with username + master password when a new server session is needed
- `local unlock` on trusted devices without Account Key
- new-device bootstrap using username + master password + Account Key or Account Kit import
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
- minimal owner/admin user lifecycle operations: list, suspend, reactivate, `deprovisioned`

## V1 out of scope
- email-based recovery
- admin vault recovery
- passkeys
- enterprise SSO, SCIM, SIEM
- multi-tenant organizations
- shared vaults
- attachment preview, OCR, thumbnails
- resumable upload
- attachment deduplication
- mobile native app
- advanced autofill heuristics in the first extension delivery
- `save login` in the first extension delivery

## Product constraints
- zero-knowledge is non-negotiable
- the server never decrypts vault payloads or attachment blobs
- search is local-only
- attachments are encrypted on the client before upload
- Account Kit helps onboarding and trusted-device bootstrap only; it is not password reset
- owner/admin authority is operational, not cryptographic

## Delivery order
1. Documentation, threat model, and ADR gates
2. Monorepo and package boundaries
3. Contracts and crypto foundations
4. Storage, API skeleton, and session baseline
5. Onboarding, auth, trusted-device flows, and Account Kit
6. Web shell, vault features, attachments, sync, and lifecycle operations
7. Import/export, extension, and release hardening

## Success criteria for V1
- a user can onboard from an invite and create a vault
- the same user can add a trusted device using Account Kit or Account Key flow
- the server never needs the master password in plaintext or vault plaintext
- sync, device revocation, and password rotation follow explicit invariants
- owner/admin can operate invites and lifecycle without decrypting user vaults
