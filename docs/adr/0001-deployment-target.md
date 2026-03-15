# ADR 0001: Deployment Target

- Status: Accepted
- Date: 2026-03-15

## Context
VaultLite V1 is intended for a small trusted group and is deployed by the owner in the owner's own Cloudflare account. Earlier project drafts mixed self-hosted portability language with Cloudflare-native assumptions.

## Decision
- V1 is Cloudflare-first and owner-deployed.
- V1 is not marketed as a portable self-hosted platform.
- Core logic must still remain adapter-friendly so future portability remains possible, but that portability is deferred.

## Consequences
- Workers, D1, and R2 are the supported runtime and storage targets in V1.
- Domain, contracts, and crypto remain separated from platform adapters.
- Operational docs and environment validation target Cloudflare-first deployment only.
