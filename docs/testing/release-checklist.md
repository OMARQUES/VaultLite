# VaultLite Pre-Implementation Gate Checklist

## Purpose
This checklist tracks the design gates that must be complete before sensitive implementation begins.

## Required baseline docs
- [ ] `docs/PRD.md`
- [ ] `docs/SECURITY.md`
- [ ] `docs/ARCHITECTURE.md`
- [ ] `docs/THREAT_MODEL.md`

## Required ADRs
- [ ] `docs/adr/0001-deployment-target.md`
- [ ] `docs/adr/0002-crypto-profile.md`
- [ ] `docs/adr/0003-auth-protocol-and-session-model.md`
- [ ] `docs/adr/0004-search-model.md`
- [ ] `docs/adr/0005-sync-conflict-policy.md`
- [ ] `docs/adr/0006-local-storage-policy.md`
- [ ] `docs/adr/0007-account-kit-lifecycle-and-integrity.md`
- [ ] `docs/adr/0008-attachment-lifecycle-and-backup.md`
- [ ] `docs/adr/0009-password-rotation-invariants.md`
- [ ] `docs/adr/0010-deployment-owner-user-vault-model.md`

## Required consistency checks
- [ ] canonical terminology is preserved in docs and ADRs
- [ ] no V1 doc reintroduces portable self-hosted or enterprise positioning
- [ ] no doc implies owner/admin cryptographic access to user vaults
- [ ] auth docs keep `remote authentication`, `local unlock`, and `session restoration` separate
- [ ] attachment docs preserve explicit lifecycle states and finalize-bind rules

## Exit rule
Sensitive implementation in auth, storage, sync, attachments, sessions, and lifecycle work begins only after every item above is complete and reviewed.
