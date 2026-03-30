# Extension Intelligent Assist and Autofill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add context-aware credential assist in the extension (inline suggestion, save/update login, heuristic fill, identity/card fill, TOTP assist) while keeping cache-first UX and bounded API cost.

**Architecture:** Keep extension as offline-first authority for UI render, then run detection/sync as background reconciliation. Introduce a deterministic pipeline: detect form context -> rank candidate credentials -> inline suggest/fill -> capture submit outcomes -> store form metadata and history -> synchronize with API/realtime. Use same-origin iframe support in V1, and keep cross-origin iframe as V2.

**Tech Stack:** Chrome MV3 extension (`background.js`, `content-script.js`, `popup.js`), Vue web app (`VaultShellPage.vue`), Cloudflare Workers API (`app.ts`, `realtime.ts`), D1/R2 storage adapters, Vitest.

---

### Task 1: Baseline tests and card scaffolding for Phase 13

**Files:**
- Modify: `status-card.md`
- Modify: `apps/extension/src/background-controller.test.ts`
- Modify: `apps/extension/src/fill-engine.test.ts`
- Modify: `apps/extension/src/popup-view-model.test.js`
- Modify: `apps/api/src/realtime.test.ts`

**Step 1: Write failing tests for target capabilities**
- Add failing tests covering:
  - inline suggestion trigger on login field focus,
  - same-origin iframe detection path,
  - post-submit save/update detection,
  - form metadata persistence,
  - no extra full-state fetch on neutral popup open.

**Step 2: Run tests to verify failure**

Run:
- `npm run test --workspace @vaultlite/extension -- background-controller.test.ts fill-engine.test.ts popup-view-model.test.js`
- `npm run test --workspace @vaultlite/api -- realtime.test.ts`

Expected:
- FAIL in new assertions.

**Step 3: Add/update status cards for execution tracking**
- Add Phase 13 cards in `status-card.md` (IDs and dependencies defined in this plan).

**Step 4: Re-run a focused subset**

Run:
- `npm run test --workspace @vaultlite/extension -- fill-engine.test.ts`

Expected:
- Still FAIL; scaffolding ready for implementation.

**Step 5: Commit**

```bash
git add status-card.md apps/extension/src/background-controller.test.ts apps/extension/src/fill-engine.test.ts apps/extension/src/popup-view-model.test.js apps/api/src/realtime.test.ts
git commit -m "test: add phase13 baseline regressions for inline assist and save-update flows"
```

---

### Task 2: Extension item editing parity as prerequisite

**Files:**
- Modify: `apps/extension/popup.js`
- Modify: `apps/extension/popup-view-model.js`
- Modify: `apps/extension/background.js`
- Modify: `apps/extension/src/popup-view-model.test.js`
- Modify: `apps/extension/src/background-controller.test.ts`

**Step 1: Write failing tests**
- Validate edit flow opens from popup details, stages field updates, validates required fields, and saves via API/background without full reload.

**Step 2: Run tests**

Run:
- `npm run test --workspace @vaultlite/extension -- popup-view-model.test.js background-controller.test.ts`

Expected:
- FAIL for edit scenarios.

**Step 3: Implement minimal edit flow**
- Reuse existing item schema paths from web contracts.
- Keep cache-first view (active snapshot visible while save in flight).

**Step 4: Run tests and typecheck**

Run:
- `npm run test --workspace @vaultlite/extension -- popup-view-model.test.js background-controller.test.ts`
- `npm run typecheck --workspace @vaultlite/extension`

Expected:
- PASS.

**Step 5: Commit**

```bash
git add apps/extension/popup.js apps/extension/popup-view-model.js apps/extension/background.js apps/extension/src/popup-view-model.test.js apps/extension/src/background-controller.test.ts
git commit -m "feat(extension): add item edit flow in popup detail view"
```

---

### Task 3: Change history with field-level diffs (including replaced values)

**Files:**
- Modify: `packages/contracts/src/*` (history contract types)
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/realtime.ts`
- Modify: `adapters/cloudflare-storage/src/index.ts`
- Modify: `apps/extension/background.js`
- Modify: `apps/extension/popup.js`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/extension/src/popup-view-model.test.js`

**Step 1: Write failing tests**
- API test: history entry includes `itemId`, `deviceId`, `changeType`, per-field `before`/`after`, timestamp.
- Extension test: history list renders diffs and requires explicit reveal interaction for sensitive fields.

**Step 2: Run tests**

Run:
- `npm run test --workspace @vaultlite/api -- app.test.ts`
- `npm run test --workspace @vaultlite/extension -- popup-view-model.test.js`

Expected:
- FAIL in history assertions.

**Step 3: Implement audited history pipeline**
- Persist change events at write time.
- Emit `vault.history.*` realtime event after commit.
- Keep sensitive diffs encrypted at rest and reveal only after local unlock.

**Step 4: Run tests**

Run:
- `npm run test --workspace @vaultlite/api -- app.test.ts`
- `npm run test --workspace @vaultlite/extension -- popup-view-model.test.js`

Expected:
- PASS.

**Step 5: Commit**

```bash
git add packages/contracts/src apps/api/src/app.ts apps/api/src/realtime.ts adapters/cloudflare-storage/src/index.ts apps/extension/background.js apps/extension/popup.js apps/api/src/app.test.ts apps/extension/src/popup-view-model.test.js
git commit -m "feat(history): add field-level item change history with secure reveal gating"
```

---

### Task 4: Form metadata model and sync contracts

**Files:**
- Modify: `packages/contracts/src/*` (form metadata schemas)
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/realtime.ts`
- Modify: `adapters/cloudflare-storage/src/index.ts`
- Modify: `apps/extension/background.js`
- Modify: `apps/extension/content-script.js`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/extension/src/fill-engine.test.ts`

**Step 1: Write failing tests**
- Persist/retrieve metadata by `(origin, formFingerprint, fieldRole)`.
- Sync metadata over realtime without reprocessing loops.
- No time-based TTL eviction; only replace when confidence improves or selector fails.

**Step 2: Run tests**

Run:
- `npm run test --workspace @vaultlite/api -- app.test.ts`
- `npm run test --workspace @vaultlite/extension -- fill-engine.test.ts`

Expected:
- FAIL.

**Step 3: Implement metadata storage and reconciliation**
- Add metadata upsert endpoint.
- Add realtime domain `form_metadata`.
- Extension captures successful fills/submits and upserts metadata asynchronously.

**Step 4: Run tests**

Run:
- same commands from step 2.

Expected:
- PASS.

**Step 5: Commit**

```bash
git add packages/contracts/src apps/api/src/app.ts apps/api/src/realtime.ts adapters/cloudflare-storage/src/index.ts apps/extension/background.js apps/extension/content-script.js apps/api/src/app.test.ts apps/extension/src/fill-engine.test.ts
git commit -m "feat(forms): add synchronized form metadata model for future fill ranking"
```

---

### Task 5: Inline suggestion anchor and mini-list UX

**Files:**
- Modify: `apps/extension/content-script.js`
- Modify: `apps/extension/bridge-content-script.js`
- Modify: `apps/extension/background.js`
- Modify: `apps/extension/src/fill-engine.test.ts`
- Modify: `apps/extension/src/background-controller.test.ts`

**Step 1: Write failing tests**
- Icon anchor appears in login inputs.
- On focus/click, inline mini-list opens with ranked suggestions.
- If no high-confidence match, inline search still works without opening popup.

**Step 2: Run tests**

Run:
- `npm run test --workspace @vaultlite/extension -- fill-engine.test.ts background-controller.test.ts`

Expected:
- FAIL.

**Step 3: Implement minimal inline assist**
- Inject input icon consistently.
- Render inline dropdown hosted by content script.
- Query background with current site context and typed username hint.

**Step 4: Run tests**

Run:
- same commands from step 2.

Expected:
- PASS.

**Step 5: Commit**

```bash
git add apps/extension/content-script.js apps/extension/bridge-content-script.js apps/extension/background.js apps/extension/src/fill-engine.test.ts apps/extension/src/background-controller.test.ts
git commit -m "feat(extension): add inline credential suggestion anchor and mini-list search"
```

---

### Task 6: Save login and update password post-submit flow

**Files:**
- Modify: `apps/extension/content-script.js`
- Modify: `apps/extension/background.js`
- Modify: `apps/extension/popup.js`
- Modify: `apps/extension/src/fill-engine.test.ts`
- Modify: `apps/extension/src/popup-view-model.test.js`

**Step 1: Write failing tests**
- Detect new credential submit for unknown domain/user.
- Detect password update for known account and open right-top prompt flow.
- Prompt action opens extension detail prefilled with new password and old-password reference.

**Step 2: Run tests**

Run:
- `npm run test --workspace @vaultlite/extension -- fill-engine.test.ts popup-view-model.test.js`

Expected:
- FAIL.

**Step 3: Implement submit-capture pipeline**
- Capture submit with guarded heuristics.
- Build candidate action (`create` or `update`) and show prompt.
- Require explicit user confirmation before persistence.

**Step 4: Run tests**

Run:
- same commands from step 2.

Expected:
- PASS.

**Step 5: Commit**

```bash
git add apps/extension/content-script.js apps/extension/background.js apps/extension/popup.js apps/extension/src/fill-engine.test.ts apps/extension/src/popup-view-model.test.js
git commit -m "feat(extension): add save-login and update-password post-submit prompts"
```

---

### Task 7: Aggressive heuristic fill engine v1 (same-origin iframe only)

**Files:**
- Modify: `apps/extension/src/fill-engine.ts`
- Modify: `apps/extension/content-script.js`
- Modify: `apps/extension/background.js`
- Modify: `apps/extension/src/fill-engine.test.ts`
- Modify: `apps/extension/src/origin-policy.test.ts`

**Step 1: Write failing tests**
- Rank candidates by favorite -> last-used -> username similarity -> domain score.
- Same-origin iframe fill path works.
- HTTP pages require extra confirmation before full fill.

**Step 2: Run tests**

Run:
- `npm run test --workspace @vaultlite/extension -- fill-engine.test.ts origin-policy.test.ts`

Expected:
- FAIL.

**Step 3: Implement heuristic engine constraints**
- Keep default behavior as suggestion + click-to-fill.
- Full autofill only when explicitly configured or when opening site from selected credential.
- Do not support cross-origin iframe in V1.

**Step 4: Run tests**

Run:
- same commands from step 2.

Expected:
- PASS.

**Step 5: Commit**

```bash
git add apps/extension/src/fill-engine.ts apps/extension/content-script.js apps/extension/background.js apps/extension/src/fill-engine.test.ts apps/extension/src/origin-policy.test.ts
git commit -m "feat(autofill): add aggressive heuristic ranking with same-origin iframe support"
```

---

### Task 8: Identity, address, card, and TOTP assist

**Files:**
- Modify: `apps/extension/src/fill-engine.ts`
- Modify: `apps/extension/content-script.js`
- Modify: `apps/extension/background.js`
- Modify: `apps/extension/popup.js`
- Modify: `apps/extension/src/fill-engine.test.ts`
- Modify: `apps/extension/src/popup-view-model.test.js`

**Step 1: Write failing tests**
- Identity/address fill for text/select/masked inputs.
- Card fill with user-selected card profile; CVV fill allowed after explicit card selection.
- TOTP inline suggestion and click-to-fill, with optional auto-fill mode controlled by setting.

**Step 2: Run tests**

Run:
- `npm run test --workspace @vaultlite/extension -- fill-engine.test.ts popup-view-model.test.js`

Expected:
- FAIL.

**Step 3: Implement fill profiles**
- Add typed field-role mapping for identity/address/card/otp.
- Keep explicit selection step before sensitive payment fill.

**Step 4: Run tests**

Run:
- same commands from step 2.

Expected:
- PASS.

**Step 5: Commit**

```bash
git add apps/extension/src/fill-engine.ts apps/extension/content-script.js apps/extension/background.js apps/extension/popup.js apps/extension/src/fill-engine.test.ts apps/extension/src/popup-view-model.test.js
git commit -m "feat(extension): add identity card and totp assisted fill profiles"
```

---

### Task 9: Allowlist/denylist controls and local telemetry

**Files:**
- Modify: `apps/extension/options.js`
- Modify: `apps/extension/background.js`
- Modify: `apps/extension/popup.js`
- Modify: `apps/extension/src/runtime-common.test.js`
- Modify: `apps/extension/src/background-controller.test.ts`
- Modify: `docs/SECURITY.md`
- Modify: `docs/ARCHITECTURE.md`

**Step 1: Write failing tests**
- Per-site allow/deny controls override heuristic behavior.
- Telemetry counters collect non-sensitive outcome metrics only (no credentials, no field values).

**Step 2: Run tests**

Run:
- `npm run test --workspace @vaultlite/extension -- runtime-common.test.js background-controller.test.ts`

Expected:
- FAIL.

**Step 3: Implement controls and telemetry**
- Add allowlist/denylist persistence and enforcement in fill pipeline.
- Add local telemetry schema: detection success rate, fill success rate, correction rate, prompt conversion.
- Keep telemetry local by default.

**Step 4: Run tests + docs consistency**

Run:
- `npm run test --workspace @vaultlite/extension -- runtime-common.test.js background-controller.test.ts`
- `rg -n "allowlist|denylist|telemetry|sensitive|credential|totp" docs/SECURITY.md docs/ARCHITECTURE.md`

Expected:
- PASS.

**Step 5: Commit**

```bash
git add apps/extension/options.js apps/extension/background.js apps/extension/popup.js apps/extension/src/runtime-common.test.js apps/extension/src/background-controller.test.ts docs/SECURITY.md docs/ARCHITECTURE.md
git commit -m "feat(extension): add allowlist-denylist and local non-sensitive telemetry"
```

---

### Task 10: End-to-end verification and call-budget guardrails

**Files:**
- Modify: `docs/quick-commands.md`
- Create: `docs/plans/2026-03-30-extension-intelligent-assist-and-autofill-validation.md`
- Modify: `status-card.md`

**Step 1: Define scenario matrix**
- Baseline scenarios:
  - login page with known credential,
  - unknown site with inline search and save prompt,
  - password change update prompt,
  - same-origin iframe form,
  - offline unlock and stale-cache render.

**Step 2: Run full suites**

Run:
- `npm run test --workspace @vaultlite/extension`
- `npm run test --workspace @vaultlite/api`
- `npm run test --workspace @vaultlite/web`
- `npm run typecheck --workspaces`

Expected:
- PASS.

**Step 3: Run manual smoke without HMR noise**
- `npm run dev:local`
- Execute scenario matrix and record endpoint counts per flow.

**Step 4: Save evidence and update cards**
- Write validation report.
- Update Phase 13 card statuses in `status-card.md` with evidence links.

**Step 5: Commit**

```bash
git add docs/quick-commands.md docs/plans/2026-03-30-extension-intelligent-assist-and-autofill-validation.md status-card.md
git commit -m "docs: add validation protocol and evidence template for phase13 assist features"
```

---

## Official references
- Chrome Extensions (MV3) architecture and service worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Chrome Extensions content scripts and host permissions: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- MDN form events and input handling: https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/submit_event
- MDN same-origin policy: https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy
- MDN `Request.cache` semantics: https://developer.mozilla.org/en-US/docs/Web/API/Request/cache
- 1Password `.1pux` data format reference: https://support.1password.com/1pux-format/
