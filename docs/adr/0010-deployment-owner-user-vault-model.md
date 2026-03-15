# ADR 0010: Deployment Owner User Vault Model

- Status: Accepted
- Date: 2026-03-15

## Context
VaultLite V1 is single-tenant per deployment but supports multiple invited users. Operational authority and vault ownership must stay separate.

## Decision
- One deployment contains multiple user accounts.
- Each user has one primary private vault in V1.
- Owner/admin manages invites, quotas, config, and lifecycle, but never gains cryptographic access to other users' vaults.
- Canonical lifecycle states include at least `active`, `suspended`, and `deprovisioned`.
- Shared vaults and fine-grained roles are out of scope for V1.

## Consequences
- Lifecycle operations are operational and security-relevant, but not cryptographic override paths.
- Admin UI and API work must preserve per-user vault isolation.
- Future sharing models must be separate architecture work.
