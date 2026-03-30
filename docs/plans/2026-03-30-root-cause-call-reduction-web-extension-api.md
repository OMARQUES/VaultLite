# Root Cause Call Reduction (Web + Extension + API) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate unnecessary API calls caused by duplicated icon-state triggers, discovery queue churn, and password-history over-fetch while keeping UI cache-first and realtime-consistent.

**Architecture:** Keep WebSocket as primary sync signal, treat HTTP state endpoints as bounded reconciliation, and enforce single-flight/cooldown gates per data domain. Queue processing remains async and idempotent, but client-side revalidation must not fan out while queue is actively publishing incremental changes.

**Tech Stack:** Chrome extension background/popup (JS), Vue web app (TS), Cloudflare Workers API + Queues.

---

### Task 1: Baseline and observability for the 3 root factors

**Files:**
- Modify: `apps/extension/background.js`
- Modify: `apps/extension/popup.js`
- Modify: `apps/web/src/pages/VaultShellPage.vue`
- Modify: `apps/web/src/components/vault/PasswordGeneratorPopover.vue`
- Test: `apps/extension/src/popup-view-model.test.js`
- Test: `apps/web/src/pages/VaultShellPage.test.ts`

**Step 1: Add explicit reason tags to each refresh path**
- Add structured debug counters/reason codes for:
  - `icons_state` fetch origin: `popup_list_open`, `realtime_resync`, `cooldown_bypass`, `manual_icon_event`.
  - `password_history` fetch origin: `history_panel_open`, `realtime_password_history`, `cold_start_empty_cache`.
- Keep instrumentation behind existing debug logging patterns.

**Step 2: Add tests for reason-source accounting**
- Extension tests: validate that each trigger sets expected reason.
- Web tests: validate foreground interactions do not trigger icon refresh reason.

**Step 3: Run focused tests**
- `npm run test --workspace @vaultlite/web -- VaultShellPage.test.ts`
- `npm run test --workspace @vaultlite/extension -- popup-view-model.test.js`

**Step 4: Commit**
- `git add ...`
- `git commit -m "test: add refresh-origin instrumentation for icon and history sync"`

### Task 2: Remove duplicate `icons/state` trigger race (extension)

**Files:**
- Modify: `apps/extension/background.js`
- Modify: `apps/extension/popup.js`
- Test: `apps/extension/src/popup-view-model.test.js`

**Step 1: Write failing tests**
- Opening popup while realtime reconnects should produce at most one `icons/state` reconciliation in cooldown window.
- Realtime `resync_required` within cooldown should coalesce into existing in-flight reconciliation.

**Step 2: Add global dedupe gate for `icons_state` reconciliation**
- Introduce a domain-level reconciler key for icon-state in background.
- Merge popup-driven and realtime-driven reconciliation requests into one single-flight queue.
- Preserve cooldown semantics across both sources (shared timestamp, not per-source timestamp).

**Step 3: Ensure popup does not force a second icon hydration immediately after WS connect**
- In popup refresh flow, if a recent/in-flight icon reconcile exists, reuse it instead of triggering list-side hydration path.

**Step 4: Re-run tests and verify**
- No `icons/state` double call in short interval after reconnect/open.

**Step 5: Commit**
- `git commit -m "fix(extension): coalesce popup and realtime icon-state reconciliations"`

### Task 3: Stop queue-driven icon revalidation churn on client

**Files:**
- Modify: `apps/extension/background.js`
- Modify: `apps/web/src/pages/VaultShellPage.vue`
- Modify: `apps/api/src/realtime.ts` (only if domain granularity/event payload adjustment is required)
- Test: `apps/web/src/pages/VaultShellPage.test.ts`

**Step 1: Write failing tests**
- During active icon discovery window, repeated icon events should not trigger full `icons/state` fetch every ~10s.
- Only one reconciliation per cooldown window unless critical condition applies.

**Step 2: Apply queue-aware reconciliation policy**
- Add stateful gate in clients:
  - If reconciliation already succeeded recently and websocket is healthy, ignore repeated queue-driven icon events for full-state pull.
  - Keep lightweight local updates from event payload when possible.
- Keep one periodic fallback reconciliation only when stale threshold is exceeded.

**Step 3: Validate no UX regression**
- Icons remain visible (stale-if-error visual behavior).
- No skeleton/list disruption while queue is draining.

**Step 4: Commit**
- `git commit -m "fix(icons): reduce queue-driven full-state revalidation churn"`

### Task 4: Tighten password-history sync gates (web + extension)

**Files:**
- Modify: `apps/extension/background.js`
- Modify: `apps/extension/popup.js`
- Modify: `apps/web/src/components/vault/PasswordGeneratorPopover.vue`
- Add: `apps/web/src/lib/password-generator-history-cache.ts` (if not already tracked)
- Test: `apps/web/src/components/vault/PasswordGeneratorPopover.vue`
- Test: `apps/extension/src/popup-view-model.test.js`

**Step 1: Write failing tests**
- Generating passwords should not trigger immediate repeated `GET /api/password-generator/history` bursts.
- Opening generator/history panel with warm cache should not fetch within cooldown.

**Step 2: Enforce deterministic sync matrix**
- `GET history` only when:
  - cold start with empty cache, or
  - explicit history panel open and cache stale, or
  - realtime `password_history.*` from other device and cache stale/inconsistent.
- After local upsert, update local cache first and avoid immediate full GET.

**Step 3: Deduplicate cross-surface refresh**
- If extension and web are both open, avoid both performing forced full history fetch on same short window by using cooldown + in-flight reuse.

**Step 4: Commit**
- `git commit -m "fix(password-history): prevent short-burst reloads after local updates"`

### Task 5: Final verification in non-HMR run

**Files:**
- Modify: `docs/quick-commands.md` (optional, if adding measurement recipe)

**Step 1: Run scenario exactly matching observed pain**
- bootstrap -> web login -> import 1Password -> pair extension -> extension unlock -> extension/web password generation.

**Step 2: Collect endpoint budgets**
- Target acceptance for scenario:
  - `icons/state`: no immediate duplicated calls from concurrent triggers.
  - `password-generator/history`: no read burst right after local upserts.
  - queue activity does not force repeated full-state client pulls while websocket healthy.

**Step 3: Save results**
- Record counts and deltas per endpoint in log notes.

**Step 4: Commit**
- `git commit -m "chore: document and verify call-budget acceptance for sync flows"`

### Task 6: Security and regression review

**Files:**
- Review only (no mandatory edits)

**Step 1: Validate auth/session boundaries**
- Ensure gating logic never bypasses authorization or stale token handling.
- Ensure local cache usage does not expose manual-private icon payloads outside intended scope.

**Step 2: Validate realtime resilience**
- Confirm reconnect still converges without hard refresh loops.

**Step 3: Commit (if any review fixes needed)**
- `git commit -m "fix(sync): preserve auth-safe reconciliation while reducing call volume"`

