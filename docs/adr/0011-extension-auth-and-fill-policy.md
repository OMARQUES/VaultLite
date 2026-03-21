# ADR 0011: Extension Auth, Session, and Manual Fill Policy

- Status: Accepted
- Date: 2026-03-19

## Context
Phase 11 introduces a Chromium MV3 browser extension as a new client. The existing system is web-cookie centric and needs explicit extension boundaries for pairing, session restore, credential listing, and manual fill.

## Decision
- Target browser scope is Chromium MV3.
- First trust is website-assisted pairing; extension does not import Account Kit directly in this cycle.
- Pairing uses one-time code with short TTL (`10 min`), hash-at-rest challenge, atomic single-use consumption, and rate limiting.
- Pairing context is bound to `deploymentFingerprint` and canonical `serverOrigin`.
- Extension session uses opaque bearer token (server-side lookup), scope `extension`, audience `vaultlite-extension`.
- Extension bearer allowlist for Phase 11 is limited to:
  - `GET /api/auth/session/restore`
  - `GET /api/sync/snapshot`
- Extension bearer TTL is short (`30 min`) with rotation on restore when remaining TTL is `<10 min`.
- Extension restore never bypasses `local unlock`; it only re-establishes authenticated extension session state.
- Phase 11 listing reuses `/api/sync/snapshot`; the extension background projects payload to a minimal popup view model.
- Manual fill authorization is exact canonical origin match (`scheme + host + normalized port`), conservative by default.
- `eTLD+1` is ranking-only and never sufficient to authorize fill.
- Fill V1 is user-triggered only (`username + password`), top-level context only, no autosubmit.
- Background is the only sensitive authority in MV3; popup/options/content-script run with lower privilege and no direct token/unlock-state access.

## Consequences
- New API endpoints are required for extension pairing init/complete.
- Storage gains `extension_pairings` lifecycle data and tests for replay/race behavior.
- Extension runtime must enforce capability boundaries by context and explicit message contracts.
- Status/evidence for `P11-C01`/`P11-C02`/`P11-C03` must include storage compliance, allowlist enforcement, and fill no-op safety for unsupported contexts.
