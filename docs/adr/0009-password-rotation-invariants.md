# ADR 0009: Password Rotation Invariants

- Status: Accepted
- Date: 2026-03-15

## Context
Password rotation is one of the highest-risk flows because a partial update can permanently break account access.

## Decision
- Password rotation is atomic.
- Rotation uses `expected_bundle_version` as the canonical concurrency term.
- Stale bundle versions must fail closed.
- Rotation must not leave mixed key or mixed envelope versions after a failed attempt.
- Session consequences after rotation must be explicit.

## Consequences
- Rotation implementation must be test-first.
- Storage and verifier updates must behave as one logical operation even if compensating actions are required under the platform.
- The codebase must not introduce alternative version names for this flow.
