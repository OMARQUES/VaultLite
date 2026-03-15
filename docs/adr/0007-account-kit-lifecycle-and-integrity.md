# ADR 0007: Account Kit Lifecycle and Integrity

- Status: Accepted
- Date: 2026-03-15

## Context
Account Kit is a bootstrap-critical artifact. It cannot become an implicit recovery channel or rely on weak integrity guarantees.

## Decision
- Account Kit uses a versioned JSON format with canonical serialization.
- QR representation is allowed only as a representation of the same canonical payload.
- Account Kit must be strongly authenticated by signature or equivalent strong authenticity mechanism.
- Import must fail closed on version mismatch, invalid signature, or wrong deployment binding.
- Account Kit does not contain master password, recovery secret, or admin token.
- Reissue does not invalidate prior kits by default; explicit Account Key rotation is a separate sensitive operation.

## Consequences
- Bootstrap code must verify authenticity before any device registration starts.
- Payload shape and serialization rules must be shared across export and import.
- Reissue and rotation semantics must remain distinct.

## Phase 3 baseline
- Canonical payload serialization is deterministic JSON with sorted keys.
- Signature baseline is `Ed25519`.
- Import verification rejects invalid signature, wrong deployment binding, and unsupported version before bootstrap continues.
