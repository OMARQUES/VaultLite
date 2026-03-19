# Encrypted Backup Package Format

Status: `active`
Version: `vaultlite.backup.v1`

## Goal

Provide a portable encrypted package with deterministic metadata and strong cryptographic defaults.

## Envelope

```json
{
  "version": "vaultlite.backup.v1",
  "createdAt": "ISO-8601",
  "source": {
    "app": "vaultlite-web",
    "schemaVersion": 1,
    "username": "alice",
    "deploymentFingerprint": "development_deployment"
  },
  "manifest": {
    "itemCount": 0,
    "tombstoneCount": 0,
    "uiStateIncluded": true,
    "attachmentMode": "none",
    "attachmentCount": 0,
    "attachmentBytes": 0
  },
  "kdf": {
    "algorithm": "argon2id",
    "memory": 65536,
    "passes": 3,
    "parallelism": 1,
    "dkLen": 32,
    "salt": "base64url"
  },
  "encryption": {
    "algorithm": "aes-256-gcm",
    "nonce": "base64url",
    "aad": "vaultlite.backup.v1"
  },
  "payload": {
    "ciphertext": "base64url",
    "authTag": "base64url",
    "plaintextSha256": "base64url"
  },
  "vault": {
    "attachments": []
  }
}
```

## Cryptography

- KDF: `Argon2id`
- Cipher: `AES-256-GCM`
- AAD: fixed string `vaultlite.backup.v1`
- Integrity: `payload.plaintextSha256` over canonical plaintext export bytes

## Attachment policy (`P10-C04`)

Supported modes:
- `attachmentMode: none`
- `attachmentMode: inline_encrypted_blobs`

When `inline_encrypted_blobs`:
- only lifecycle `attached` entries are included
- each entry keeps the original encrypted envelope (no decrypt/re-encrypt)
- each attachment entry includes:
  - `uploadId`
  - `itemId`
  - `fileName`
  - `contentType`
  - `size`
  - `uploadedAt`
  - `attachedAt`
  - `envelope`
  - `envelopeSha256`

## Size guardrails

- hard limit: `500 MB` (`backup_size_limit_exceeded`)
- deterministic preflight estimate is applied before package generation
- final serialized package is validated against the same limit

## Validation expectations

- wrong passphrase fails decryption
- mismatched `plaintextSha256` fails integrity validation
- unsupported package version fails closed
