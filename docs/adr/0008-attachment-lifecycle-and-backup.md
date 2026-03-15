# ADR 0008: Attachment Lifecycle and Backup

- Status: Accepted
- Date: 2026-03-15

## Context
Attachments add cost, partial-failure paths, and restore complexity. Vague lifecycle rules create orphaned state and unsafe cleanup.

## Decision
- Attachment lifecycle uses explicit states, at minimum `pending`, `uploaded`, `attached`, `deleted`, and `orphaned` when applicable.
- Upload initialization creates a `pending` record before attachment binding.
- Blob upload and finalize-bind remain separate operations.
- Finalize binds encrypted metadata to the vault item only after upload success.
- Cleanup rules for expired or abandoned uploads must be explicit.
- Backup packaging includes only finalized attachment state, not abandoned pending uploads.

## Consequences
- API contracts must distinguish upload init, upload, finalize, download, and delete.
- Storage cleanup becomes an explicit operational concern.
- Backup manifests need attachment-aware metadata.
