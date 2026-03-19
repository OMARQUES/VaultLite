# Import Formats

Status: `active`

## Vault import (`P10-C01`)

Supported formats:
- `vaultlite_json_export_v1`
- `vaultlite_encrypted_backup_v1`
- `vaultlite_login_csv_v1`
- `bitwarden_csv_v1`
- `onepassword_1pux_v1`
- `bitwarden_json_v1`
- `bitwarden_zip_v1`

### `vaultlite_json_export_v1`

Detected from JSON payloads with:
- `version: "vaultlite.export.v1"`

Supported item types in this cycle:
- `login`
- `document`
- `secure_note`

Behavior:
- preserves `uiState` hints (`favorites` and folder assignment names) for imported rows
- unsupported item types are marked `unsupported_type`
- duplicate handling follows canonical `skip` policy

### `vaultlite_encrypted_backup_v1`

Detected from JSON payloads with:
- `version: "vaultlite.backup.v1"`

Requirements:
- backup passphrase is required in import wizard
- package is decrypted locally in-browser (no plaintext upload to backend)

Behavior:
- decrypted payload is processed using `vaultlite_json_export_v1` mapping
- attachment envelopes from backup are replayed through upload init/content/finalize
- wrong passphrase returns `backup_decrypt_failed`
- integrity mismatch returns `backup_payload_integrity_mismatch`

### `vaultlite_login_csv_v1`

Required header baseline:
- `title`
- `username`
- `password`

Optional headers:
- `url`
- `notes`
- `folder`
- `favorite`

Behavior:
- one row becomes one `login` item
- `favorite` accepts `1`, `true`, `yes`, `y`
- if `title` is empty and URL exists, title is derived from URL host

### `bitwarden_csv_v1`

Mapped headers:
- `name -> title`
- `login_username -> username`
- `login_password -> password`
- `login_uri -> url`
- `notes -> notes`
- `folder -> folder`
- `favorite -> favorite`

Rules:
- rows with `type != login` are skipped deterministically
- malformed rows are rejected per-row and included in import report

### `onepassword_1pux_v1`

Detected from ZIP-like package containing:
- `export.attributes`
- `export.data`

Supported types in this cycle:
- `login`
- `document`

Notes:
- `archived` is preserved via custom field `Imported archived=true`
- document attachments are resolved from `files/<documentId>__<fileName>`

### `bitwarden_json_v1`

Supported types in this cycle:
- `type=1` (`login`)
- `type=2` (`secure_note`)

Rejected:
- encrypted exports (`encrypted=true`) with `encrypted_export_not_supported`

### `bitwarden_zip_v1`

Uses JSON base payload + attachment files from ZIP.

Attachment matching order:
1. exact `attachment.id`
2. `attachments/<itemId>/<fileName>`
3. `attachments/<fileName>` only when unique

If ambiguous:
- row/attachment is reported as `ambiguous_attachment_path`

## Import limits

- max file size: `300 MB`
- max uncompressed archive bytes: `600 MB`
- max ZIP entries: `20000`
- max importable items per run: `2000`
- max attachments per run: `1000`
- max attachment size: `25 MB`
- max in-memory working set: `120 MB`

## Duplicate policy

Policy: `skip`

Keys:
- login: `login|normalized(title)|normalized(username)|normalized(first_url)`
- secure note: `secure_note|normalized(title)|sha256(normalized(content))`
- document primary: `document|normalized(title)|attachmentSha256`
- document fallback: `document|normalized(title)|normalized(fileName)|size|sourceFormat|sourceItemId`

When document key is not safely derivable:
- preview status: `possible_duplicate_requires_review`
- execution status: `skipped_review_required`

Duplicates are skipped both:
- within the import file
- against existing items in the current vault

## Reimport of missing attachments

If an item is duplicate but attachment upload failed in a previous execution:
- import can retry attachment binding as `retry_missing_attachments_for_existing_item`
- correlation is strict: `sourceRef + sourceItemId + dedupeKey + attachmentFingerprint`
- execution history is stored locally per `deploymentFingerprint + username` with 30-day retention
