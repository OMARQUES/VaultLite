# Export JSON Format

Status: `active`
Version: `vaultlite.export.v1`

## Purpose

Deterministic plaintext export for portability and tooling.

This format is intentionally plaintext.
Treat exported files as sensitive.

## Top-level shape

```json
{
  "version": "vaultlite.export.v1",
  "exportedAt": "ISO-8601",
  "source": {
    "app": "vaultlite-web",
    "schemaVersion": 1,
    "username": "alice",
    "deploymentFingerprint": "development_deployment"
  },
  "vault": {
    "items": [],
    "tombstones": [],
    "counts": {
      "items": 0,
      "tombstones": 0
    }
  },
  "uiState": null
}
```

## Determinism rules

- object keys are serialized in canonical sorted order
- item arrays are sorted by `itemId`
- tombstones are sorted by `itemId`
- if enabled, `uiState.favorites` is sorted and deduplicated

## Item payloads

`vault.items[].payload` is the decrypted vault payload for each item type.
No server-side plaintext is required for this operation.

## Optional sections

- `vault.tombstones`: included only when requested by user
- `uiState`: included only when requested by user
