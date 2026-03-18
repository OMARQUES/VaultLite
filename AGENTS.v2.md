# AGENTS.md

## Project

VaultLite is an open source, zero-knowledge, Cloudflare-first password manager for personal use, family, friends, and other known trusted users.

It is not an enterprise product.
It is not a multi-tenant SaaS.
It is not trying to be a general-purpose admin platform.

Core stack:
- Web app: Vue 3 + TypeScript
- API: Cloudflare Workers
- Metadata: D1
- Blob storage: R2
- Extension: separate browser extension, currently out of scope for the active web redesign round

## Active source of truth order

When implementing the current product, use this order of authority:

1. `AGENTS.md`
2. `docs/PRD.md`
3. `docs/SECURITY.md`
4. `docs/THREAT_MODEL.md`
5. `docs/ARCHITECTURE.md`
6. `docs/UI_STYLE.md`
7. `docs/WEB_UI_EXECUTION.md`
8. `status-card.md`

Anything under `docs/archive/` is historical context only.
Do not treat archived plans or reviews as active implementation instructions.

## Non-negotiable product rules

- The server never decrypts vault data.
- The server never decrypts attachment data.
- The owner/admin never gets cryptographic access to another user's vault.
- There is no master-password recovery.
- Account Kit is for onboarding, trusted-device bootstrap, and controlled reissue only.
- Search is local-only.
- Attachments are encrypted on the trusted client before upload.
- The product is owner-deployed, single-tenant per deployment, with multiple invited users and one primary private vault per user.

## Canonical terminology

Use these terms exactly:
- `remote authentication`
- `local unlock`
- `session restoration`
- `expected_bundle_version`
- `deprovisioned`

Do not blur or rename these concepts in code, docs, tests, or UI.

## Active web redesign rules

Current redesign scope is web only.
The authenticated product focus is:
- `Vault`
- `Settings`

Do not introduce dead navigation for:
- `Devices`
- `Import / Export`
- `Admin`

unless there is a real implemented surface and the current execution doc explicitly allows it.

Do not introduce active navigation for future item types that do not have real CRUD in this round.
That means:
- no `Cards` nav item
- no `Notes` nav item

## Implementation style

- Use planning first for structural work.
- Prefer small, reviewable changes.
- Do not do broad refactors outside the active step.
- Do not invent abstractions early.
- Do not create components or routes “for later” without an active need.
- Preserve separation between `domain`, `crypto`, `contracts`, `adapters`, and `apps`.
- Never move sensitive crypto trust to the server.

## UI/UX rules

- The UI must stay minimal and task-oriented.
- No dashboard-first authenticated experience.
- No explanatory microcopy unless it is required for an immediate user decision.
- No scaffold-style panels, status cards, or decorative technical blocks in the vault.
- `/vault` is the authenticated landing surface.
- Sensitive actions live in `/settings`, not in `/vault`.
- Mobile-first behavior is structural, not cosmetic.

## Security rules

- Never send the master password in plaintext.
- Never store auth/session secrets in LocalStorage.
- Never put master password, password-reset secrets, or admin tokens into Account Kit.
- Follow the signed/authenticity rules for Account Kit.
- Keep attachment lifecycle explicit.
- Keep lifecycle states canonical.

## Testing rules

Test-first is mandatory for:
- crypto
- auth
- sync
- password rotation

At minimum, critical flows require:
- unit tests
- integration tests
- e2e where the flow is user-critical and UI-visible

Smoke tests are acceptable for:
- scaffolding
- shell wiring
- package wiring
- initial layout shells

## If there is ambiguity

Do not improvise.
Use the most conservative interpretation of the active docs.
If active docs conflict, stop and report the conflict before implementing.
