# ADR 0002: Crypto Profile

- Status: Accepted
- Date: 2026-03-15

## Context
VaultLite requires an explicit crypto baseline before implementation. The design must avoid ad hoc crypto choices and must keep attachment and vault encryption versioned.

## Decision
- Use Argon2id as the primary KDF for master-password-derived material.
- Use versioned envelope formats for vault payloads and attachment blobs.
- Separate key material by purpose; do not reuse one derived key for unrelated crypto roles.
- Require explicit nonce or IV strategy per envelope type.
- Require test vectors before production crypto implementation is considered complete.

## Required implementation details
The implementation phase must specify:
- exact Argon2id parameters
- envelope version field
- AEAD mode and associated data rules
- nonce generation strategy
- Account Kit signing and canonical serialization support
- attachment blob envelope fields

## Implementation baseline frozen in Phase 3
- KDF: Argon2id
- memory: 65536
- passes: 3
- parallelism: 4
- tagLength: 32
- vault envelope version: `vault.v1`
- blob envelope version: `blob.v1`
- AEAD mode: `aes-256-gcm`
- nonce length: 12 bytes
- Account Kit signing: `Ed25519`
- Account Kit serialization: canonical JSON with sorted keys before signing

## Consequences
- No crypto code starts without fixed envelope structure.
- Crypto implementation must be test-first with fixed vectors.
- Password rotation and Account Kit work depend on these versioned primitives.
