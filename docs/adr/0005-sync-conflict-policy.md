# ADR 0005: Sync Conflict Policy

- Status: Accepted
- Date: 2026-03-15

## Context
Multi-device support requires deterministic conflict handling. Earlier drafts were too vague and risked silent data loss.

## Decision
- Sync uses explicit per-item optimistic concurrency.
- Revisions are versioned and compared per item.
- Deletes use tombstones instead of implicit hard delete semantics.
- Conflict behavior must be deterministic and testable from ADR examples.
- V1 rejects ambiguous merge behavior.

## Consequences
- CRUD and delete paths must emit revision-aware state.
- Sync implementation must encode conflict examples as tests.
- Backup, restore, and attachment behavior must account for tombstone-aware state.
