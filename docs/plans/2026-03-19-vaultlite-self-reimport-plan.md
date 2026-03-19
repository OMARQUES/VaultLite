# VaultLite Self-Reimport (Export + Encrypted Backup) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `/settings -> Import vault data` accept and import VaultLite's own `vaultlite.export.v1` JSON and `vaultlite.backup.v1` encrypted package (with passphrase), including deterministic attachment restore behavior.

**Architecture:** Reuse the existing import pipeline (`detect -> parse -> dedupe -> preview -> execute`) and extend it with two internal formats: plaintext VaultLite export and encrypted backup package. Backup import remains client-side: parse package metadata, request passphrase in UI, decrypt in memory with existing crypto helpers, then reuse candidate mapping/execution path. Attachments are restored by replaying encrypted envelopes through existing `init -> content -> finalize` APIs, mapped from original `itemId` to created/existing destination item.

**Tech Stack:** Vue 3 + `<script setup lang="ts">`, Vitest, Zod contracts (`@vaultlite/contracts`), browser crypto helpers (`apps/web/src/lib/data-portability.ts`), existing vault import engine (`apps/web/src/lib/vault-import.ts`).

---

## Scope and Current-Gap Analysis

### Confirmed root cause
- `apps/web/src/lib/vault-import.ts` supports only:
  - `vaultlite_login_csv_v1`
  - `bitwarden_csv_v1`
  - `onepassword_1pux_v1`
  - `bitwarden_json_v1`
  - `bitwarden_zip_v1`
- For `.json`, detection path currently only accepts Bitwarden-like shape (`items/ciphers/encrypted`), so `vaultlite.export.v1` is rejected as `unsupported_import_format`.
- For `.vlbk.json`, extension still routes to JSON path, then fails the same Bitwarden check.
- There is no passphrase UX in import wizard; encrypted backup cannot be decrypted in import flow.

### Contracts already available (reuse, do not reinvent)
- `VaultJsonExportV1Schema` and `EncryptedBackupPackageV1Schema` exist in `packages/contracts/src/data-portability.ts`.
- Backup decrypt helper already exists: `decryptEncryptedBackupPackageV1(...)` in `apps/web/src/lib/data-portability.ts`.

### Status-card sync findings
- `status-card.md` still marks `P10-C01..P10-C06` as `not_started`, but repo already has substantial implementation for import/export/backup.
- There is no explicit card text saying "import VaultLite own export/backup"; this must be captured by card wording updates before/alongside implementation evidence.

---

## Decision-Complete Rules

### D1. New import formats
Add two explicit supported formats in import engine:
- `vaultlite_json_export_v1`
- `vaultlite_encrypted_backup_v1`

### D2. JSON detection precedence (closed)
When file extension is `.json` or `.vlbk.json`:
1. Parse JSON safely.
2. If `version === "vaultlite.export.v1"` -> `vaultlite_json_export_v1`.
3. Else if `version === "vaultlite.backup.v1"` -> `vaultlite_encrypted_backup_v1`.
4. Else if Bitwarden-like -> existing Bitwarden parser.
5. Else -> `unsupported_import_format`.

### D3. Backup passphrase behavior (closed)
- Backup package validation happens before decrypt.
- Import wizard asks passphrase only when backup format is detected.
- Passphrase is memory-only (`ref`), never persisted, never logged, cleared on close, back, completion, and any fatal error.

### D4. Backup decrypt errors (closed)
Map deterministic human-safe error codes:
- `backup_passphrase_required`
- `backup_decrypt_failed` (wrong passphrase / crypto failure)
- `backup_payload_integrity_mismatch`
- `unsupported_backup_version`

### D5. Attachment restore mapping (closed)
- Source backup attachments keyed by original `itemId`.
- During execution, maintain `sourceItemId -> destinationItemId` map from created rows and duplicate-resolution rows.
- Attachment import rule:
  - If row created -> attach to created item.
  - If row duplicate and strict history correlation allows retry -> `retry_missing_attachments_for_existing_item`.
  - If no safe destination mapping -> `skipped_review_required` for attachment, do not guess target.

### D6. Security and redaction (closed)
- Do not log passphrase, decrypted payloads, ciphertext blobs, auth tags, or derived keys.
- Preserve existing human-readable errors; no raw stack traces in UI.
- Keep existing `csrf + session` invariant for attachment mutation endpoints.

### D7. Status-card sync (closed)
- Update P10 card descriptions to reflect actual scope and this gap closure.
- Do not invent new phase IDs unless required; first preference is align existing `P10-C01`, `P10-C05`, `P10-C06` text/evidence.

---

## Card Alignment Plan (before code execution)

### `P10-C01`
Update objective/description from "CSV login import" to "Vault import engine + supported format matrix" and include VaultLite self-import JSON/backup recognition.

### `P10-C05`
Keep as restore docs card, but explicitly include "self-reimport behavior and limitations" (passphrase flow, attachment mapping, duplicate/retry semantics).

### `P10-C06`
Use as validation gate for roundtrip fixtures:
- export fixture -> import parse/preview/execute
- backup fixture -> decrypt/parse/preview/execute
- wrong passphrase/integrity/unsupported-version tests.

---

## Task-by-Task Execution (TDD, small slices)

### Task 1: Add format types and detection contract

**Files:**
- Modify: `apps/web/src/lib/vault-import.ts`
- Test: `apps/web/src/lib/vault-import.test.ts`

**Step 1: Write failing tests**
- Add tests asserting:
  - `.json` with `version: vaultlite.export.v1` selects internal VaultLite export parser.
  - `.vlbk.json` with `version: vaultlite.backup.v1` enters backup-required path (not Bitwarden path).

**Step 2: Run tests (expect fail)**
- `npm run test --workspace @vaultlite/web -- src/lib/vault-import.test.ts`

**Step 3: Minimal implementation**
- Extend `SupportedImportFormat` union.
- Implement detection precedence D2.

**Step 4: Re-run tests (expect pass)**

**Step 5: Commit**
- `git commit -m "feat(import): detect vaultlite export and backup formats"`

---

### Task 2: Parse `vaultlite.export.v1` into canonical candidates

**Files:**
- Modify: `apps/web/src/lib/vault-import.ts`
- Test: `apps/web/src/lib/vault-import.test.ts`

**Step 1: Write failing tests**
- Fixture with `vault.items[]` containing login/document/secure_note.
- Assert preview rows and counters are correct.
- Assert unsupported item types are marked `unsupported_type`.

**Step 2: Run tests (fail)**

**Step 3: Minimal implementation**
- Add `parseVaultLiteJsonExportImport(...)`:
  - Validate with `VaultJsonExportV1Schema`.
  - Map each `vault.items[]` into `ParsedImportCandidate`.
  - Use `sourceItemId = item.itemId` and deterministic `sourceRef`.

**Step 4: Re-run tests (pass)**

**Step 5: Commit**
- `git commit -m "feat(import): parse vaultlite.export.v1 payloads"`

---

### Task 3: Backup passphrase UX and parsing entry point

**Files:**
- Modify: `apps/web/src/components/settings/CsvImportWizardModal.vue`
- Modify: `apps/web/src/lib/vault-import.ts`
- Test: `apps/web/src/components/settings/CsvImportWizardModal.test.ts`

**Step 1: Write failing tests**
- Selecting `.vlbk.json` requires passphrase before Validate can proceed.
- Missing passphrase shows human message.
- Passphrase cleared on close/reset.

**Step 2: Run tests (fail)**

**Step 3: Minimal implementation**
- Add optional `backupPassphrase` argument to parse function input.
- In modal, detect backup format early and render passphrase field.

**Step 4: Re-run tests (pass)**

**Step 5: Commit**
- `git commit -m "feat(import-ui): require passphrase for encrypted backup import"`

---

### Task 4: Decrypt and parse `vaultlite.backup.v1`

**Files:**
- Modify: `apps/web/src/lib/vault-import.ts`
- Test: `apps/web/src/lib/vault-import.test.ts`

**Step 1: Write failing tests**
- Valid backup + correct passphrase -> preview built.
- Wrong passphrase -> `backup_decrypt_failed` surfaced.
- Integrity mismatch -> `backup_payload_integrity_mismatch`.

**Step 2: Run tests (fail)**

**Step 3: Minimal implementation**
- Parse package with `EncryptedBackupPackageV1Schema`.
- Call `decryptEncryptedBackupPackageV1`.
- Feed decrypted `VaultJsonExportV1` into same mapper used by Task 2.
- Keep attachments side-channel metadata for execution stage.

**Step 4: Re-run tests (pass)**

**Step 5: Commit**
- `git commit -m "feat(import): decrypt and parse vaultlite.backup.v1"`

---

### Task 5: Attachment import for backup restore path

**Files:**
- Modify: `apps/web/src/lib/vault-import.ts`
- Test: `apps/web/src/lib/vault-import.test.ts`

**Step 1: Write failing tests**
- Backup import with attachments uploads and finalizes to created item IDs.
- Duplicate row with safe correlation triggers `retry_missing_attachments_for_existing_item`.
- Missing destination mapping does not bind blindly.

**Step 2: Run tests (fail)**

**Step 3: Minimal implementation**
- Persist `sourceItemId -> destinationItemId` map during execution.
- Convert backup `vault.attachments[]` entries into executable attachment units using mapping.
- Reuse existing retry/idempotent upload/finalize pipeline.

**Step 4: Re-run tests (pass)**

**Step 5: Commit**
- `git commit -m "feat(import): restore backup attachments with safe item mapping"`

---

### Task 6: Error mapping and human UX polish

**Files:**
- Modify: `apps/web/src/components/settings/CsvImportWizardModal.vue`
- Test: `apps/web/src/components/settings/CsvImportWizardModal.test.ts`

**Step 1: Write failing tests**
- New backup errors map to human messages.

**Step 2: Run tests (fail)**

**Step 3: Minimal implementation**
- Extend `humanizeImportError()` with new codes from D4.
- Keep messaging non-technical.

**Step 4: Re-run tests (pass)**

**Step 5: Commit**
- `git commit -m "fix(import-ui): add human error mapping for backup import failures"`

---

### Task 7: Docs and card synchronization

**Files:**
- Modify: `docs/IMPORT_FORMATS.md`
- Modify: `docs/EXPORT_JSON_FORMAT.md`
- Modify: `docs/BACKUP_FORMAT.md`
- Modify: `status-card.md`

**Step 1: Write/adjust doc assertions tests (if present) or checklist**
- Ensure docs explicitly state:
  - VaultLite export is importable.
  - Backup import requires passphrase.
  - Attachment restore limitations and duplicate semantics.

**Step 2: Implement docs and card updates**
- Align P10 status/descriptions with actual implemented scope and pending gaps.

**Step 3: Commit**
- `git commit -m "docs(p10): document self-reimport semantics and sync status-card"`

---

### Task 8: End-to-end regression gate

**Files:**
- Test only

**Step 1: Run focused suites**
- `npm run test --workspace @vaultlite/web -- src/lib/vault-import.test.ts`
- `npm run test --workspace @vaultlite/web -- src/components/settings/CsvImportWizardModal.test.ts`
- `npm run test --workspace @vaultlite/web -- src/lib/data-portability.test.ts`
- `npm run typecheck --workspace @vaultlite/web`

**Step 2: Run broader regression**
- `npm run test --workspace @vaultlite/web`
- `npm run test --workspace @vaultlite/contracts`

**Step 3: Manual verification checklist**
- Import attached plaintext export file -> recognized + preview + import completes.
- Import attached backup file with the test passphrase used at generation time -> recognized + decrypt + preview + import completes.
- Wrong passphrase shows explicit human error and no mutation.
- Repeat import demonstrates deterministic duplicate handling.

**Step 4: Commit evidence update**
- `git commit -m "test(p10): add self-reimport validation coverage and evidence"`

---

## Acceptance Criteria (Done Definition)

1. `Import vault data` recognizes `vaultlite.export.v1` files and builds preview without format error.
2. `Import vault data` recognizes `vaultlite.backup.v1` files, requires passphrase, and decrypts successfully with correct passphrase.
3. Wrong backup passphrase fails safely with human-readable feedback and no side effects.
4. Backup attachments are restored via existing upload pipeline with deterministic mapping and no blind bind.
5. Duplicate semantics remain deterministic (`skip`, `retry_missing_attachments_for_existing_item`, `skipped_review_required`).
6. No sensitive material is persisted or logged from import decrypt path.
7. `status-card.md` and docs are aligned with implemented scope and test evidence.

---

## Risks and Mitigations

- **Risk:** ambiguous attachment target mapping in backup reimport.
  - **Mitigation:** require explicit `sourceItemId -> destinationItemId` map and refuse unresolved targets.

- **Risk:** passphrase handling leaks to storage/logs.
  - **Mitigation:** memory-only refs, explicit clearing, no log formatting with input payloads.

- **Risk:** card drift continues after code lands.
  - **Mitigation:** mandatory status-card update in Task 7 before closing PR.

---

## Security Review Checklist for This Plan

- Validate no new API endpoint is introduced for plaintext import.
- Verify import/decrypt path never sends plaintext payload to backend.
- Verify passphrase is not persisted in local storage / IndexedDB / telemetry.
- Verify error surfaces never include cryptographic internals.
- Verify attachment restore uses authenticated + CSRF-protected routes already in place.

---

## Deliverables

- Code updates in import engine + settings wizard.
- Updated tests proving self-reimport for plaintext export and encrypted backup.
- Updated docs (`IMPORT_FORMATS.md`, `EXPORT_JSON_FORMAT.md`, `BACKUP_FORMAT.md`).
- Updated `status-card.md` with synchronized P10 card scope and progress.
