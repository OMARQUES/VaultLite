# ADR 0004: Search Model

- Status: Accepted
- Date: 2026-03-15

## Context
Search is important for usability but is also an easy place to leak plaintext or overexpose metadata.

## Decision
- Search is local-only.
- The server does not execute plaintext content search for vault contents.
- V1 does not use blind indexes.
- The local decrypted index may include only explicitly approved searchable fields.
- Rebuild rules after sync, lock, or unlock must be explicit.

## Consequences
- Search logic belongs to the trusted client.
- Contracts and storage rules must prevent server-side fallback search from creeping in.
- The local storage policy must define where the index may live.
