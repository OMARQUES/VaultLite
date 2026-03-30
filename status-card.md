# Status Card

Project: `VaultLite`
Source of truth: `AGENTS.v2.md` + `docs/UI_STYLE.v2.md` + `docs/WEB_UI_EXECUTION.md` + `docs/PRD.md` + `docs/SECURITY.md` + `docs/THREAT_MODEL.md` + `docs/ARCHITECTURE.md` + `status-card.md`
Status card version: `2026-03-30-v2.3.1-r21`
Last updated: `2026-03-30`
Overall status: `phase12_in_progress`
Canonical terminology: `remote authentication`, `local unlock`, `session restoration`, `expected_bundle_version`, `deprovisioned`

## Legend

- `not_started`: card exists but work has not begun
- `in_progress`: active implementation or documentation work is underway
- `blocked`: cannot proceed because a dependency or gate is unresolved
- `review_needed`: implementation exists and needs review or validation
- `done`: card exit criteria and evidence are complete

## How to use this file

- This file is the operational execution and handoff companion to the active baseline docs.
- Use the active docs for architecture, scope boundaries, and invariants. Use this file for current status, execution order, acceptance tracking, and handoff state.
- For the active web UI redesign, treat `AGENTS.v2.md`, `docs/UI_STYLE.v2.md`, and `docs/WEB_UI_EXECUTION.md` as coercive baseline docs.
- Any dev actively executing cards must update this file as work progresses. It is not a passive summary.
- Update `Current Focus` before starting a new card or when a blocker changes the active path.
- Change a card to `in_progress` only when work has actually started in the repo or in the referenced docs.
- Change a card to `review_needed` when implementation or documentation exists but acceptance checks or evidence are still pending review.
- Change a card to `done` only when acceptance criteria, required tests, and evidence are all satisfied.
- Use `Decision Log` for execution-relevant decisions, clarifications, or scope-tightening choices that future devs would otherwise have to rediscover.
- If this file conflicts with another active doc, follow `AGENTS.v2.md` and the active docs baseline, then update this file to match.

## Update rules

- Update a card status in the same change set that introduces the work, test, or doc evidence.
- Use `blocked` only when a concrete dependency, gate, missing artifact, or unresolved decision prevents safe progress.
- When a card becomes `blocked`, add the blocking reason to the card body or `Notes for Codex/dev`, and if the blocker changes execution order, update `Current Focus`.
- Create a `Decision Log` entry when a work-relevant decision changes execution order, clarifies ambiguity, narrows an implementation path, or records an intentional out-of-scope boundary.
- Do not create `Decision Log` entries for trivial progress updates.
- For partially completed cards, keep the status as `in_progress` or `review_needed`; do not mark `done` if a required test, artifact, or evidence item is still missing.
- Preserve card IDs exactly. Do not rename IDs casually, and do not reuse an ID for a different scope.
- Preserve status vocabulary exactly as defined in `Legend`.
- Preserve canonical terminology exactly: `remote authentication`, `local unlock`, `session restoration`, `expected_bundle_version`, `deprovisioned`.
- If a new card is added later, place it in the correct phase, keep the existing ID pattern, and add it both to the phase section and to `Index of Cards`.

## Ready-to-start checklist

- `GG-01`, `GG-02`, and `GG-03` are understood as active blockers for sensitive implementation.
- The active dev has read `AGENTS.v2.md`, this file, and the active baseline docs listed in `Source of truth`.
- `Current Focus` points to the real next card instead of stale historical state.
- The target card's dependencies are either `done` or intentionally accepted as non-blocking by the latest plan.
- Required baseline docs exist or are the explicit target of the current work: `docs/PRD.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/THREAT_MODEL.md`, and ADRs when required.
- Repository hygiene is present: `.gitignore` exists, workspace root is readable, and the dev knows which files or areas the card is allowed to touch.
- Environment assumptions for the current card are known: package manager, test runner, and any Cloudflare-specific bindings or local mocks needed for validation.
- The dev knows what evidence will be required to mark the current card `done`.

## Global Gates

Global gates are transversal blockers. They are not a normal execution phase and must be satisfied before sensitive implementation proceeds.

### GG-01 - Threat model and architectural gate
Card ID: `GG-01`
Title: `Threat model and architectural gate`
Phase/Epic: `Global Gates`
Status: `done`
Priority: `P0`
Objective: Establish the minimum threat model required to unlock auth, storage, sync, and attachment implementation.
Description: Create the initial threat model and align it with the plan and security invariants.
Motivation: The plan explicitly requires a threat model before sensitive architecture work.
Scope includes: `docs/THREAT_MODEL.md`; attacker assumptions; trusted device theft; Account Kit theft; browser compromise; sync and deletion safety.
Out of scope: Release-only hardening details; implementation-specific mitigations beyond the baseline.
Dependencies: None.
Files/areas impacted: `docs/THREAT_MODEL.md`; `docs/SECURITY.md`; `docs/ARCHITECTURE.md`.
Deliverables: Initial threat model document and cross-links from architecture and security docs.
Required tests: Verify `docs/THREAT_MODEL.md` covers every item listed under the plan's Threat Model Gate; run `rg -n "remote authentication|local unlock|session restoration|expected_bundle_version|deprovisioned" docs/THREAT_MODEL.md docs/SECURITY.md docs/ARCHITECTURE.md` to confirm canonical term alignment where relevant.
Acceptance criteria: Threat model exists; covers required scenarios; is referenced by the architecture baseline.
Risks / cautions: A weak threat model will leak into auth, storage, and Account Kit design.
Notes for Codex/dev: Do not collapse this into a checklist; treat it as a design input.
Evidence required to mark done: Committed `docs/THREAT_MODEL.md`, explicit cross-links from `docs/SECURITY.md` and `docs/ARCHITECTURE.md`, and a checked coverage pass against the threat list from the plan.
Suggested next action: Start `P0-C04`.

### GG-02 - ADR baseline gate
Card ID: `GG-02`
Title: `ADR baseline gate`
Phase/Epic: `Global Gates`
Status: `done`
Priority: `P0`
Objective: Freeze the mandatory ADR set required by the current plan.
Description: Author ADRs 0001 through 0010 and align them with canonical terminology.
Motivation: The plan forbids sensitive implementation before ADR approval.
Scope includes: Deployment; crypto; auth and session model; search; sync; local storage; Account Kit; attachments; password rotation; deployment and user model.
Out of scope: Post-V1 ADRs or speculative portability work outside current scope.
Dependencies: `GG-01` should inform the ADRs; cards `P0-C06` through `P0-C15` implement this gate.
Files/areas impacted: `docs/adr/*.md`.
Deliverables: Ten ADRs with clear decisions and constraints.
Required tests: Review each ADR against the corresponding plan section and run `rg -n "remote authentication|local unlock|session restoration|expected_bundle_version|deprovisioned" docs/adr` to confirm canonical vocabulary is preserved.
Acceptance criteria: ADR set exists and no sensitive plan section remains under-specified.
Risks / cautions: Inconsistent ADRs will break contracts and create rework.
Notes for Codex/dev: Preserve canonical terms exactly; do not improvise alternate auth or lifecycle vocabulary.
Evidence required to mark done: Committed ADR files `0001` through `0010`, each with decision, rationale, constraints, and consequences, plus a quick consistency pass against `AGENTS.md` and the latest plan.
Suggested next action: Execute `P0-C06` to `P0-C15` in order.

### GG-03 - Security baseline docs gate
Card ID: `GG-03`
Title: `Security baseline docs gate`
Phase/Epic: `Global Gates`
Status: `done`
Priority: `P0`
Objective: Establish baseline PRD, security, and architecture documents before implementation.
Description: Produce the core docs that the rest of the repo will rely on.
Motivation: The repo needs a stable narrative and security baseline before code starts.
Scope includes: `docs/PRD.md`; `docs/SECURITY.md`; `docs/ARCHITECTURE.md`.
Out of scope: Release operations, final go/no-go, or implementation details that belong in later phases.
Dependencies: None.
Files/areas impacted: `docs/PRD.md`; `docs/SECURITY.md`; `docs/ARCHITECTURE.md`.
Deliverables: Baseline documents aligned with the current plan and `AGENTS.md`.
Required tests: Cross-check `docs/PRD.md`, `docs/SECURITY.md`, and `docs/ARCHITECTURE.md` against the latest plan and run `rg -n "remote authentication|local unlock|session restoration|expected_bundle_version|deprovisioned" docs/PRD.md docs/SECURITY.md docs/ARCHITECTURE.md`.
Acceptance criteria: Docs exist; do not contradict the plan; use canonical terminology.
Risks / cautions: Contradictory docs create incorrect prompts and bad implementation drift.
Notes for Codex/dev: Keep docs minimal but explicit; do not write speculative enterprise content.
Evidence required to mark done: Committed baseline docs, explicit references to the current plan in each, and term-consistency search results reviewed.
Suggested next action: Start `P0-C01`, then `P0-C02`, then `P0-C03`.

## Current Focus

Active phase: `Phase 12 - Final Hardening and Release Readiness`
Active card: `P12-C01 - Threat-model review update`
Global gates still blocking sensitive implementation: `none`
Reason: `P11` extension baseline has been stabilized in repo with LTS pairing, unlock/session continuity, bridge hardening, and manual-icon flows; execution focus is now release hardening and threat-model reconciliation.
Suggested immediate sequence: `P12-C01` -> `P12-C04` -> `P12-C05` -> `P12-C02` -> `P12-C06` -> `P12-C07` -> `P12-C08` -> `P12-C03`.
Post-Phase-12 queued sequence: `P13-C01` -> `P13-C02` -> `P13-C03` -> `P13-C04` -> `P13-C05` -> `P13-C06` -> `P13-C07` -> `P13-C08` -> `P13-C09` -> `P13-C10` -> `P13-C11`.
## Index of Cards

- `GG-01` Threat model and architectural gate — `done`
- `GG-02` ADR baseline gate — `done`
- `GG-03` Security baseline docs gate — `done`
- `P0-C01` PRD baseline review and normalization — `done`
- `P0-C02` SECURITY.md baseline — `done`
- `P0-C03` ARCHITECTURE.md baseline — `done`
- `P0-C04` THREAT_MODEL.md initial gate — `done`
- `P0-C05` Execution gate checklist scaffold — `done`
- `P0-C06` ADR 0001 deployment target — `done`
- `P0-C07` ADR 0002 crypto profile — `done`
- `P0-C08` ADR 0003 auth protocol and session model — `done`
- `P0-C09` ADR 0004 search model — `done`
- `P0-C10` ADR 0005 sync conflict policy — `done`
- `P0-C11` ADR 0006 local storage policy — `done`
- `P0-C12` ADR 0007 Account Kit lifecycle and integrity — `done`
- `P0-C13` ADR 0008 attachment lifecycle and backup — `done`
- `P0-C14` ADR 0009 password rotation invariants — `done`
- `P0-C15` ADR 0010 deployment owner user vault model — `done`
- `P1-C01` Root monorepo bootstrap — `done`
- `P1-C02` Root tooling and scripts — `done`
- `P1-C03` Repository hygiene and `.gitignore` — `done`
- `P1-C04` Package boundary skeleton — `done`
- `P1-C05` Adapter skeleton — `done`
- `P1-C06` App skeletons — `done`
- `P2-C01` Contracts package foundation — `done`
- `P2-C02` Domain entities foundation — `done`
- `P2-C03` Canonical shared terminology and states — `done`
- `P2-C04` API contract baseline — `done`
- `P3-C01` KDF primitives and parameters — `done`
- `P3-C02` Account Key generation — `done`
- `P3-C03` Vault envelope format — `done`
- `P3-C04` Blob envelope format — `done`
- `P3-C05` Crypto test vectors — `done`
- `P3-C06` Versioned ciphertext helpers — `done`
- `P3-C07` Account Kit canonical payload helpers — `done`
- `P3-C08` Account Kit signature helpers — `done`
- `P4-C01` Migration baseline — `done`
- `P4-C02` Repository interfaces — `done`
- `P4-C03` Cloudflare storage adapters — `done`
- `P4-C04` API route skeleton — `done`
- `P4-C05` Auth-adjacent rate limiting and anti-enumeration hooks — `done`
- `P4-C06` Migration validation tests — `done`
- `P4-C07` Account lifecycle enforcement hooks — `done`
- `P4-C08` Session middleware security baseline — `done`
- `P4-C09` Local Worker runtime configuration — `done`
- `P5-C01` Invite issuance — `done`
- `P5-C02` Onboarding client flow — `done`
- `P5-C03` Account creation persistence and initial device registration — `done`
- `P5-C04` New-device bootstrap — `done`
- `P5-C05` Trusted session issuance — `done`
- `P5-C06` remote authentication vs local unlock contract separation — `done`
- `P5-C07` Account Kit generation and export — `done`
- `P5-C08` Account Kit reissue flow — `done`
- `P5-C09` Account Kit signature verification on import — `done`
- `P5-C10` Zero-recovery messaging — `done`
- `P6-C01` Vue app shell — `done`
- `P6-C02` Route guards — `done`
- `P6-C03` Session store — `done`
- `P6-C04` Secure local cache — `done`
- `P6-C05` Auto-lock behavior — `done`
- `P6-C06` local unlock flow — `done`
- `P6-C07` session restoration flow — `done`
- `P6-C08` CSP and security header integration — `done`
- `P6-C09` CSRF-protected mutable request flow — `done`
- `P6-C10` Vite `/api` local proxy — `done`
- `P6-C11` Local web + API end-to-end smoke flow — `done`
- `P7-C01` Login item CRUD — `done`
- `P7-C02` Document item CRUD — `done`
- `P7-C03` Tombstones — `done`
- `P7-C04` Local decrypted index — `done`
- `P7-C05` Password generator — `not_started`
- `P75-C01` Visual direction and tokens — `done`
- `P75-C02` Core layout and navigation patterns — `done`
- `P75-C03` Form, feedback, and destructive-action patterns — `done`
- `P75-C04` Responsive and accessibility pass for web core — `done`
- `P8-C01` Upload initialization and `pending` records — `done`
- `P8-C02` Encrypted upload — `done`
- `P8-C03` Finalize bind to item — `not_started`
- `P8-C04` Encrypted download — `not_started`
- `P8-C05` Attachment deletion — `not_started`
- `P8-C06` Orphan cleanup strategy implementation — `not_started`
- `P8-C07` Document UX — `done`
- `P8-C08` Quota and cost warning UI — `not_started`
- `P9-C01` Sync service baseline — `done`
- `P9-C02` Deterministic conflict handling — `done`
- `P9-C03` Device listing — `done`
- `P9-C04` Device revocation — `done`
- `P9-C05` Password rotation atomic flow — `done`
- `P9-C06` Security hardening remediation pack (8 audit findings) — `done`
- `P95-C01` User listing and status view — `done`
- `P95-C02` Suspend endpoint and UI — `done`
- `P95-C03` Reactivate endpoint and UI — `done`
- `P95-C04` Deprovision endpoint and UI — `done`
- `P95-C05` Session revocation and trusted-device invalidation on lifecycle change — `done`
- `P95-C06` Lifecycle regression tests — `done`
- `P10-C01` Vault import baseline — `done`
- `P10-C02` JSON export — `done`
- `P10-C03` Encrypted backup package format — `done`
- `P10-C04` Attachment-inclusive manifest — `done`
- `P10-C05` Restore format docs — `done`
- `P10-C06` Backup validation tests — `done`
- `P11-C01` Extension unlock — `done`
- `P11-C02` Credential listing — `done`
- `P11-C03` Manual fill — `done`
- `P12-C01` Threat-model review update — `not_started`
- `P12-C02` OPERATIONS.md — `not_started`
- `P12-C03` RELEASE.md — `not_started`
- `P12-C04` Secret scanning verification — `not_started`
- `P12-C05` Dependency audit verification — `not_started`
- `P12-C06` Environment validation — `not_started`
- `P12-C07` Residual risk log — `not_started`
- `P12-C08` Release go/no-go checklist — `not_started`
- `P13-C01` Extension item edit parity — `not_started`
- `P13-C02` Item change history with field-level diff visibility — `not_started`
- `P13-C03` Form metadata capture and sync contracts — `not_started`
- `P13-C04` Inline field suggestion anchor (content-script) — `not_started`
- `P13-C05` Inline mini-search and ranked credential suggestion tray — `not_started`
- `P13-C06` Save login and update password post-submit prompts — `not_started`
- `P13-C07` Heuristic autofill engine v1 (same-origin iframe) — `not_started`
- `P13-C08` Identity/address/card fill profiles v1 — `not_started`
- `P13-C09` TOTP suggestion and fill assist — `not_started`
- `P13-C10` Site allowlist and denylist controls — `not_started`
- `P13-C11` Local non-sensitive assist telemetry — `not_started`
- `P13-C12` Cross-origin iframe fill support v2 — `not_started`

## Phase 0

### P0-C01 - PRD baseline review and normalization
Card ID: `P0-C01`
Title: `PRD baseline review and normalization`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P0`
Objective: Create a normalized PRD aligned with the current plan and `AGENTS.md`.
Description: Translate the latest plan into a clean product baseline doc.
Motivation: The repo needs a single stable product description before code work.
Scope includes: Product positioning; in-scope and out-of-scope features; audience; deployment stance; canonical terminology references.
Out of scope: Implementation details better suited to ADRs or architecture docs.
Dependencies: None.
Files/areas impacted: `docs/PRD.md`.
Deliverables: `docs/PRD.md`.
Required tests: Review `docs/PRD.md` against the plan's Purpose, Product Positioning, V1 Scope, and Out of Scope sections; run `rg -n "enterprise|self-hosted|portable" docs/PRD.md` to catch scope drift language.
Acceptance criteria: PRD does not contradict the plan; terminology remains canonical.
Risks / cautions: Product drift if PRD reintroduces self-hosted portability claims.
Notes for Codex/dev: Keep it V1-specific and non-enterprise.
Evidence required to mark done: Committed `docs/PRD.md` containing product positioning, scope, non-goals, and canonical terminology references aligned with the latest plan.
Suggested next action: Draft `docs/PRD.md` from the plan headings.

### P0-C02 - SECURITY.md baseline
Card ID: `P0-C02`
Title: `SECURITY.md baseline`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P0`
Objective: Establish security invariants and implementation constraints in a dedicated security doc.
Description: Capture zero-knowledge, Account Kit, web session, and attachment constraints.
Motivation: Security rules must be explicit before any implementation task.
Scope includes: Master password handling; LocalStorage prohibition; local-only search; Account Kit restrictions; attachment lifecycle references.
Out of scope: Final release hardening report.
Dependencies: None.
Files/areas impacted: `docs/SECURITY.md`.
Deliverables: `docs/SECURITY.md`.
Required tests: Check `docs/SECURITY.md` against the plan's Security Invariants and run `rg -n "LocalStorage|Account Kit|search|attachment|remote authentication|local unlock|session restoration" docs/SECURITY.md`.
Acceptance criteria: Security doc exists and references canonical terms where applicable.
Risks / cautions: A vague security doc will create unsafe prompts and unsafe code.
Notes for Codex/dev: Do not describe recovery flows that do not exist.
Evidence required to mark done: Committed `docs/SECURITY.md` with explicit sections for zero-knowledge rules, session/storage constraints, Account Kit restrictions, and attachment lifecycle references.
Suggested next action: Derive sections from the Security Invariants and ADR requirements.

### P0-C03 - ARCHITECTURE.md baseline
Card ID: `P0-C03`
Title: `ARCHITECTURE.md baseline`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P0`
Objective: Establish the core system architecture and boundaries.
Description: Describe domain, crypto, contracts, adapters, apps, and storage boundaries.
Motivation: The repo needs explicit package and trust boundaries before scaffolding.
Scope includes: Cloudflare-first stance; package split; adapter boundaries; trusted vs untrusted surfaces.
Out of scope: Detailed API contracts and detailed crypto format specifics.
Dependencies: `P0-C01`.
Files/areas impacted: `docs/ARCHITECTURE.md`.
Deliverables: `docs/ARCHITECTURE.md`.
Required tests: Check `docs/ARCHITECTURE.md` against the plan's Revised Monorepo Layout and trust-boundary rules; run `rg -n "packages|adapters|apps|Cloudflare|zero-knowledge" docs/ARCHITECTURE.md`.
Acceptance criteria: Architecture doc matches the latest plan structure and canonical terms.
Risks / cautions: Over-design or premature portability promises.
Notes for Codex/dev: Preserve Cloudflare-first without collapsing core logic into adapters.
Evidence required to mark done: Committed `docs/ARCHITECTURE.md` with package boundaries, trust boundaries, and Cloudflare-first positioning aligned with the latest plan.
Suggested next action: Write architecture overview and package boundaries.

### P0-C04 - THREAT_MODEL.md initial gate
Card ID: `P0-C04`
Title: `THREAT_MODEL.md initial gate`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P0`
Objective: Produce the initial threat model that unlocks sensitive design work.
Description: Capture attacker assumptions and high-risk flows required by the plan.
Motivation: Auth, storage, sync, and Account Kit work are blocked without this.
Scope includes: Malicious operator limits; stolen device; stolen Account Kit; browser compromise; auth endpoint abuse; attachment abuse; admin misuse.
Out of scope: Post-release residual risk log.
Dependencies: `P0-C02`; `P0-C03`.
Files/areas impacted: `docs/THREAT_MODEL.md`.
Deliverables: Initial threat model document.
Required tests: Confirm each threat listed in the plan's Threat Model Gate has a corresponding section, assumption, or mitigation note in `docs/THREAT_MODEL.md`.
Acceptance criteria: All required threat categories from the plan are explicitly covered.
Risks / cautions: Missing a threat now will force ADR or code churn later.
Notes for Codex/dev: Keep it concrete; do not hide assumptions.
Evidence required to mark done: Committed `docs/THREAT_MODEL.md` with an explicit threat coverage list and trust-boundary section.
Suggested next action: Author the threat matrix and core trust boundaries.

### P0-C05 - Execution gate checklist scaffold
Card ID: `P0-C05`
Title: `Execution gate checklist scaffold`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P1`
Objective: Create the structural checklist that tracks prerequisites for implementation phases.
Description: Establish a gate checklist distinct from the final release checklist.
Motivation: The team needs a working checklist for docs and ADR completion before coding.
Scope includes: Gate items for docs; ADRs; threat model; mandatory preconditions by phase.
Out of scope: Final release go/no-go items handled in Phase 12.
Dependencies: `P0-C01`; `P0-C02`; `P0-C03`; `P0-C04`.
Files/areas impacted: `docs/testing/release-checklist.md`.
Deliverables: Initial gate checklist scaffold.
Required tests: Review the checklist against `Global Gates`, `Current Focus`, and the ordered Phase 0 dependencies to ensure it tracks design gates rather than release gates.
Acceptance criteria: Checklist clearly distinguishes design gates from release gates.
Risks / cautions: Confusing gate and release checklists will weaken execution control.
Notes for Codex/dev: Keep it short and phase-oriented.
Evidence required to mark done: Committed checklist scaffold with checkable entries for baseline docs, threat model, and ADR completion gates.
Suggested next action: Create pre-implementation gate entries.
### P0-C06 - ADR 0001 deployment target
Card ID: `P0-C06`
Title: `ADR 0001 deployment target`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P0`
Objective: Freeze the Cloudflare-first deployment stance.
Description: Record the deployment decision and its consequences.
Motivation: Prevent portability confusion and architecture drift.
Scope includes: Why Cloudflare-first; what remains abstracted; what portability is deferred.
Out of scope: Non-V1 hosting targets.
Dependencies: `P0-C03`; `P0-C04`.
Files/areas impacted: `docs/adr/0001-deployment-target.md`.
Deliverables: ADR 0001.
Required tests: Confirm ADR 0001 explicitly states Cloudflare-first, defers portability as a V1 promise, and preserves abstraction boundaries named in the plan.
Acceptance criteria: ADR explicitly rejects portable self-hosted positioning for V1.
Risks / cautions: Soft wording will revive previous ambiguity.
Notes for Codex/dev: Keep language decisive.
Evidence required to mark done: Committed ADR `0001` with decision, rationale, deferred portability note, and named abstraction consequences.
Suggested next action: Draft rationale and consequences.

### P0-C07 - ADR 0002 crypto profile
Card ID: `P0-C07`
Title: `ADR 0002 crypto profile`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P0`
Objective: Freeze the crypto profile and test-vector expectations.
Description: Define KDF, envelope format, versioning, and separation rules.
Motivation: Crypto ambiguity is unacceptable in this project.
Scope includes: KDF params; envelope versions; nonce strategy; key separation; attachment envelope; vectors.
Out of scope: Implementation code.
Dependencies: `P0-C04`.
Files/areas impacted: `docs/adr/0002-crypto-profile.md`.
Deliverables: ADR 0002.
Required tests: Confirm ADR 0002 explicitly defines KDF, parameter values, envelope versioning, nonce or IV strategy, key separation, and test vector expectations from the plan.
Acceptance criteria: Crypto surface is explicit and versioned.
Risks / cautions: Avoid custom scheme design.
Notes for Codex/dev: Favor well-understood primitives and explicit formats.
Evidence required to mark done: Committed ADR `0002` containing concrete crypto parameters, envelope fields, and vector requirements.
Suggested next action: Draft the versioned envelope model.

### P0-C08 - ADR 0003 auth protocol and session model
Card ID: `P0-C08`
Title: `ADR 0003 auth protocol and session model`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P0`
Objective: Freeze `remote authentication`, `local unlock`, and `session restoration` semantics.
Description: Define verifier protocol, session posture, CSRF strategy, and rotation rules.
Motivation: Auth confusion is one of the highest-risk failure modes in the plan.
Scope includes: Verifier protocol; cookies vs tokens; session renewal; fixation mitigation; extension boundaries.
Out of scope: UI implementation.
Dependencies: `P0-C04`.
Files/areas impacted: `docs/adr/0003-auth-protocol-and-session-model.md`.
Deliverables: ADR 0003.
Required tests: Confirm ADR 0003 separately defines `remote authentication`, `local unlock`, and `session restoration`, and names cookie strategy, CSRF mitigation, rotation points, fixation mitigation, and session expiry semantics.
Acceptance criteria: No auth ambiguity remains for trusted vs new-device flows.
Risks / cautions: Do not collapse server auth and client unlock into one behavior.
Notes for Codex/dev: Keep canonical terms exact.
Evidence required to mark done: Committed ADR `0003` with example flows for new device, trusted device with valid session, and trusted device with expired session.
Suggested next action: Define all three canonical flows with examples.

### P0-C09 - ADR 0004 search model
Card ID: `P0-C09`
Title: `ADR 0004 search model`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P1`
Objective: Freeze local-only search semantics.
Description: Define what is indexed, where the index lives, and when it rebuilds.
Motivation: Search design can easily leak sensitive metadata.
Scope includes: Searchable fields; local index location; rebuild triggers after unlock and sync.
Out of scope: Search UI details.
Dependencies: `P0-C04`; `P0-C11`.
Files/areas impacted: `docs/adr/0004-search-model.md`.
Deliverables: ADR 0004.
Required tests: Confirm ADR 0004 names searchable fields, index location, rebuild triggers, and explicitly rejects server-side plaintext search and blind indexes in V1.
Acceptance criteria: Search remains local-only with no server-side plaintext search.
Risks / cautions: Avoid sneaking blind indexes into V1.
Notes for Codex/dev: Preserve local-only semantics.
Evidence required to mark done: Committed ADR `0004` with searchable-field allowlist and rebuild rules.
Suggested next action: Draft allowed fields and rebuild rules.

### P0-C10 - ADR 0005 sync conflict policy
Card ID: `P0-C10`
Title: `ADR 0005 sync conflict policy`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P0`
Objective: Freeze conflict, revision, and tombstone behavior.
Description: Define sync semantics before implementation.
Motivation: A weak sync policy will cause data loss.
Scope includes: Optimistic concurrency; revisions; tombstones; deletion semantics; deterministic conflicts.
Out of scope: Transport or UI details.
Dependencies: `P0-C04`.
Files/areas impacted: `docs/adr/0005-sync-conflict-policy.md`.
Deliverables: ADR 0005.
Required tests: Confirm ADR 0005 defines optimistic concurrency, tombstones, deletion semantics, and at least two deterministic conflict examples.
Acceptance criteria: Conflict rules are deterministic and explicit.
Risks / cautions: Avoid vague merge-by-revision behavior.
Notes for Codex/dev: Design for multi-device reality, not idealized happy paths.
Evidence required to mark done: Committed ADR `0005` with conflict examples and explicit delete or tombstone rules.
Suggested next action: Define per-item conflict examples.

### P0-C11 - ADR 0006 local storage policy
Card ID: `P0-C11`
Title: `ADR 0006 local storage policy`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P0`
Objective: Freeze local storage, cache invalidation, and browser security posture.
Description: Define what can be stored and how browser protections apply.
Motivation: Client storage is a major attack surface for this project.
Scope includes: IndexedDB allowances; LocalStorage prohibitions; auto-lock; CSP; security headers; invalidation rules.
Out of scope: Browser extension UX specifics.
Dependencies: `P0-C04`; `P0-C08`.
Files/areas impacted: `docs/adr/0006-local-storage-policy.md`.
Deliverables: ADR 0006.
Required tests: Confirm ADR 0006 explicitly names what may be stored in IndexedDB, what is forbidden in LocalStorage, auto-lock behavior, invalidation rules, CSP baseline, and browser security headers.
Acceptance criteria: Local storage and browser security baseline are explicit.
Risks / cautions: Do not leave session or secret handling implicit.
Notes for Codex/dev: Respect the plan rule against storing auth/session secrets in LocalStorage.
Evidence required to mark done: Committed ADR `0006` with allowlist or denylist tables for local state plus browser security baseline entries.
Suggested next action: Specify allowed state, forbidden state, and invalidation triggers.

### P0-C12 - ADR 0007 Account Kit lifecycle and integrity
Card ID: `P0-C12`
Title: `ADR 0007 Account Kit lifecycle and integrity`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P0`
Objective: Freeze Account Kit structure, trust model, and signature requirements.
Description: Define export, import, reissue, and authenticity behavior.
Motivation: Account Kit is a high-risk bootstrap artifact.
Scope includes: Payload shape; signing; verification; QR representation; reissue; key rotation behavior.
Out of scope: Implementation UI specifics.
Dependencies: `P0-C04`; `P0-C07`; `P0-C08`.
Files/areas impacted: `docs/adr/0007-account-kit-lifecycle-and-integrity.md`.
Deliverables: ADR 0007.
Required tests: Confirm ADR 0007 defines signed Account Kit format, canonical serialization, versioning, fingerprint checks, import verification failures, and reissue policy.
Acceptance criteria: Signature requirement and fail-closed import behavior are explicit.
Risks / cautions: A checksum-only design is unacceptable.
Notes for Codex/dev: Preserve the no-recovery and no-admin-token rules.
Evidence required to mark done: Committed ADR `0007` with payload shape, signature rules, verification steps, and lifecycle or reissue semantics.
Suggested next action: Draft payload, signature model, and import verification steps.

### P0-C13 - ADR 0008 attachment lifecycle and backup
Card ID: `P0-C13`
Title: `ADR 0008 attachment lifecycle and backup`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P0`
Objective: Freeze attachment states, finalize-bind semantics, and backup packaging.
Description: Define upload states and failure handling before implementation.
Motivation: Attachments are expensive, stateful, and easy to get wrong.
Scope includes: `pending`; `uploaded`; `attached`; `deleted`; `orphaned`; finalize-bind; quotas; restore format.
Out of scope: Preview or OCR.
Dependencies: `P0-C04`; `P0-C07`.
Files/areas impacted: `docs/adr/0008-attachment-lifecycle-and-backup.md`.
Deliverables: ADR 0008.
Required tests: Confirm ADR 0008 defines `pending`, `uploaded`, `attached`, `deleted`, and `orphaned` states, finalize-bind order, cleanup policy, and backup consequences.
Acceptance criteria: Lifecycle, unbound metadata, and cleanup rules are explicit.
Risks / cautions: Ambiguous metadata boundaries will break APIs and cleanup.
Notes for Codex/dev: Preserve the distinction between unbound metadata and item-binding metadata.
Evidence required to mark done: Committed ADR `0008` with lifecycle table, failure cases, and cleanup rules.
Suggested next action: Draft lifecycle tables and failure semantics.

### P0-C14 - ADR 0009 password rotation invariants
Card ID: `P0-C14`
Title: `ADR 0009 password rotation invariants`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P0`
Objective: Freeze atomic password rotation behavior.
Description: Define `expected_bundle_version`, rollback, and versioning semantics.
Motivation: Password rotation can permanently lock users out if handled badly.
Scope includes: Atomic update; bundle and verifier version changes; failure semantics.
Out of scope: UI.
Dependencies: `P0-C07`; `P0-C08`.
Files/areas impacted: `docs/adr/0009-password-rotation-invariants.md`.
Deliverables: ADR 0009.
Required tests: Confirm ADR 0009 explicitly uses `expected_bundle_version`, defines atomic success and failure behavior, and rules out partial rekey states.
Acceptance criteria: Rotation semantics are explicit and use canonical versioning terms.
Risks / cautions: Do not mix `expected_bundle_version` with ad hoc version names.
Notes for Codex/dev: Use the canonical term exactly.
Evidence required to mark done: Committed ADR `0009` with preconditions, stale-version failure case, and rollback expectations.
Suggested next action: Define atomic update preconditions and failure cases.

### P0-C15 - ADR 0010 deployment owner user vault model
Card ID: `P0-C15`
Title: `ADR 0010 deployment owner user vault model`
Phase/Epic: `Phase 0 - Documentation, Threat Model, and Hard Gates`
Status: `done`
Priority: `P0`
Objective: Freeze deployment, user, vault, and lifecycle semantics.
Description: Define owner/admin authority, user lifecycle, and per-user vault isolation.
Motivation: Multi-user single-tenant semantics must remain operational, not cryptographic.
Scope includes: `active`; `suspended`; `deprovisioned`; invite authority; retention semantics; minimal lifecycle UI needs.
Out of scope: Shared vaults and fine-grained roles.
Dependencies: `P0-C04`.
Files/areas impacted: `docs/adr/0010-deployment-owner-user-vault-model.md`.
Deliverables: ADR 0010.
Required tests: Confirm ADR 0010 defines single-tenant deployment semantics, per-user vault isolation, owner or admin operational authority limits, and lifecycle transitions including `deprovisioned`.
Acceptance criteria: Operational authority and lifecycle semantics are explicit and non-contradictory.
Risks / cautions: Avoid leaking admin power into vault access semantics.
Notes for Codex/dev: Keep owner/admin operational only.
Evidence required to mark done: Committed ADR `0010` with lifecycle transition table and explicit statement that owner or admin has no cryptographic access to user vaults.
Suggested next action: Define state transitions and operational actions.
## Phase 1

### P1-C01 - Root monorepo bootstrap
Card ID: `P1-C01`
Title: `Root monorepo bootstrap`
Phase/Epic: `Phase 1 - Monorepo and Core Boundaries`
Status: `done`
Priority: `P1`
Objective: Initialize the workspace skeleton.
Description: Create root package files and workspace configuration.
Motivation: All later work depends on a stable monorepo root.
Scope includes: Root `package.json`; `pnpm-workspace.yaml`; TypeScript base config.
Out of scope: Business logic.
Dependencies: `GG-01`; `GG-02`; `GG-03`.
Files/areas impacted: root config files.
Deliverables: Workspace root files.
Required tests: Run workspace install and root smoke checks such as `pnpm install`, `pnpm -r typecheck` if scripts exist, or the minimal root validation command set defined in the repo.
Acceptance criteria: Workspace resolves packages and root scripts run.
Risks / cautions: Avoid wiring packages before boundaries are defined.
Notes for Codex/dev: Keep root scripts minimal and explicit.
Evidence required to mark done: Root `package.json`, workspace file, and base tsconfig committed, plus recorded successful workspace-resolution smoke output.
Suggested next action: Create root manifests and tsconfig base.

### P1-C02 - Root tooling and scripts
Card ID: `P1-C02`
Title: `Root tooling and scripts`
Phase/Epic: `Phase 1 - Monorepo and Core Boundaries`
Status: `done`
Priority: `P1`
Objective: Add workspace-level lint, test, and validation scripts.
Description: Add shared scripts and tool configuration used across apps and packages.
Motivation: Consistent tooling is needed before package work starts.
Scope includes: `check-secrets.ts`; `validate-env.ts`; `validate-migrations.ts`; root command wiring.
Out of scope: Package-specific tests.
Dependencies: `P1-C01`.
Files/areas impacted: root scripts; `infrastructure/scripts/`.
Deliverables: Tooling scripts and root command definitions.
Required tests: Run each added root script at least once in smoke mode and confirm names align with actual repo tasks.
Acceptance criteria: Scripts exist and execute without placeholder failures.
Risks / cautions: Avoid OS-specific shell assumptions.
Notes for Codex/dev: Use cross-platform Node/tsx scripts.
Evidence required to mark done: Committed root tooling config plus command outputs showing each declared script resolves and runs.
Suggested next action: Create the `infrastructure/scripts` baseline.

### P1-C03 - Repository hygiene and `.gitignore`
Card ID: `P1-C03`
Title: `Repository hygiene and .gitignore`
Phase/Epic: `Phase 1 - Monorepo and Core Boundaries`
Status: `done`
Priority: `P1`
Objective: Ensure the repo ignores generated output, secrets, and editor noise.
Description: Add the initial `.gitignore` required by the plan.
Motivation: Prevent accidental commits of sensitive or generated files.
Scope includes: Node dependencies; build output; test artifacts; env files; editor files; Cloudflare working dirs.
Out of scope: Tool-specific ignore refinements not yet needed.
Dependencies: None.
Files/areas impacted: `.gitignore`.
Deliverables: Root `.gitignore`.
Required tests: Verify `.gitignore` covers dependencies, builds, test artifacts, editor files, Cloudflare output, and env files expected by the repo.
Acceptance criteria: File exists and covers baseline generated/secrets paths.
Risks / cautions: Keep `!.env.example` allowed if needed.
Notes for Codex/dev: Expand only when new tools require it.
Evidence required to mark done: Committed `/.gitignore` reviewed against current repo structure and environment needs.
Suggested next action: Revisit only if new generated paths appear.

### P1-C04 - Package boundary skeleton
Card ID: `P1-C04`
Title: `Package boundary skeleton`
Phase/Epic: `Phase 1 - Monorepo and Core Boundaries`
Status: `done`
Priority: `P1`
Objective: Create the skeleton packages that encode domain boundaries.
Description: Add initial directories and package manifests for core packages.
Motivation: The plan depends on clear boundaries between domain, crypto, contracts, and abstractions.
Scope includes: `packages/domain`; `packages/crypto`; `packages/contracts`; `packages/storage-abstractions`; `packages/runtime-abstractions`; `packages/test-utils`.
Out of scope: Implementations.
Dependencies: `P1-C01`.
Files/areas impacted: `packages/*`.
Deliverables: Package directories and manifests.
Required tests: Run workspace-resolution smoke checks showing packages are discoverable from the root and no broken package references exist.
Acceptance criteria: Packages are present and install correctly.
Risks / cautions: Do not sneak Cloudflare-specific code into core packages.
Notes for Codex/dev: Keep package names and boundaries clean.
Evidence required to mark done: Package directories, manifests, and base entry files committed with successful workspace-resolution output.
Suggested next action: Create manifests and simple exports.

### P1-C05 - Adapter skeleton
Card ID: `P1-C05`
Title: `Adapter skeleton`
Phase/Epic: `Phase 1 - Monorepo and Core Boundaries`
Status: `done`
Priority: `P1`
Objective: Create adapter placeholders for Cloudflare-specific integrations.
Description: Add the adapter layer without domain leakage.
Motivation: The plan requires adapter-friendly boundaries even in a Cloudflare-first V1.
Scope includes: `adapters/cloudflare-storage`; `adapters/cloudflare-runtime`.
Out of scope: Full storage or runtime implementation.
Dependencies: `P1-C04`.
Files/areas impacted: `adapters/*`.
Deliverables: Adapter package skeletons.
Required tests: Run workspace-resolution smoke checks confirming adapter packages resolve cleanly and depend only on intended abstractions.
Acceptance criteria: Adapters exist and depend only on abstractions.
Risks / cautions: Avoid circular package dependencies.
Notes for Codex/dev: Adapters consume abstractions; they do not define them.
Evidence required to mark done: Adapter package skeletons committed with import-resolution smoke output.
Suggested next action: Add manifests and placeholder exports.

### P1-C06 - App skeletons
Card ID: `P1-C06`
Title: `App skeletons`
Phase/Epic: `Phase 1 - Monorepo and Core Boundaries`
Status: `done`
Priority: `P1`
Objective: Create the executable app shells.
Description: Add minimal app directories for web, extension, and API.
Motivation: The repo needs app targets early for wiring and testing.
Scope includes: `apps/web`; `apps/extension`; `apps/api`.
Out of scope: Feature implementation.
Dependencies: `P1-C01`; `P1-C04`; `P1-C05`.
Files/areas impacted: `apps/*`.
Deliverables: App skeletons with manifests and placeholders.
Required tests: Run app-level smoke build or typecheck commands proving `apps/web`, `apps/api`, and `apps/extension` skeletons resolve under the workspace.
Acceptance criteria: App packages resolve and build stubs run.
Risks / cautions: Do not implement features here yet.
Notes for Codex/dev: Keep app bootstraps minimal.
Evidence required to mark done: App skeleton directories, manifests, and entrypoints committed with successful smoke build or typecheck output.
Suggested next action: Add placeholder entrypoints.

## Phase 2

### P2-C01 - Contracts package foundation
Card ID: `P2-C01`
Title: `Contracts package foundation`
Phase/Epic: `Phase 2 - Contracts and Domain Model`
Status: `done`
Priority: `P1`
Objective: Create the shared contracts package foundation.
Description: Establish shared request and response shapes across surfaces.
Motivation: Stable contracts are required before API and UI flows.
Scope includes: Package setup; basic contract structure; versioning conventions.
Out of scope: Full auth or attachment implementations.
Dependencies: `P1-C04`; `P0-C08`; `P0-C13`; `P0-C15`.
Files/areas impacted: `packages/contracts`.
Deliverables: Contracts package skeleton and baseline types.
Required tests: Typecheck smoke test.
Acceptance criteria: Contracts package exports compile and enforce canonical terms.
Risks / cautions: Avoid free-form response shapes.
Notes for Codex/dev: Use canonical names from `AGENTS.md`.
Evidence required to mark done: Contracts package committed and typechecked.
Suggested next action: Add auth, session, and lifecycle namespaces.

### P2-C02 - Domain entities foundation
Card ID: `P2-C02`
Title: `Domain entities foundation`
Phase/Epic: `Phase 2 - Contracts and Domain Model`
Status: `done`
Priority: `P1`
Objective: Model the core domain entities.
Description: Establish user, vault, device, item, attachment, and session concepts.
Motivation: Core behavior should live in the domain layer, not in API or UI code.
Scope includes: Entity types and domain-level invariants.
Out of scope: Persistence implementation.
Dependencies: `P1-C04`; `P0-C15`.
Files/areas impacted: `packages/domain`.
Deliverables: Initial entity definitions.
Required tests: Unit tests for domain invariants where applicable.
Acceptance criteria: Entity types align with plan terminology and lifecycle states.
Risks / cautions: Keep platform details out of domain entities.
Notes for Codex/dev: Domain models should not know about Cloudflare APIs.
Evidence required to mark done: Domain entity files committed.
Suggested next action: Add user, device, vault, item, attachment, and session definitions.

### P2-C03 - Canonical shared terminology and states
Card ID: `P2-C03`
Title: `Canonical shared terminology and states`
Phase/Epic: `Phase 2 - Contracts and Domain Model`
Status: `done`
Priority: `P1`
Objective: Encode canonical terms and lifecycle states in shared types.
Description: Add explicit types and enums for core terms and states.
Motivation: Prevent drift between docs, code, and prompts.
Scope includes: `remote authentication`; `local unlock`; `session restoration`; `deprovisioned`; `expected_bundle_version` usage references.
Out of scope: Business logic.
Dependencies: `P2-C01`; `P2-C02`.
Files/areas impacted: `packages/contracts`; `packages/domain`.
Deliverables: Shared types or enums for canonical semantics.
Required tests: Typecheck and targeted unit tests.
Acceptance criteria: Canonical terms are available and used consistently.
Risks / cautions: Do not reintroduce alternate naming.
Notes for Codex/dev: This card exists to reduce ambiguity later.
Evidence required to mark done: Shared term/state definitions committed.
Suggested next action: Add state enums and flow type names.

### P2-C04 - API contract baseline
Card ID: `P2-C04`
Title: `API contract baseline`
Phase/Epic: `Phase 2 - Contracts and Domain Model`
Status: `done`
Priority: `P1`
Objective: Create the initial API contract set for upcoming flows.
Description: Define onboarding, auth, sync, attachment, and lifecycle contract placeholders.
Motivation: API skeleton and UI work need stable interfaces.
Scope includes: Contract modules for invite, onboarding, sessions, vault, attachments, lifecycle.
Out of scope: Route implementations.
Dependencies: `P2-C01`; `P0-C08`; `P0-C13`; `P0-C15`.
Files/areas impacted: `packages/contracts`.
Deliverables: Initial API contract files.
Required tests: Typecheck and schema validation tests if schema library is used.
Acceptance criteria: Baseline contracts compile and reflect the plan.
Risks / cautions: Keep secrets out of API contracts.
Notes for Codex/dev: Never include master password or plaintext attachment bytes.
Evidence required to mark done: Contract files committed and typechecked.
Suggested next action: Draft auth and onboarding contracts first.
## Phase 3

### P3-C01 - KDF primitives and parameters
Card ID: `P3-C01`
Title: `KDF primitives and parameters`
Phase/Epic: `Phase 3 - Crypto Package`
Status: `done`
Priority: `P0`
Objective: Implement KDF primitives aligned with ADR 0002.
Description: Add the key derivation foundation with explicit parameters.
Motivation: Most other crypto operations depend on correct derivation.
Scope includes: KDF helper; parameter versioning; deterministic test hooks.
Out of scope: Vault and blob envelopes.
Dependencies: `P0-C07`; `P1-C04`; `P2-C02`.
Files/areas impacted: `packages/crypto`.
Deliverables: KDF module and tests.
Required tests: Unit tests and fixed-vector tests.
Acceptance criteria: KDF outputs match vectors and versioned parameters are explicit.
Risks / cautions: Do not invent unsupported KDF behavior.
Notes for Codex/dev: Test-first is mandatory here.
Evidence required to mark done: Passing KDF tests and committed implementation.
Suggested next action: Write failing vector tests first.

### P3-C02 - Account Key generation
Card ID: `P3-C02`
Title: `Account Key generation`
Phase/Epic: `Phase 3 - Crypto Package`
Status: `done`
Priority: `P0`
Objective: Implement Account Key generation.
Description: Add generation and serialization helpers for the Account Key.
Motivation: New-device bootstrap and Account Kit depend on this.
Scope includes: Key generation; encoding; basic validation helpers.
Out of scope: Account Kit signatures.
Dependencies: `P0-C07`; `P0-C12`; `P3-C01`.
Files/areas impacted: `packages/crypto`.
Deliverables: Account Key helpers and tests.
Required tests: Unit tests and serialization checks.
Acceptance criteria: Account Key generation is deterministic where required and safe otherwise.
Risks / cautions: Do not blur Account Key generation with password derivation.
Notes for Codex/dev: Keep Account Key handling distinct from routine login.
Evidence required to mark done: Passing tests and committed helper module.
Suggested next action: Implement encoding and validation alongside generation.

### P3-C03 - Vault envelope format
Card ID: `P3-C03`
Title: `Vault envelope format`
Phase/Epic: `Phase 3 - Crypto Package`
Status: `done`
Priority: `P0`
Objective: Implement the versioned vault encryption envelope.
Description: Add JSON payload encryption and decryption helpers.
Motivation: Vault CRUD and account bundle handling depend on this format.
Scope includes: Envelope versioning; encryption; decryption; validation failures.
Out of scope: Blob encryption.
Dependencies: `P0-C07`; `P3-C01`.
Files/areas impacted: `packages/crypto`.
Deliverables: Vault envelope implementation and tests.
Required tests: Unit tests; negative tests; version mismatch tests.
Acceptance criteria: Envelope behavior matches ADR 0002 and rejects invalid payloads safely.
Risks / cautions: Version handling must be explicit from day one.
Notes for Codex/dev: Keep public crypto APIs small and typed.
Evidence required to mark done: Passing envelope tests.
Suggested next action: Define the envelope shape and write failing tests.

### P3-C04 - Blob envelope format
Card ID: `P3-C04`
Title: `Blob envelope format`
Phase/Epic: `Phase 3 - Crypto Package`
Status: `done`
Priority: `P0`
Objective: Implement the versioned blob encryption envelope for attachments.
Description: Add binary encryption and decryption helpers distinct from vault payloads.
Motivation: Attachments require separate handling from JSON payloads.
Scope includes: Blob envelope format; file encryption; file decryption; format validation.
Out of scope: Upload lifecycle.
Dependencies: `P0-C07`; `P0-C13`; `P3-C01`.
Files/areas impacted: `packages/crypto`.
Deliverables: Blob envelope implementation and tests.
Required tests: Unit tests and binary round-trip tests.
Acceptance criteria: Blob envelope works independently and safely rejects invalid input.
Risks / cautions: Avoid reusing vault envelope assumptions for blobs.
Notes for Codex/dev: Keep file encryption and metadata encryption separable.
Evidence required to mark done: Passing blob crypto tests.
Suggested next action: Implement binary envelope helpers.

### P3-C05 - Crypto test vectors
Card ID: `P3-C05`
Title: `Crypto test vectors`
Phase/Epic: `Phase 3 - Crypto Package`
Status: `done`
Priority: `P0`
Objective: Add fixed crypto test vectors required by the plan.
Description: Record deterministic vectors for KDF and envelope behavior.
Motivation: Prevent silent drift in sensitive primitives.
Scope includes: KDF vectors; vault envelope vectors; blob envelope vectors.
Out of scope: UI or API tests.
Dependencies: `P3-C01`; `P3-C03`; `P3-C04`.
Files/areas impacted: `packages/crypto`; `docs` if vectors are documented.
Deliverables: Vector tests and optional vector doc.
Required tests: Automated vector checks.
Acceptance criteria: Tests fail on changed crypto behavior.
Risks / cautions: Weak vectors reduce confidence.
Notes for Codex/dev: Prefer explicit fixtures.
Evidence required to mark done: Passing vector tests in CI/local.
Suggested next action: Capture baseline fixtures from the chosen crypto profile.

### P3-C06 - Versioned ciphertext helpers
Card ID: `P3-C06`
Title: `Versioned ciphertext helpers`
Phase/Epic: `Phase 3 - Crypto Package`
Status: `done`
Priority: `P1`
Objective: Add shared helpers for version-aware ciphertext handling.
Description: Centralize version encoding and validation behavior.
Motivation: Avoid repeating version logic across crypto modules.
Scope includes: Version parsing; metadata helpers; rejection of unknown versions.
Out of scope: Account Kit signatures.
Dependencies: `P3-C03`; `P3-C04`.
Files/areas impacted: `packages/crypto`.
Deliverables: Version helper utilities and tests.
Required tests: Unit tests.
Acceptance criteria: Version handling is reusable and strict.
Risks / cautions: Soft parsing will create future migration bugs.
Notes for Codex/dev: Unknown versions should fail closed.
Evidence required to mark done: Helpers committed with tests.
Suggested next action: Add strict version parsing utilities.

### P3-C07 - Account Kit canonical payload helpers
Card ID: `P3-C07`
Title: `Account Kit canonical payload helpers`
Phase/Epic: `Phase 3 - Crypto Package`
Status: `done`
Priority: `P1`
Objective: Implement canonical serialization helpers for Account Kit payloads.
Description: Create deterministic payload encoding required for signatures.
Motivation: Account Kit authenticity depends on canonical serialization.
Scope includes: Canonical payload builder; field ordering; export-safe serialization.
Out of scope: Signature generation.
Dependencies: `P0-C12`; `P3-C02`.
Files/areas impacted: `packages/crypto`.
Deliverables: Canonical payload helpers and tests.
Required tests: Unit tests with deterministic output assertions.
Acceptance criteria: Canonical serialization is stable and repeatable.
Risks / cautions: Non-deterministic encoding will break signatures.
Notes for Codex/dev: Treat payload ordering as part of the contract.
Evidence required to mark done: Passing canonicalization tests.
Suggested next action: Implement the payload builder with fixed-field ordering.

### P3-C08 - Account Kit signature helpers
Card ID: `P3-C08`
Title: `Account Kit signature helpers`
Phase/Epic: `Phase 3 - Crypto Package`
Status: `done`
Priority: `P0`
Objective: Implement Account Kit signing and verification helpers.
Description: Provide authenticity verification for exported and imported kits.
Motivation: Account Kit authenticity is mandatory in V1.
Scope includes: Sign; verify; import failure behavior; signature test fixtures.
Out of scope: UI import flow itself.
Dependencies: `P0-C12`; `P3-C07`.
Files/areas impacted: `packages/crypto`.
Deliverables: Signature helpers and verification tests.
Required tests: Unit tests and tamper tests.
Acceptance criteria: Tampered Account Kits fail verification; valid kits verify.
Risks / cautions: Do not make verification optional.
Notes for Codex/dev: Fail closed on invalid or unverifiable kits.
Evidence required to mark done: Passing signature verification tests.
Suggested next action: Write tamper-first verification tests.
## Phase 4

### P4-C01 - Migration baseline
Card ID: `P4-C01`
Title: `Migration baseline`
Phase/Epic: `Phase 4 - Storage and API Skeleton`
Status: `done`
Priority: `P1`
Objective: Establish the initial database migration baseline.
Description: Create the first D1 schema migration set.
Motivation: API and repositories need stable schema targets.
Scope includes: Core tables and essential indexes.
Out of scope: Final migration coverage.
Dependencies: `P0-C10`; `P0-C13`; `P0-C15`.
Files/areas impacted: `infrastructure/migrations`.
Deliverables: Initial migration files.
Required tests: Apply migrations against a clean local test database, then rerun against an already-migrated state to confirm ordered and repeat-safe behavior.
Acceptance criteria: Migrations apply cleanly in order.
Risks / cautions: Do not leak platform assumptions into domain naming.
Notes for Codex/dev: Include lifecycle and attachment state fields from day one.
Evidence required to mark done: Committed migration files plus recorded clean-apply and reapply-safe validation output.
Suggested next action: Draft initial schema from contracts and domain entities.

### P4-C02 - Repository interfaces
Card ID: `P4-C02`
Title: `Repository interfaces`
Phase/Epic: `Phase 4 - Storage and API Skeleton`
Status: `done`
Priority: `P1`
Objective: Define repository interfaces independent of Cloudflare implementation details.
Description: Add abstraction interfaces for storage operations.
Motivation: Domain and API layers should depend on abstractions, not on D1 directly.
Scope includes: User; vault; device; session; item; attachment repositories.
Out of scope: Adapter implementations.
Dependencies: `P2-C02`; `P4-C01`.
Files/areas impacted: `packages/storage-abstractions` or equivalent.
Deliverables: Repository interfaces.
Required tests: Typecheck repository interfaces and, if test scaffolding exists, add contract-shape tests for at least user, device, item, and attachment repositories.
Acceptance criteria: Interfaces cover current V1 flows.
Risks / cautions: Avoid over-generalizing for non-V1 needs.
Notes for Codex/dev: Define just enough to support the plan.
Evidence required to mark done: Repository interface files committed, referenced by adapter skeletons, and validated by typecheck.
Suggested next action: Add repository interface files per entity group.

### P4-C03 - Cloudflare storage adapters
Card ID: `P4-C03`
Title: `Cloudflare storage adapters`
Phase/Epic: `Phase 4 - Storage and API Skeleton`
Status: `done`
Priority: `P1`
Objective: Implement Cloudflare-specific adapters against storage abstractions.
Description: Add D1 and R2 adapter placeholders or implementations as needed.
Motivation: Cloudflare-first execution requires concrete adapters while preserving boundaries.
Scope includes: D1 repository adapters; R2 blob storage adapter scaffolding.
Out of scope: Full feature behavior for attachments or sync.
Dependencies: `P4-C01`; `P4-C02`; `P1-C05`.
Files/areas impacted: `adapters/cloudflare-storage`.
Deliverables: Adapter modules and wiring.
Required tests: Run adapter smoke tests against local D1 or R2 mocks or the chosen test harness, covering at least one read and one write path per adapter group.
Acceptance criteria: Adapters satisfy interfaces and compile.
Risks / cautions: Do not move business logic into adapters.
Notes for Codex/dev: Keep adapters thin.
Evidence required to mark done: Adapter modules committed with passing smoke tests for D1-backed metadata and R2-backed blob storage paths.
Suggested next action: Implement minimal adapter bindings for core entities.

### P4-C04 - API route skeleton
Card ID: `P4-C04`
Title: `API route skeleton`
Phase/Epic: `Phase 4 - Storage and API Skeleton`
Status: `done`
Priority: `P1`
Objective: Create the API route skeleton for planned V1 flows.
Description: Add route placeholders and basic request flow structure.
Motivation: Phase 5 and later web work need API surfaces to target.
Scope includes: Invite; onboarding; sessions; vault; attachments; lifecycle route placeholders.
Out of scope: Full route logic.
Dependencies: `P2-C04`; `P4-C03`; `P1-C06`.
Files/areas impacted: `apps/api`.
Deliverables: API route structure.
Required tests: Run route registration smoke checks and at least one request-per-namespace test for invite, session, vault, attachment, and lifecycle placeholder routes.
Acceptance criteria: Route skeleton compiles and maps to contract namespaces.
Risks / cautions: Do not hardcode logic before contracts settle.
Notes for Codex/dev: Keep route naming aligned with contracts.
Evidence required to mark done: API route tree committed with smoke tests proving contract namespaces are wired and callable.
Suggested next action: Add placeholder handlers and route registration.

### P4-C05 - Auth-adjacent rate limiting and anti-enumeration hooks
Card ID: `P4-C05`
Title: `Auth-adjacent rate limiting and anti-enumeration hooks`
Phase/Epic: `Phase 4 - Storage and API Skeleton`
Status: `done`
Priority: `P0`
Objective: Add baseline rate limiting and anti-enumeration hooks near auth routes.
Description: Establish the skeleton for auth pressure controls before auth logic lands.
Motivation: Auth abuse handling is part of the plan, not optional hardening.
Scope includes: Hook points; policy integration; generic error behavior.
Out of scope: Final tuned thresholds.
Dependencies: `P0-C08`; `P4-C04`.
Files/areas impacted: `apps/api`; adapters as needed.
Deliverables: Middleware or hook scaffolding.
Required tests: Add tests showing repeated bad auth-adjacent requests trigger generic failure responses without user-enumeration differences across known and unknown principals.
Acceptance criteria: Hooks exist and can be exercised by auth-adjacent routes.
Risks / cautions: Do not emit user-enumeration signals.
Notes for Codex/dev: Prioritize generic responses over helpful specificity.
Evidence required to mark done: Middleware or hooks committed with test output showing throttling and generic anti-enumeration behavior.
Suggested next action: Add middleware and generic response tests.

### P4-C06 - Migration validation tests
Card ID: `P4-C06`
Title: `Migration validation tests`
Phase/Epic: `Phase 4 - Storage and API Skeleton`
Status: `done`
Priority: `P1`
Objective: Ensure schema migrations are validated automatically.
Description: Add tests or scripts that apply migrations and verify success.
Motivation: Schema drift is expensive and breaks future work.
Scope includes: Migration apply test; ordered execution; failure detection.
Out of scope: Complex data migration scenarios.
Dependencies: `P4-C01`; `P1-C02`.
Files/areas impacted: `infrastructure/scripts`; tests.
Deliverables: committed migration loader from `infrastructure/migrations`, adapter coverage, and root `validate:migrations` command.
Required tests: Run `npm run validate:migrations`; run adapter tests covering file loading from the real directory, ordered execution, and invalid filename rejection.
Acceptance criteria: clean schema and partially applied schema converge to the same final tables; invalid filename or order fails explicitly; adapter no longer defines a second inline migration source.
Risks / cautions: Skip placeholder tests; make them real.
Notes for Codex/dev: Keep migration validation in CI scope later.
Evidence required to mark done: committed `infrastructure/scripts/validate-migrations.mjs`, passing adapter migration tests, and successful `npm run validate:migrations` output.
Suggested next action: move delete semantics from temporary hard delete to `P7-C03` tombstones.

### P4-C07 - Account lifecycle enforcement hooks
Card ID: `P4-C07`
Title: `Account lifecycle enforcement hooks`
Phase/Epic: `Phase 4 - Storage and API Skeleton`
Status: `done`
Priority: `P1`
Objective: Add baseline enforcement hooks for `active`, `suspended`, and `deprovisioned` accounts.
Description: Prepare the API layer for lifecycle-aware access control.
Motivation: User lifecycle is in-scope and cannot remain implicit.
Scope includes: Hook points for auth and session checks; lifecycle state integration.
Out of scope: Owner/admin UI.
Dependencies: `P0-C15`; `P2-C03`; `P4-C04`.
Files/areas impacted: `apps/api`; storage adapters.
Deliverables: Lifecycle enforcement integration points.
Required tests: Add tests proving `active` requests pass while `suspended` and `deprovisioned` requests are denied on protected API paths.
Acceptance criteria: Lifecycle state can block route access according to the plan.
Risks / cautions: Do not let `suspended` users continue normal access.
Notes for Codex/dev: Preserve operational-only admin semantics.
Evidence required to mark done: Lifecycle enforcement hooks committed with passing deny-or-allow tests for each supported lifecycle state.
Suggested next action: Wire lifecycle state checks into auth/session middleware.

### P4-C08 - Session middleware security baseline
Card ID: `P4-C08`
Title: `Session middleware security baseline`
Phase/Epic: `Phase 4 - Storage and API Skeleton`
Status: `done`
Priority: `P0`
Objective: Establish the web session middleware baseline required by ADR 0003.
Description: Add session middleware or infrastructure supporting secure web sessions.
Motivation: Web session posture is a non-negotiable precondition.
Scope includes: HttpOnly posture; rotation hooks; revocation semantics; surface separation.
Out of scope: Full auth flow.
Dependencies: `P0-C08`; `P4-C04`.
Files/areas impacted: `apps/api`.
Deliverables: Session middleware baseline and tests.
Required tests: Add tests covering secure session issuance, session identifier rotation, revoked-session rejection, and cookie posture expected by ADR 0003.
Acceptance criteria: Middleware baseline supports plan-required session posture.
Risks / cautions: Do not fallback to JavaScript-readable auth tokens.
Notes for Codex/dev: Respect the LocalStorage prohibition.
Evidence required to mark done: Session middleware committed with passing issuance, rotation, and revocation tests plus documented cookie settings.
Suggested next action: Implement session middleware skeleton and secure defaults.

### P4-C09 - Local Worker runtime configuration
Card ID: `P4-C09`
Title: `Local Worker runtime configuration`
Phase/Epic: `Phase 4 - Storage and API Skeleton`
Status: `done`
Priority: `P1`
Objective: Provide a repeatable local Cloudflare Worker runtime for the API.
Description: Add the local Wrangler configuration, runtime config plumbing, and storage selection needed to run the API outside the test harness.
Motivation: Phase 4 is not operationally complete if the API can only run through unit or integration tests.
Scope includes: `wrangler.toml`; local Worker vars; local D1 and R2 bindings; `npm run dev:api`; runtime config selection; local storage bootstrap.
Out of scope: production deploy config, remote Cloudflare environment provisioning, or Phase 12 release validation.
Dependencies: `P4-C01`; `P4-C03`; `P4-C04`; `P1-C02`.
Files/areas impacted: root config; `apps/api`; `adapters/cloudflare-storage`; `packages/runtime-abstractions`.
Deliverables: committed `wrangler.toml`, local runtime config, local storage bootstrap path, and root `dev:api` command.
Required tests: Run runtime-config unit tests, Worker storage-selection tests, migration-application adapter tests, and verify `GET /api/health` succeeds through `wrangler dev`.
Acceptance criteria: the API can run locally under Wrangler with the expected bindings and without relying on test-only bootstrapping.
Risks / cautions: local runtime defaults must not leak production assumptions or use placeholder IDs that collide across restarts.
Notes for Codex/dev: keep the local runtime Cloudflare-first; do not reintroduce a Node-only API server path.
Evidence required to mark done: passing `runtime-config.test.ts`, `worker-storage.test.ts`, adapter migration tests, and successful local `wrangler dev` health check using the committed config.
Suggested next action: keep `P4-C06` focused on migration validation depth rather than local runtime bring-up.
## Phase 5

### P5-C01 - Invite issuance
Card ID: `P5-C01`
Title: `Invite issuance`
Phase/Epic: `Phase 5 - Auth, Onboarding, and Account Kit`
Status: `done`
Priority: `P0`
Objective: Allow owner or admin to issue secure invites for user onboarding.
Description: Implement the server-side and basic operator flow for generating invites with expiration and intended role.
Motivation: Onboarding cannot start without a controlled invite mechanism.
Scope includes: invite creation; expiration; single-use semantics; basic audit fields.
Out of scope: full onboarding completion.
Dependencies: `P0-C08`; `P0-C15`; `P4-C04`.
Files/areas impacted: `apps/api`; `apps/web`; `packages/contracts`.
Deliverables: invite issuance endpoints, contracts, and minimal UI or operator path.
Required tests: Add integration tests covering invite creation, reuse rejection, expired-token rejection, and authorization checks for who may issue invites.
Acceptance criteria: valid invite can be created, listed where needed, and rejected after expiry or use.
Risks / cautions: avoid user enumeration and role escalation.
Notes for Codex/dev: invite status transitions must be explicit and testable.
Evidence required to mark done: Passing invite issuance tests plus a working operator path or minimal UI showing create and reject-after-use behavior.
Suggested next action: implement invite entity and issuance endpoint.

### P5-C02 - Onboarding client flow
Card ID: `P5-C02`
Title: `Onboarding client flow`
Phase/Epic: `Phase 5 - Auth, Onboarding, and Account Kit`
Status: `done`
Priority: `P0`
Objective: Build the client flow that consumes a valid invite and collects onboarding inputs.
Description: Create the onboarding screens and client-side orchestration for username, master password, and account bootstrap inputs.
Motivation: The user journey needs a deterministic path from invite to first usable account state.
Scope includes: invite validation screen; username capture; master password setup; account key generation handoff.
Out of scope: persistence of the created account record.
Dependencies: `P5-C01`; `P3-C01`; `P3-C02`.
Files/areas impacted: `apps/web`; `packages/crypto`; `packages/contracts`.
Deliverables: onboarding UI flow with validation and crypto bootstrap hooks.
Required tests: component tests for validation; E2E test for happy path input flow.
Acceptance criteria: onboarding flow collects required inputs and prepares the payload for account creation.
Risks / cautions: never leak sensitive bootstrap material to logs or analytics.
Notes for Codex/dev: keep terminology aligned with `remote authentication` and `local unlock`.
Evidence required to mark done: onboarding path exercised by test and documented flow.
Suggested next action: implement invite validation page and onboarding state machine.

### P5-C03 - Account creation persistence and initial device registration
Card ID: `P5-C03`
Title: `Account creation persistence and initial device registration`
Phase/Epic: `Phase 5 - Auth, Onboarding, and Account Kit`
Status: `done`
Priority: `P0`
Objective: Persist the newly created account and register the initial trusted device during onboarding.
Description: Finalize onboarding by writing the user account, server-side auth material, initial vault metadata, and first device record in one coherent flow.
Motivation: The account does not exist until persistence and initial device registration are complete.
Scope includes: account record creation; auth verifier persistence; initial trusted device registration; initial session bootstrap linkage.
Out of scope: subsequent device bootstrap.
Dependencies: `P5-C02`; `P4-C02`; `P4-C04`; `P4-C07`.
Files/areas impacted: `apps/api`; `apps/web`; `packages/contracts`; storage adapters.
Deliverables: creation endpoint or command path and initial device registration logic.
Required tests: Add integration tests covering successful account creation, duplicate username rejection if applicable, partial-write rollback behavior, and first trusted-device record creation.
Acceptance criteria: onboarding completes with persisted account, trusted device record, and usable next-step session state.
Risks / cautions: partial writes here will create unrecoverable onboarding failures.
Notes for Codex/dev: make the transaction boundary explicit even if storage uses compensating operations.
Evidence required to mark done: Passing onboarding-persistence tests plus recorded storage state showing account, verifier, vault metadata, and first trusted device after success.
Suggested next action: define account creation transaction contract and persistence path.

### P5-C04 - New-device bootstrap
Card ID: `P5-C04`
Title: `New-device bootstrap`
Phase/Epic: `Phase 5 - Auth, Onboarding, and Account Kit`
Status: `done`
Priority: `P0`
Objective: Allow a second device to join an existing account using the approved bootstrap path.
Description: Implement the flow for setting up a new device using the Account Kit and the project-approved authentication steps.
Motivation: Multi-device operation is core product behavior.
Scope includes: Account Kit import; device naming; device registration; bootstrap verification.
Out of scope: device revocation.
Dependencies: `P0-C12`; `P5-C06`; `P5-C09`.
Files/areas impacted: `apps/web`; `apps/api`; `packages/crypto`; `packages/contracts`.
Deliverables: new-device bootstrap flow and registration path.
Required tests: E2E test for second-device setup; integration tests for invalid bootstrap attempts.
Acceptance criteria: a valid Account Kit can bootstrap a new trusted device and invalid kits are rejected.
Risks / cautions: bootstrap semantics must not blur into recovery semantics.
Notes for Codex/dev: preserve explicit separation between onboarding and device addition.
Evidence required to mark done: second-device flow executed end-to-end with tests.
Suggested next action: implement bootstrap validation contract and device registration call.

### P5-C05 - Trusted session issuance
Card ID: `P5-C05`
Title: `Trusted session issuance`
Phase/Epic: `Phase 5 - Auth, Onboarding, and Account Kit`
Status: `done`
Priority: `P0`
Objective: Issue the secure web session used after successful `remote authentication`.
Description: Implement the server-side session issuance, rotation, and storage contract used for browser sessions on trusted devices.
Motivation: The app needs a canonical session model before protected routes and session restoration can be reliable.
Scope includes: secure cookie posture; issuance; rotation hooks; revocation semantics.
Out of scope: `local unlock` and client cache unlock behavior.
Dependencies: `P0-C08`; `P4-C08`.
Files/areas impacted: `apps/api`; `apps/web`.
Deliverables: session issuance flow and secure cookie or equivalent server-controlled session handling.
Required tests: Add integration tests for login session issuance, session identifier rotation on reauth, invalidation after revocation, and denial of requests with stale session state.
Acceptance criteria: authenticated sessions are issued securely and revoked correctly.
Risks / cautions: do not degrade to client-readable bearer token storage.
Notes for Codex/dev: session mechanism must be consistent with CSRF and SameSite decisions.
Evidence required to mark done: Passing session tests plus browser or test-harness evidence of secure cookie behavior and rotated session identifiers.
Suggested next action: wire secure session issuance into post-auth flow.

### P5-C06 - remote authentication vs local unlock contract separation
Card ID: `P5-C06`
Title: `remote authentication vs local unlock contract separation`
Phase/Epic: `Phase 5 - Auth, Onboarding, and Account Kit`
Status: `done`
Priority: `P0`
Objective: Freeze the runtime and code-level boundary between `remote authentication`, `local unlock`, and `session restoration`.
Description: Implement or document explicit contracts so server auth, local key unsealing, and session restoration cannot drift into one ambiguous flow.
Motivation: This distinction has already been a recurring architecture risk.
Scope includes: shared contract updates; route-state distinctions; terminology normalization in code.
Out of scope: UI polish.
Dependencies: `P0-C08`; `P2-C03`; `P5-C05`.
Files/areas impacted: `packages/contracts`; `apps/web`; `apps/api`; docs.
Deliverables: canonical contract definitions and usage points.
Required tests: Add contract or integration tests that separately exercise `remote authentication`, `local unlock`, and `session restoration` without allowing one flow to silently stand in for another.
Acceptance criteria: code paths for `remote authentication`, `local unlock`, and `session restoration` are explicit and non-overlapping.
Risks / cautions: ambiguous names here will create long-lived auth defects.
Notes for Codex/dev: reject generic names like `login` where the exact state matters.
Evidence required to mark done: Passing transition tests plus committed contract definitions and code references showing distinct entry points for each auth state.
Suggested next action: normalize shared auth state types before more UI is added.

### P5-C07 - Account Kit generation and export
Card ID: `P5-C07`
Title: `Account Kit generation and export`
Phase/Epic: `Phase 5 - Auth, Onboarding, and Account Kit`
Status: `done`
Priority: `P0`
Objective: Generate and export the Account Kit in the approved signed format.
Description: Build the Account Kit payload, signing flow, export UI, and user warnings.
Motivation: Device bootstrap depends on a stable and trustworthy kit artifact.
Scope includes: payload assembly; file export; QR support if approved by plan; signed metadata.
Out of scope: reissue and invalidation workflows.
Dependencies: `P3-C07`; `P3-C08`; `P5-C03`.
Files/areas impacted: `packages/crypto`; `apps/web`; docs.
Deliverables: Account Kit export capability and user guidance.
Required tests: Add unit tests for canonical payload serialization and integration tests covering export, signature generation, and verifier acceptance of a valid Account Kit artifact.
Acceptance criteria: exported kits are valid, versioned, and verifiable.
Risks / cautions: Account Kit contents are bootstrap-critical and need strong integrity guarantees.
Notes for Codex/dev: never treat digest-only integrity as sufficient if the ADR requires signatures.
Evidence required to mark done: Exported sample Account Kit file or fixture that validates successfully under the committed verifier tests.
Suggested next action: wire canonical payload builder into onboarding-complete flow.

### P5-C08 - Account Kit reissue flow
Card ID: `P5-C08`
Title: `Account Kit reissue flow`
Phase/Epic: `Phase 5 - Auth, Onboarding, and Account Kit`
Status: `done`
Priority: `P1`
Objective: Reissue Account Kits under the lifecycle rules defined by the ADR.
Description: Provide the operator or user flow for generating a replacement kit and applying the chosen invalidation policy.
Motivation: Bootstrap material lifecycle must be explicit, not ad hoc.
Scope includes: reissue request; old-kit invalidation policy; audit trail.
Out of scope: recovery semantics outside approved bootstrap flows.
Dependencies: `P0-C12`; `P5-C07`.
Files/areas impacted: `apps/web`; `apps/api`; docs.
Deliverables: reissue flow and lifecycle enforcement rules.
Required tests: API integration test rejecting canonical metadata mismatch on reissue; web session-store test proving reissue uses runtime metadata from the API rather than `window.location.origin`; local `smoke:local-flow` assertion covering authenticated reissue through the Vite proxy.
Acceptance criteria: reissued kits follow the documented lifecycle policy without ambiguity and use canonical deployment metadata from the API runtime.
Risks / cautions: unclear invalidation semantics will cause device bootstrap support issues.
Notes for Codex/dev: the exact lifecycle rule must match the ADR text, and reissue must never rebuild metadata from the browser origin.
Evidence required to mark done: committed API and web changes, passing API and web test coverage for reissue validation, and passing `npm run smoke:local-flow` covering reissue against the local Worker runtime.
Suggested next action: keep future Account Key rotation work separate from simple reissue semantics.

### P5-C09 - Account Kit signature verification on import
Card ID: `P5-C09`
Title: `Account Kit signature verification on import`
Phase/Epic: `Phase 5 - Auth, Onboarding, and Account Kit`
Status: `done`
Priority: `P0`
Objective: Verify Account Kit authenticity before any bootstrap flow proceeds.
Description: Add strict verification on kit import, including signature, version, and deployment fingerprint checks.
Motivation: Bootstrap artifacts must prove provenance before they are trusted.
Scope includes: signature validation; fingerprint validation; structured error handling.
Out of scope: user education copy beyond core errors.
Dependencies: `P3-C08`; `P5-C04`; `P5-C07`.
Files/areas impacted: `packages/crypto`; `apps/web`; `apps/api` if server verification is used.
Deliverables: verifier path with explicit failure modes.
Required tests: Add unit tests for invalid signature, wrong deployment fingerprint, unsupported version, malformed payload, and valid success path before device registration begins.
Acceptance criteria: tampered or mismatched kits are rejected before device registration.
Risks / cautions: permissive parsing here would be a serious bootstrap vulnerability.
Notes for Codex/dev: fail closed and keep errors user-safe.
Evidence required to mark done: Passing verifier test matrix plus an end-to-end rejected import scenario demonstrating fail-closed behavior.
Suggested next action: implement verification module and import error mapping.

### P5-C10 - Zero-recovery messaging
Card ID: `P5-C10`
Title: `Zero-recovery messaging`
Phase/Epic: `Phase 5 - Auth, Onboarding, and Account Kit`
Status: `done`
Priority: `P1`
Objective: Ensure users are clearly warned about irrecoverability and bootstrap responsibilities.
Description: Add the product copy and confirmation points that explain the zero-recovery model during onboarding and Account Kit export.
Motivation: This product choice has operational and support consequences if left implicit.
Scope includes: onboarding warnings; export warnings; confirmation copy.
Out of scope: marketing copy.
Dependencies: `P5-C02`; `P5-C07`.
Files/areas impacted: `apps/web`; docs.
Deliverables: finalized warning text and required confirmation points.
Required tests: UI tests for display of required warning states.
Acceptance criteria: critical zero-recovery warnings are visible at required decision points.
Risks / cautions: vague language here creates support and trust problems.
Notes for Codex/dev: keep wording direct and non-ambiguous.
Evidence required to mark done: screenshots or test output showing warning checkpoints.
Suggested next action: add required warning checkpoints to onboarding and Account Kit export.

## Phase 6

### P6-C01 - Vue app shell
Card ID: `P6-C01`
Title: `Vue app shell`
Phase/Epic: `Phase 6 - Web Shell and Local Security Behavior`
Status: `done`
Priority: `P1`
Objective: Create the base web shell, routing frame, and authenticated layout.
Description: Build the initial Vue shell required for the main application surfaces.
Motivation: Later flows need a stable shell before feature screens are added.
Scope includes: app layout; router scaffolding; shell-level state boundaries.
Out of scope: feature-specific CRUD views.
Dependencies: `P1-C06`; `P5-C05`.
Files/areas impacted: `apps/web`.
Deliverables: working shell with protected and public route group structure.
Required tests: basic route rendering tests.
Acceptance criteria: shell supports navigation and route segregation for auth-sensitive surfaces.
Risks / cautions: do not mix unlocked and locked UI states in one uncontrolled layout.
Notes for Codex/dev: use the canonical project terminology in route names and stores.
Evidence required to mark done: shell routes render under automated test.
Suggested next action: scaffold base routes and shell layout.

### P6-C02 - Route guards
Card ID: `P6-C02`
Title: `Route guards`
Phase/Epic: `Phase 6 - Web Shell and Local Security Behavior`
Status: `done`
Priority: `P0`
Objective: Enforce navigation rules for unauthenticated, authenticated, locked, and restored states.
Description: Implement route guards based on session and local unlock state.
Motivation: Protected route behavior must remain deterministic as auth complexity grows.
Scope includes: redirect rules; guard decision matrix; state-aware route entry.
Out of scope: guard visual polish.
Dependencies: `P5-C05`; `P5-C06`; `P6-C03`.
Files/areas impacted: `apps/web`.
Deliverables: router guard implementation and state matrix tests.
Required tests: route guard unit tests and navigation integration tests.
Acceptance criteria: routes consistently enforce the required auth and unlock transitions.
Risks / cautions: ambiguous state checks here will leak protected surfaces.
Notes for Codex/dev: model `session restoration` distinctly from fresh authentication.
Evidence required to mark done: navigation matrix documented and tested.
Suggested next action: define route-state matrix before coding guard branches.

### P6-C03 - Session store
Card ID: `P6-C03`
Title: `Session store`
Phase/Epic: `Phase 6 - Web Shell and Local Security Behavior`
Status: `done`
Priority: `P0`
Objective: Centralize web session and unlock-related UI state.
Description: Build the client state container for authenticated session presence, lock state, and restoration checks.
Motivation: Auth-sensitive UI cannot rely on ad hoc local state.
Scope includes: session presence; lock state; restoration flags; derived selectors.
Out of scope: decrypted vault contents.
Dependencies: `P5-C05`; `P5-C06`.
Files/areas impacted: `apps/web`.
Deliverables: session store module and tests.
Required tests: store unit tests covering state transitions.
Acceptance criteria: store models auth and lock states without ambiguous flags.
Risks / cautions: state drift between server session and local unlock will cause subtle bugs.
Notes for Codex/dev: prefer explicit enums or discriminated unions over boolean soup.
Evidence required to mark done: store transitions tested and consumed by guards.
Suggested next action: define state machine types and transition helpers.

### P6-C04 - Secure local cache
Card ID: `P6-C04`
Title: `Secure local cache`
Phase/Epic: `Phase 6 - Web Shell and Local Security Behavior`
Status: `done`
Priority: `P0`
Objective: Implement the client-side storage policy approved by the ADR.
Description: Add the secure local persistence layer for encrypted material and non-sensitive metadata allowed by policy.
Motivation: The product needs offline-friendly and fast local behavior without violating the storage model.
Scope includes: allowed-at-rest data; cache invalidation; wipe helpers.
Out of scope: full search index population.
Dependencies: `P0-C11`; `P3-C03`; `P6-C03`.
Files/areas impacted: `apps/web`; local storage wrapper modules.
Deliverables: secure cache abstraction and wipe behavior.
Required tests: unit tests for allowed writes, prohibited writes, and wipe behavior.
Acceptance criteria: local storage implementation matches the ADR and can be cleared deterministically.
Risks / cautions: this is a common place for accidental secret leakage.
Notes for Codex/dev: no plaintext secrets or JavaScript-readable session secrets.
Evidence required to mark done: local cache tests plus code review of stored fields.
Suggested next action: implement a typed storage wrapper with explicit field allowlist.

### P6-C05 - Auto-lock behavior
Card ID: `P6-C05`
Title: `Auto-lock behavior`
Phase/Epic: `Phase 6 - Web Shell and Local Security Behavior`
Status: `done`
Priority: `P1`
Objective: Lock local decrypted access after inactivity or explicit trigger.
Description: Add auto-lock timers and the state transitions that clear in-memory material after inactivity.
Motivation: Local exposure window must be intentionally bounded.
Scope includes: inactivity timers; explicit lock; clear-in-memory logic.
Out of scope: server session revocation.
Dependencies: `P0-C11`; `P6-C03`; `P6-C04`.
Files/areas impacted: `apps/web`.
Deliverables: auto-lock implementation and configurable policy wiring if allowed.
Required tests: unit tests for timer behavior; integration tests for lock transition.
Acceptance criteria: inactivity or explicit lock clears local unlocked state reliably.
Risks / cautions: timer logic can be flaky without deterministic tests.
Notes for Codex/dev: keep lock semantics separate from session destruction.
Evidence required to mark done: test evidence showing lock after inactivity and data purge behavior.
Suggested next action: implement timer abstraction before UI integration.

### P6-C06 - local unlock flow
Card ID: `P6-C06`
Title: `local unlock flow`
Phase/Epic: `Phase 6 - Web Shell and Local Security Behavior`
Status: `done`
Priority: `P0`
Objective: Implement the user flow for re-unsealing local access on a trusted device.
Description: Build the `local unlock` screen and logic for deriving or unsealing the local key material allowed by the design.
Motivation: Trusted-device usability depends on a clean unlock path that is not mistaken for `remote authentication`.
Scope includes: unlock UI; local key derivation or unseal logic; failure handling.
Out of scope: initial server login.
Dependencies: `P5-C06`; `P6-C04`; `P6-C05`.
Files/areas impacted: `apps/web`; `packages/crypto`.
Deliverables: unlock flow and failure-state handling.
Required tests: component tests and integration tests for unlock success and failure.
Acceptance criteria: `local unlock` works without re-running `remote authentication` when policy allows it.
Risks / cautions: do not accidentally hit server auth endpoints from unlock-only flows.
Notes for Codex/dev: state labels must make the distinction obvious in code and UI.
Evidence required to mark done: trusted-device unlock demonstrated with tests.
Suggested next action: implement unlock state transition and UI form.

### P6-C07 - session restoration flow
Card ID: `P6-C07`
Title: `session restoration flow`
Phase/Epic: `Phase 6 - Web Shell and Local Security Behavior`
Status: `done`
Priority: `P0`
Objective: Restore a valid server session and local state when the browser resumes under approved conditions.
Description: Implement the app bootstrap logic that checks existing session state and decides whether to enter locked, unlocked, or unauthenticated mode.
Motivation: Browser resume behavior will be a frequent real-world path and needs deterministic semantics.
Scope includes: bootstrap probe; restore-state mapping; locked-state fallbacks.
Out of scope: fresh onboarding.
Dependencies: `P5-C05`; `P5-C06`; `P6-C03`; `P6-C04`.
Files/areas impacted: `apps/web`; `apps/api`.
Deliverables: restoration bootstrap logic and tests.
Required tests: integration tests for valid session, expired session, and locked-device cases.
Acceptance criteria: `session restoration` resolves to the correct state without leaking data or requiring the wrong auth flow.
Risks / cautions: restoration bugs often expose data during app initialization.
Notes for Codex/dev: keep bootstrap code small and explicit.
Evidence required to mark done: tested bootstrap matrix for restore paths.
Suggested next action: define restoration decision table before coding app init.

### P6-C08 - CSP and security header integration
Card ID: `P6-C08`
Title: `CSP and security header integration`
Phase/Epic: `Phase 6 - Web Shell and Local Security Behavior`
Status: `done`
Priority: `P0`
Objective: Apply baseline browser security headers required by the plan.
Description: Integrate CSP and supporting headers into the app or API delivery path.
Motivation: Browser hardening must start before the UI surface area expands.
Scope includes: CSP; framing policy; content-type and referrer protections as applicable.
Out of scope: final production tuning of every directive.
Dependencies: `P4-C04`; `P4-C08`.
Files/areas impacted: `apps/api`; `apps/web`; deployment config.
Deliverables: enforced security headers with documented exceptions.
Required tests: integration or smoke tests verifying expected headers.
Acceptance criteria: app responses emit the required baseline security headers.
Risks / cautions: loose CSP defaults become hard to tighten later.
Notes for Codex/dev: document every allowed exception instead of silently widening policy.
Evidence required to mark done: header verification output and committed configuration.
Suggested next action: add baseline header middleware and verify in tests.

### P6-C09 - CSRF-protected mutable request flow
Card ID: `P6-C09`
Title: `CSRF-protected mutable request flow`
Phase/Epic: `Phase 6 - Web Shell and Local Security Behavior`
Status: `done`
Priority: `P0`
Objective: Protect state-changing web requests according to the selected session model.
Description: Add the CSRF strategy required for secure browser session use.
Motivation: Session-based auth without an explicit CSRF strategy is incomplete.
Scope includes: token or double-submit mechanism if required; client wiring; failure handling.
Out of scope: non-browser API clients.
Dependencies: `P5-C05`; `P6-C08`.
Files/areas impacted: `apps/api`; `apps/web`.
Deliverables: CSRF protection implementation and request wiring.
Required tests: integration tests for accepted valid requests and rejected forged requests.
Acceptance criteria: mutable browser requests are protected and validated as designed.
Risks / cautions: partial enforcement will create inconsistent and vulnerable endpoints.
Notes for Codex/dev: align protection with SameSite and cookie strategy from ADR 0003.
Evidence required to mark done: CSRF tests and documented request pattern.
Suggested next action: implement CSRF middleware and client helper.

### P6-C10 - Vite `/api` local proxy
Card ID: `P6-C10`
Title: `Vite /api local proxy`
Phase/Epic: `Phase 6 - Web Shell and Local Security Behavior`
Status: `done`
Priority: `P1`
Objective: Route local web development traffic to the local Worker without changing the client contract.
Description: Add Vite proxy configuration so the web app can keep relative `/api` calls while talking to the local Worker runtime during development.
Motivation: Auth, cookies, CSRF, and `session restoration` behavior need same-origin local testing instead of hardcoded cross-origin client URLs.
Scope includes: Vite proxy helper; stable local API target; root `dev:web` command using the expected host and port.
Out of scope: production reverse proxy config or non-local deployment routing.
Dependencies: `P4-C09`; `P6-C03`; `P6-C09`.
Files/areas impacted: `apps/web/vite.config.ts`; `apps/web/vite.proxy.ts`; root `package.json`.
Deliverables: local proxy config and stable root web dev command.
Required tests: Run proxy-config unit tests and verify `GET /api/health` succeeds when requested through the Vite dev server.
Acceptance criteria: local web development can call `/api/*` without changing client request code.
Risks / cautions: keep the proxy limited to local development and avoid accidental production assumptions in the client.
Notes for Codex/dev: preserve relative API calls so the runtime contract stays the same across local and deployed environments.
Evidence required to mark done: passing `vite.proxy.test.ts` plus successful proxied health-check output from the local dev flow.
Suggested next action: keep the client using relative `/api` calls and validate integrated auth flows through the proxy.

### P6-C11 - Local web + API end-to-end smoke flow
Card ID: `P6-C11`
Title: `Local web + API end-to-end smoke flow`
Phase/Epic: `Phase 6 - Web Shell and Local Security Behavior`
Status: `done`
Priority: `P1`
Objective: Provide a repeatable local smoke path that exercises the real web server, the local Worker, and the auth shell together.
Description: Add local helper commands and an end-to-end smoke script that validate invite issuance, onboarding, proxied API access, and `session restoration` against the local development stack.
Motivation: Manual local setup is too brittle without one repeatable integrated check.
Scope includes: local invite helper; local smoke runner; proxied onboarding; post-onboarding `session restoration` verification.
Out of scope: browser automation, full CRUD flows, extension testing, or comprehensive Phase 7+ E2E coverage.
Dependencies: `P4-C09`; `P5-C01`; `P5-C03`; `P6-C10`.
Files/areas impacted: root scripts; `infrastructure/scripts`; local dev workflow.
Deliverables: `local:invite` helper, `smoke:local-flow` command, and a passing integrated local auth-shell smoke path.
Required tests: Run `npm run smoke:local-flow` and verify it completes with invite issuance, onboarding completion, and `local_unlock_required` on `session restoration`.
Acceptance criteria: a future dev can bring up the local stack and verify the auth shell without guessing ports, routes, or bootstrap steps.
Risks / cautions: the smoke flow must stay narrow and deterministic; it is not a substitute for broader E2E coverage later.
Notes for Codex/dev: keep this flow focused on local developer validation of auth-shell wiring, not on product completeness.
Evidence required to mark done: passing `npm run smoke:local-flow` output plus committed local helper scripts and root commands.
Suggested next action: use this smoke path when changing auth-shell, cookie, proxy, or local runtime wiring.
## Phase 7

### P7-C01 - Login item CRUD
Card ID: `P7-C01`
Title: `Login item CRUD`
Phase/Epic: `Phase 7 - Vault CRUD and Local Search`
Status: `done`
Priority: `P0`
Objective: Implement encrypted CRUD for login items.
Description: Build create, read, update, and delete flows for credential items stored as encrypted vault objects.
Motivation: Login items are the core product primitive.
Scope includes: create; edit; delete; list; detail view.
Out of scope: attachments bound to items.
Dependencies: `P3-C03`; `P4-C04`; `P6-C06`.
Files/areas impacted: `apps/web`; `apps/api`; `packages/contracts`.
Deliverables: encrypted login item storage contract, authenticated API CRUD routes, and working web shell create/edit/delete flow.
Required tests: API integration tests for create/list/detail/update/delete; revision-conflict test; cross-user isolation test; web workspace tests for create and update; local smoke kept separate from auth shell.
Acceptance criteria: login items can be created, viewed, updated, and removed from the web shell; server stores only opaque `encryptedPayload`; revision conflicts return `409`.
Risks / cautions: field normalization mistakes here will propagate to import/export later.
Notes for Codex/dev: preserve encrypted payload boundaries end to end.
Evidence required to mark done: passing API and web test output plus working local UI path in `/vault` after `local unlock`.
Suggested next action: reuse the same repository and API shape for document items, then replace hard delete with tombstones.

### P7-C02 - Document item CRUD
Card ID: `P7-C02`
Title: `Document item CRUD`
Phase/Epic: `Phase 7 - Vault CRUD and Local Search`
Status: `done`
Priority: `P1`
Objective: Implement encrypted CRUD for document-style items.
Description: Build the item flows for note or document entries stored in the encrypted vault model.
Motivation: The product scope includes document records beyond simple credentials.
Scope includes: document create; edit; list; delete.
Out of scope: binary attachments.
Dependencies: `P7-C01`; `P3-C03`.
Files/areas impacted: `apps/web`; `apps/api`; `packages/contracts`.
Deliverables: encrypted document CRUD over the shared `vault_items` model with working web shell create/edit/delete flow.
Required tests: API integration tests for document create/list/detail/delete; cross-user `404`; web workspace tests covering document update conflict handling.
Acceptance criteria: document items behave consistently with the same encrypted vault model used by login items and no second persistence path exists.
Risks / cautions: keep field semantics aligned with export and sync formats.
Notes for Codex/dev: do not invent a second persistence model for documents.
Evidence required to mark done: passing API and web test output plus working `/vault` document flow after `local unlock`.
Suggested next action: implement `P7-C03` before sync work so delete semantics stop relying on temporary hard delete.

### P7-C03 - Tombstones
Card ID: `P7-C03`
Title: `Tombstones`
Phase/Epic: `Phase 7 - Vault CRUD and Local Search`
Status: `done`
Priority: `P0`
Objective: Represent deletions in a sync-safe way using tombstones.
Description: Add deletion markers and the local/server handling required for later sync correctness.
Motivation: Hard deletes without tombstones will break deterministic multi-device sync.
Scope includes: tombstone schema; delete path updates; retention semantics if defined.
Out of scope: full sync algorithm.
Dependencies: `P0-C10`; `P7-C01`.
Files/areas impacted: `packages/contracts`; `apps/api`; `apps/web`.
Deliverables: tombstone model and delete flow support.
Required tests: integration tests for delete and subsequent state reconciliation.
Acceptance criteria: deletes produce tombstones according to the sync contract.
Risks / cautions: mismatched tombstone semantics will create ghost items across devices.
Notes for Codex/dev: keep delete semantics explicit in both API and local state.
Evidence required to mark done: passing storage, adapter, API, and migration validation proving delete creates tombstones while live list/detail remain tombstone-free.
Suggested next action: keep tombstone semantics stable and use them as the baseline for later sync work.

### P7-C04 - Local decrypted index
Card ID: `P7-C04`
Title: `Local decrypted index`
Phase/Epic: `Phase 7 - Vault CRUD and Local Search`
Status: `done`
Priority: `P1`
Objective: Implement the client-only search index approved by the ADR.
Description: Build the local decrypted index used for search, filtering, and tags without server-side plaintext search.
Motivation: Search usability must exist without violating the zero-knowledge boundary.
Scope includes: local index population; updates on CRUD; search query helpers.
Out of scope: server-side plaintext search.
Dependencies: `P0-C09`; `P6-C04`; `P7-C01`; `P7-C02`.
Files/areas impacted: `apps/web`.
Deliverables: local search index implementation and update hooks.
Required tests: unit tests for index updates and query behavior.
Acceptance criteria: search works locally and respects the approved metadata boundaries.
Risks / cautions: accidental indexing of disallowed fields would violate the search ADR.
Notes for Codex/dev: only index fields explicitly approved by the design.
Evidence required to mark done: passing web search-helper and workspace tests showing approved-field indexing only, password exclusion, CRUD-driven index updates, and filtered UI behavior.
Suggested next action: carry the stabilized search and delete semantics into the Phase 7.5 UX/UI baseline.

### P7-C05 - Password generator
Card ID: `P7-C05`
Title: `Password generator`
Phase/Epic: `Phase 7 - Vault CRUD and Local Search`
Status: `done`
Priority: `P2`
Objective: Provide a local password generation utility for login creation flows.
Description: Build the password generator UI and helper logic used when creating or updating login items.
Motivation: This is standard password-manager functionality and supports better credential hygiene.
Scope includes: generator options; generation helper; UI integration.
Out of scope: breach checks or online password quality services.
Dependencies: `P7-C01`.
Files/areas impacted: `apps/web`; possibly `packages/shared`.
Deliverables: password generator component and tests.
Required tests: unit tests for generator constraints.
Acceptance criteria: generator produces passwords that match the selected settings.
Risks / cautions: randomness source must be appropriate for credential generation.
Notes for Codex/dev: use browser crypto APIs, not `Math.random`.
Evidence required to mark done: generator tests and integrated create-login flow.
Suggested next action: implement generator helper before wiring the UI.

## Phase 7.5

### P75-C01 - Visual direction and tokens
Card ID: `P75-C01`
Title: `Visual direction and tokens`
Phase/Epic: `Phase 7.5 - UX/UI Visual Baseline`
Status: `done`
Priority: `P1`
Objective: Freeze the visual direction for the web core once auth and initial vault CRUD are functionally real.
Description: Define typography, spacing scale, color tokens, surface hierarchy, and motion rules for the current web application so later phases stop inventing one-off presentation decisions.
Motivation: Doing this before Phase 7 stabilizes would create churn; doing it after Phase 8 and Phase 9 would multiply retrofit cost across more surfaces.
Scope includes: typography selection; spacing and radius rules; semantic color tokens; surface and elevation rules; motion guidance for page and state transitions; documentation of the chosen visual direction in code and docs where needed.
Out of scope: extension-specific styling, marketing pages, or speculative component-library abstraction not yet justified by implemented surfaces.
Dependencies: `P7-C01`; `P7-C02`.
Files/areas impacted: `apps/web`; shared styles; `docs/UI_STYLE.md`; `docs/EXTENSION_UX_BASELINE.md`; status and design docs if needed.
Deliverables: committed visual baseline with tokens or equivalent CSS variables, plus the first applied pass on existing auth and vault surfaces.
Required tests: verify `npm run dev:web` renders without style regressions on onboarding, auth, unlock, and vault shell routes; add component or snapshot tests only where they protect tokens or critical layout invariants.
Acceptance criteria: the web core has one coherent visual baseline applied across existing routes, and later cards can reference those decisions instead of creating local styling rules.
Risks / cautions: locking the visual direction before `P7-C03` and `P7-C04` would cause rework; over-engineering a design system here would slow delivery without adding real leverage.
Notes for Codex/dev: prefer CSS variables and clear tokens over framework-heavy abstraction; preserve the existing product scope and flows.
Evidence required to mark done: committed token baseline, committed `docs/UI_STYLE.md`, committed `docs/EXTENSION_UX_BASELINE.md`, updated core screens using the baseline, and visual proof or review notes covering onboarding, auth, unlock, and vault shell.
Suggested next action: establish the token layer and apply it to the existing web shell.

### P75-C02 - Core layout and navigation patterns
Card ID: `P75-C02`
Title: `Core layout and navigation patterns`
Phase/Epic: `Phase 7.5 - UX/UI Visual Baseline`
Status: `done`
Priority: `P1`
Objective: Standardize the core shell structure and navigation behavior before more product surfaces are added.
Description: Align top-level layout, navigation affordances, workspace composition, and item-list/editor structure across the implemented web core.
Motivation: Attachments, sync, device, and owner/admin work will add UI quickly; layout inconsistency will become expensive if the shell is not stabilized first.
Scope includes: app shell layout; nav behavior; vault list/editor composition; consistent page headers; action placement; state transitions between list and editor views.
Out of scope: extension popup layout or separate design treatment for future owner/admin consoles not yet implemented.
Dependencies: `P75-C01`; `P6-C01`; `P7-C01`; `P7-C02`.
Files/areas impacted: `apps/web/src/pages`; routing-adjacent layout components; shared CSS.
Deliverables: updated shell and page layouts for current implemented routes.
Required tests: verify route navigation behavior on desktop and mobile-width layouts; run existing web tests and add focused UI tests for shell rendering where layout behavior is non-trivial.
Acceptance criteria: implemented screens use consistent navigation and layout patterns, and new surfaces in Phase 8+ can extend the same shell without structural redesign.
Risks / cautions: changing layout before search and delete semantics are stable will cause churn in the workspace composition.
Notes for Codex/dev: solve for the routes that already exist; avoid introducing parallel layout systems.
Evidence required to mark done: committed layout updates plus review evidence showing consistent shell behavior across onboarding, auth, unlock, and vault shell.
Suggested next action: align the current vault workspace and auth shell under one navigational pattern.

### P75-C03 - Form, feedback, and destructive-action patterns
Card ID: `P75-C03`
Title: `Form, feedback, and destructive-action patterns`
Phase/Epic: `Phase 7.5 - UX/UI Visual Baseline`
Status: `done`
Priority: `P1`
Objective: Standardize input, validation, error, success, empty, loading, and destructive-action patterns used across the current web core.
Description: Apply consistent form layout, validation messaging, banners, empty states, inline feedback, and deletion confirmations to the implemented flows.
Motivation: This is the point where the app has enough real flows to define patterns from actual usage instead of inventing them speculatively.
Scope includes: form field structure; error messages; success feedback; loading indicators; empty states; confirmation UI for delete operations; recoverable conflict messaging where already applicable.
Out of scope: sync conflict UI beyond current implemented CRUD semantics, attachment-specific UX, or advanced notification systems.
Dependencies: `P75-C01`; `P75-C02`; `P5-C02`; `P7-C01`; `P7-C02`; `P7-C03`.
Files/areas impacted: `apps/web/src/pages`; shared UI helpers; form-related styles.
Deliverables: standardized patterns applied to onboarding, authentication, unlock, and vault CRUD forms and destructive actions.
Required tests: run existing web tests and add focused component or interaction tests for delete confirmation, validation rendering, and empty-state behavior where regressions would be easy to miss.
Acceptance criteria: the current app no longer mixes unrelated feedback styles or destructive-action patterns across routes.
Risks / cautions: applying this before `P7-C03` would force a second pass on delete UX once tombstones replace hard delete semantics.
Notes for Codex/dev: keep wording and state names aligned with canonical terminology and existing API error codes.
Evidence required to mark done: committed UI updates on onboarding, authentication, unlock, and vault shell plus passing focused interaction tests for busy states, inline feedback, keyboard-driven context closure, and actionable empty states.
Suggested next action: use the normalized patterns as the default baseline for attachment and device-facing forms.

### P75-C04 - Responsive and accessibility pass for web core
Card ID: `P75-C04`
Title: `Responsive and accessibility pass for web core`
Phase/Epic: `Phase 7.5 - UX/UI Visual Baseline`
Status: `done`
Priority: `P1`
Objective: Make the stabilized web core responsive and accessible before Phase 8 and beyond expand the surface area.
Description: Run a focused pass on keyboard navigation, contrast, semantics, focus handling, and small-screen layout behavior across the implemented screens.
Motivation: Doing this after attachments, sync, and lifecycle UI land would spread the same issues across more routes and increase retrofit cost.
Scope includes: responsive layout adjustments; focus states; keyboard path validation; semantic structure; contrast review; screen-reader-relevant labels where applicable.
Out of scope: full accessibility certification work or extension-specific accessibility review.
Dependencies: `P75-C02`; `P75-C03`.
Files/areas impacted: `apps/web`; shared styles; page components.
Deliverables: responsive and accessibility fixes applied to the existing web core.
Required tests: manual keyboard and narrow-width pass across onboarding, auth, unlock, and vault shell; automated tests or audits only where they protect specific implemented fixes.
Acceptance criteria: the current web core is usable on desktop and mobile widths, keyboard navigation is viable, and obvious accessibility regressions are addressed before later phases build on the same patterns.
Risks / cautions: leaving this until after Phase 8 or Phase 9 would multiply the cost of every accessibility or layout fix.
Notes for Codex/dev: keep this pass practical and tied to implemented routes; do not turn it into a speculative audit of future screens.
Evidence required to mark done: committed responsive CSS refinements, keyboard shortcut handling for vault search and context closure, passing web tests, and successful typecheck/build for the web app and full monorepo.
Suggested next action: extend the same baseline into attachment flows without introducing a parallel layout or feedback system.

## Phase 8

### P8-C01 - Upload initialization and pending records
Card ID: `P8-C01`
Title: `Upload initialization and pending records`
Phase/Epic: `Phase 8 - Attachments and Documents`
Status: `done`
Priority: `P0`
Objective: Initialize attachment uploads with explicit `pending` state.
Description: Create the server and client flow that reserves an attachment upload and records its `pending` lifecycle state.
Motivation: Attachment consistency depends on explicit intermediate state, not implicit assumptions.
Scope includes: pending record creation; upload token or target issuance; expiration metadata.
Out of scope: final item binding.
Dependencies: `P0-C13`; `P4-C03`; `P4-C04`.
Files/areas impacted: `apps/api`; `apps/web`; storage adapters; `packages/contracts`.
Deliverables: upload init API and pending record model.
Required tests: Add integration tests covering `pending` record creation, idempotent retry behavior, expired pending rejection, and invalid finalize attempts before upload completion.
Acceptance criteria: uploads begin with durable `pending` records and clear expiration rules.
Risks / cautions: missing pending state will create orphaned or ambiguous uploads.
Notes for Codex/dev: the pending model must support idempotent client retries.
Evidence required to mark done: Passing pending-state tests plus committed API contract or route definitions for init and expiry handling.
Suggested next action: define attachment state machine and init endpoint.

### P8-C02 - Encrypted upload
Card ID: `P8-C02`
Title: `Encrypted upload`
Phase/Epic: `Phase 8 - Attachments and Documents`
Status: `done`
Priority: `P0`
Objective: Upload encrypted attachment blobs to object storage.
Description: Implement the client encryption and object upload flow for attachment content.
Motivation: Attachments must preserve the zero-knowledge boundary.
Scope includes: blob encryption; upload transport; metadata required for later decryption.
Out of scope: item binding finalization.
Dependencies: `P3-C04`; `P8-C01`.
Files/areas impacted: `apps/web`; storage adapters; `packages/crypto`.
Deliverables: encrypted upload flow and storage write path.
Required tests: integration tests for upload success and interrupted upload behavior.
Acceptance criteria: uploaded blobs are encrypted and associated only with a pending upload record.
Risks / cautions: do not leak filename or content metadata beyond approved fields.
Notes for Codex/dev: the upload path must remain retry-safe.
Evidence required to mark done: uploaded encrypted blob verified in storage test path.
Suggested next action: wire client blob encryption into the upload transport.

### P8-C03 - Finalize bind to item
Card ID: `P8-C03`
Title: `Finalize bind to item`
Phase/Epic: `Phase 8 - Attachments and Documents`
Status: `done`
Priority: `P0`
Objective: Convert a successful pending upload into an attached item reference.
Description: Finalize the attachment by storing the encrypted metadata and binding the object to a specific vault item.
Motivation: The state transition from `pending` to attached must be explicit and testable.
Scope includes: finalize API; metadata persistence; item association; idempotency rules.
Out of scope: later deletion cleanup.
Dependencies: `P8-C01`; `P8-C02`; `P7-C01` or `P7-C02`.
Files/areas impacted: `apps/api`; `apps/web`; `packages/contracts`.
Deliverables: finalize flow with clear state transition.
Required tests: Add integration tests covering successful finalize, duplicate finalize idempotency, missing pending upload rejection, and finalize rejection when blob upload is incomplete.
Acceptance criteria: only completed uploads can be attached and finalized exactly as defined.
Risks / cautions: ambiguous finalize semantics will leak into sync and backup complexity.
Notes for Codex/dev: document the transition from `pending` to attached in code comments only where needed.
Evidence required to mark done: Passing finalize tests plus storage-state verification showing correct metadata binding only after successful finalize.
Suggested next action: define finalize contract with explicit idempotency behavior.

### P8-C04 - Encrypted download
Card ID: `P8-C04`
Title: `Encrypted download`
Phase/Epic: `Phase 8 - Attachments and Documents`
Status: `done`
Priority: `P1`
Objective: Download and decrypt attachments for authorized users.
Description: Implement retrieval of encrypted blobs and client-side decryption for attachments bound to accessible items.
Motivation: Attachments are not useful without a safe retrieval path.
Scope includes: download flow; decryption; access checks.
Out of scope: offline bulk export.
Dependencies: `P8-C03`; `P3-C04`.
Files/areas impacted: `apps/web`; `apps/api`; `packages/crypto`.
Deliverables: attachment download and decrypt flow.
Required tests: Add integration tests for authorized download, rejection for mismatched owner or invalid attachment state, and client decrypt success using the approved blob envelope.
Acceptance criteria: users can retrieve and decrypt attachments bound to accessible items.
Risks / cautions: access checks must be tied to vault item ownership rules.
Notes for Codex/dev: keep decrypted blobs out of persistent storage unless explicitly allowed.
Evidence required to mark done: Passing download and decrypt tests plus one fixture-backed retrieval path proving authorized access only.
Suggested next action: implement signed or authorized fetch path and client decrypt handler.

### P8-C05 - Attachment deletion
Card ID: `P8-C05`
Title: `Attachment deletion`
Phase/Epic: `Phase 8 - Attachments and Documents`
Status: `done`
Priority: `P1`
Objective: Delete attachments safely under the defined lifecycle policy.
Description: Add deletion behavior for bound attachments, including metadata state transitions and storage cleanup triggers.
Motivation: Attachment lifecycle must be reversible and auditable where required.
Scope includes: delete API; metadata updates; cleanup scheduling or immediate removal according to policy.
Out of scope: orphan sweeps for abandoned pending uploads.
Dependencies: `P8-C03`; `P8-C06`.
Files/areas impacted: `apps/api`; storage adapters; `apps/web`.
Deliverables: attachment delete path and cleanup behavior.
Required tests: Add integration tests for first delete, repeated delete idempotency, and correct ordering of metadata versus blob cleanup according to policy.
Acceptance criteria: attachment deletion follows the documented lifecycle rules without orphaning unexpected state.
Risks / cautions: object deletion order matters when metadata and blobs can diverge.
Notes for Codex/dev: make delete semantics idempotent.
Evidence required to mark done: Passing attachment-delete tests plus lifecycle notes showing final metadata and blob state after delete.
Suggested next action: define deletion transition and cleanup trigger strategy.

### P8-C06 - Orphan cleanup strategy implementation
Card ID: `P8-C06`
Title: `Orphan cleanup strategy implementation`
Phase/Epic: `Phase 8 - Attachments and Documents`
Status: `done`
Priority: `P1`
Objective: Clean up abandoned `pending` uploads and orphaned attachment artifacts.
Description: Implement the reconciliation or cleanup mechanism defined by the attachment lifecycle ADR.
Motivation: Object storage costs and integrity degrade quickly without orphan cleanup.
Scope includes: expiry sweeps; orphan detection; cleanup logs.
Out of scope: user-facing document management UI.
Dependencies: `P0-C13`; `P8-C01`; `P8-C05`.
Files/areas impacted: `apps/api`; storage adapters; ops docs.
Deliverables: cleanup job or sweep path and operator documentation.
Required tests: Add integration tests or job tests covering expired `pending` cleanup, orphan detection for abandoned uploads, and non-deletion of still-valid pending records.
Acceptance criteria: expired or orphaned artifacts are removed according to policy.
Risks / cautions: overly aggressive cleanup can destroy valid data.
Notes for Codex/dev: keep detection rules conservative and documented.
Evidence required to mark done: Passing cleanup tests plus a recorded sweep run or equivalent proof showing expired or orphaned artifacts are removed conservatively.
Suggested next action: implement expiry sweep over pending attachment records.

### P8-C07 - Document UX
Card ID: `P8-C07`
Title: `Document UX`
Phase/Epic: `Phase 8 - Attachments and Documents`
Status: `done`
Priority: `P2`
Objective: Provide usable document and attachment interactions in the web UI.
Description: Add the UI flows for viewing, attaching, and managing documents and related files.
Motivation: The underlying attachment lifecycle needs a coherent user-facing surface.
Scope includes: document detail surfaces; attach action; upload status visibility for `pending` and `uploaded` lifecycle states.
Out of scope: browser extension document support; attachment download and delete actions (deferred to `P8-C04` and `P8-C05`).
Dependencies: `P7-C02`; `P8-C01`; `P8-C02`.
Files/areas impacted: `apps/web`.
Deliverables: document and attachment UI flows.
Required tests: component tests covering attach flow initiation, upload status rendering, and upload error states.
Acceptance criteria: users can attach document files through the approved encrypted upload flow and can see explicit lifecycle status in the document detail surface.
Risks / cautions: unclear UI state around pending uploads will confuse users.
Notes for Codex/dev: expose attachment state explicitly in UI.
Evidence required to mark done: passing web component tests showing attach + status flow, plus local UI verification in `/vault` document detail.
Suggested next action: build document detail screen with attachment status area.

### P8-C08 - Quota and cost warning UI
Card ID: `P8-C08`
Title: `Quota and cost warning UI`
Phase/Epic: `Phase 8 - Attachments and Documents`
Status: `done`
Priority: `P2`
Objective: Surface quota usage and cost-sensitive warnings for attachment storage.
Description: Implement UI indicators and limit handling for attachment quotas as defined by the plan.
Motivation: Storage-related constraints need to be visible before uploads fail unexpectedly.
Scope includes: quota summary; pre-upload warnings; limit-reached messaging.
Out of scope: billing systems.
Dependencies: `P0-C15`; `P8-C01`; `P8-C07`.
Files/areas impacted: `apps/web`; `apps/api`.
Deliverables: quota UI and supporting endpoint or computed data.
Required tests: component tests for warning states.
Acceptance criteria: users see accurate quota information and clear upload limit warnings.
Risks / cautions: ambiguous scope of quota ownership will create misleading UI.
Notes for Codex/dev: wording must match whether quota is per user, deployment, or both.
Evidence required to mark done: tested UI states for near-limit and limit-reached cases.
Suggested next action: expose quota summary contract before building warning UI.
## Phase 9

### P9-C01 - Sync service baseline
Card ID: `P9-C01`
Title: `Sync service baseline`
Phase/Epic: `Phase 9 - Sync, Devices, and Password Rotation`
Status: `done`
Priority: `P0`
Objective: Implement the baseline sync loop and change fetch or push primitives.
Description: Build the minimal sync service needed to reconcile vault item changes across trusted devices.
Motivation: Multi-device correctness depends on an explicit sync contract, not ad hoc refresh logic.
Scope includes: change fetch; change submit; revision tracking or equivalent baseline.
Out of scope: conflict UI.
Dependencies: `P0-C10`; `P7-C03`; `P4-C04`.
Files/areas impacted: `apps/api`; `apps/web`; `packages/contracts`.
Deliverables: baseline sync API and client sync orchestrator.
Required tests: Add multi-device integration tests covering create, update, delete or tombstone propagation, and replay-safe resync after one device falls behind.
Acceptance criteria: two devices can converge on the same item state through the approved sync path.
Risks / cautions: implicit last-write-wins behavior will hide data loss if not explicit.
Notes for Codex/dev: keep sync metadata versioned and visible in contracts.
Evidence required to mark done: Passing multi-device sync test matrix with at least two simulated devices and recorded convergence results.
Suggested next action: implement basic delta-sync endpoints and client service.

### P9-C02 - Deterministic conflict handling
Card ID: `P9-C02`
Title: `Deterministic conflict handling`
Phase/Epic: `Phase 9 - Sync, Devices, and Password Rotation`
Status: `done`
Priority: `P0`
Objective: Apply the ADR-defined conflict policy in code.
Description: Implement the exact conflict rules and any conflict surface required by the plan.
Motivation: Sync without a deterministic conflict policy will cause silent corruption or unpredictable merges.
Scope includes: conflict detection; conflict resolution policy; client-visible handling if required.
Out of scope: speculative collaborative editing.
Dependencies: `P0-C10`; `P9-C01`.
Files/areas impacted: `apps/api`; `apps/web`; `packages/contracts`.
Deliverables: conflict resolution logic and tests.
Required tests: Add concurrent update tests using the ADR examples, including same-item concurrent edits and deterministic winner or conflict outcomes.
Acceptance criteria: conflicting edits resolve exactly according to the ADR and are reproducible in tests.
Risks / cautions: undocumented fallback behavior here is unacceptable.
Notes for Codex/dev: write tests from the ADR examples first.
Evidence required to mark done: Passing concurrent-change test matrix tied to the ADR examples and expected resolution outcomes.
Suggested next action: encode conflict rules as contract-level test fixtures.

### P9-C03 - Device listing
Card ID: `P9-C03`
Title: `Device listing`
Phase/Epic: `Phase 9 - Sync, Devices, and Password Rotation`
Status: `done`
Priority: `P1`
Objective: Expose the list of trusted devices for the current account.
Description: Build the API and UI to show registered devices with relevant metadata.
Motivation: Users need visibility into where their vault is accessible.
Scope includes: device metadata list; created-at; `lastAuthenticatedAt`; current-device marker.
Out of scope: revocation itself.
Dependencies: `P5-C03`; `P5-C04`.
Files/areas impacted: `apps/api`; `apps/web`; `packages/contracts`.
Deliverables: device list endpoint and management screen.
Required tests: integration tests for device listing; UI rendering tests.
Acceptance criteria: user can view registered devices with correct metadata.
Risks / cautions: avoid exposing sensitive internals or misleading timestamps.
Notes for Codex/dev: keep displayed metadata minimal and useful.
Evidence required to mark done: device screen and list tests.
Suggested next action: define device summary contract and render the list UI.

### P9-C04 - Device revocation
Card ID: `P9-C04`
Title: `Device revocation`
Phase/Epic: `Phase 9 - Sync, Devices, and Password Rotation`
Status: `done`
Priority: `P0`
Objective: Revoke a trusted device and prevent further use according to policy.
Description: Implement device revocation, session invalidation, and any bootstrap restrictions required after revocation.
Motivation: Multi-device support is incomplete without a secure offboarding path.
Scope includes: revoke action; revocation persistence; session invalidation; sync rejection for revoked device.
Out of scope: full user deprovisioning.
Dependencies: `P9-C03`; `P5-C05`; `P4-C07`.
Files/areas impacted: `apps/api`; `apps/web`; `packages/contracts`.
Deliverables: revoke endpoint, UI action, and enforcement logic.
Required tests: Add integration tests covering revoke-current-device guardrails if applicable, revoked-device request rejection, revoked sync rejection, and session invalidation after device revocation.
Acceptance criteria: revoked devices cannot continue trusted operation and are reflected correctly in UI.
Risks / cautions: incomplete revocation will create false confidence.
Notes for Codex/dev: enforce revocation in every trusted-device path, not just UI.
Evidence required to mark done: Passing revocation tests plus evidence that a revoked device can no longer call protected routes or complete trusted-device sync.
Suggested next action: implement revocation state and enforcement checks.

### P9-C05 - Password rotation atomic flow
Card ID: `P9-C05`
Title: `Password rotation atomic flow`
Phase/Epic: `Phase 9 - Sync, Devices, and Password Rotation`
Status: `done`
Priority: `P0`
Objective: Change the master password atomically using `expected_bundle_version` semantics.
Description: Implement password rotation with the re-encryption and persistence invariants defined by the ADR.
Motivation: Master password changes are high-risk operations that must not create partial rekey states.
Scope includes: `expected_bundle_version` checks; re-encryption flow; failure handling; session handling after rotation.
Out of scope: account recovery.
Dependencies: `P0-C14`; `P3-C06`; `P9-C01`.
Files/areas impacted: `apps/api`; `apps/web`; `packages/crypto`; `packages/contracts`.
Deliverables: atomic password rotation flow and tests.
Required tests: Add integration tests covering successful rotation, stale `expected_bundle_version`, interrupted failure with rollback-safe behavior, and rejection of mixed-version post-rotation state.
Acceptance criteria: rotation either completes fully or fails without leaving mixed key state.
Risks / cautions: partial bundle updates here can permanently break an account.
Notes for Codex/dev: test stale-version behavior before implementing the happy path.
Evidence required to mark done: Passing password-rotation matrix plus recorded verification that bundle state remains unchanged on stale-version or interrupted-failure cases.
Suggested next action: define rotation transaction contract around `expected_bundle_version`.

### P9-C06 - Security hardening remediation pack (8 audit findings)
Card ID: `P9-C06`
Title: `Security hardening remediation pack (8 audit findings)`
Phase/Epic: `Phase 9 - Sync, Devices, and Password Rotation`
Status: `done`
Priority: `P0`
Objective: Resolve the full set of 8 security findings from the 2026-03-17 repository audit before advancing high-churn features.
Description: Implement a tightly-scoped hardening pass across API, runtime config, browser persistence, and client guardrails, with explicit regression coverage for authentication abuse, local secret exposure, and production fail-closed behavior.
Motivation: The audit found multiple high-severity issues where abuse resistance and secret handling can fail under realistic attack conditions. Deferring these fixes until post-sync would increase blast radius and rework cost.
Scope includes:
- Finding 1 (`high`): Add brute-force protection to `/api/auth/devices/bootstrap`, parity with remote-auth controls.
- Finding 2 (`high`): Remove persistent plaintext-equivalent `accountKey` exposure from trusted local state storage; keep `local unlock` semantics intact.
- Finding 3 (`high`): Replace unbounded auth-rate counter behavior with windowed or TTL-based rate limiting and deterministic unlock behavior after cooldown.
- Finding 4 (`high`): Enforce fail-closed production configuration for `VAULTLITE_BOOTSTRAP_ADMIN_TOKEN` (reject weak/default/empty tokens in production runtime mode).
- Finding 5 (`medium`): Enforce stable Account Kit signing key posture in production (no ephemeral keypair fallback in production runtime mode).
- Finding 6 (`medium`): Add payload and attachment size ceilings (contracts + API validation) to reduce DoS and cost-amplification vectors.
- Finding 7 (`medium`): Restrict URL open actions to allowed schemes (`http` and `https`) before client navigation.
- Finding 8 (`low` hardening): Expand default security headers baseline (including deployment-safe HSTS/Permissions-Policy posture).
Out of scope:
- Full account-lockout policy redesign beyond the bounded anti-abuse mechanism required for this fix pack.
- New auth factors, recovery mechanisms, or canonical terminology changes.
- Broad UI redesign not directly required by the hardening findings.
Dependencies: `P4-C05`; `P4-C08`; `P5-C04`; `P6-C04`; `P6-C08`; `P6-C09`.
Files/areas impacted: `apps/api/src/app.ts`; `apps/api/src/runtime-config.ts`; `apps/api/src/runtime-config.test.ts`; `apps/web/src/lib/session-store.ts`; `apps/web/src/lib/trusted-local-state.ts`; `apps/web/src/pages/VaultShellPage.vue`; `adapters/cloudflare-storage/src/index.ts`; `infrastructure/migrations/*.sql` if schema updates are required; `packages/contracts/src/shared.ts`; `packages/contracts/src/api.ts`; `adapters/cloudflare-runtime/src/index.ts`; related tests.
Deliverables:
- Hardened auth-abuse controls for both trusted-device remote auth and device bootstrap.
- Runtime config fail-closed checks for production secrets and Account Kit signing key policy.
- Local-state storage model aligned with zero-knowledge and local storage policy constraints.
- Input and blob size enforcement in contracts and server validation path.
- Safe URL handling and updated security header baseline.
- Regression tests and updated security documentation notes.
Required tests:
- API integration test: repeated invalid `/api/auth/devices/bootstrap` attempts hit `429` with generic anti-enumeration-safe response.
- API integration test: rate-limit window expires and allows a fresh attempt after cooldown.
- API runtime-config test matrix: production mode rejects default or missing bootstrap token and rejects missing persistent Account Kit signing keys.
- Web/session-store tests: trusted local state no longer persists `accountKey` directly while `local unlock` and `session restoration` still behave correctly.
- Contract and API validation tests: oversized encrypted payload and oversized attachment init are rejected with explicit error codes.
- Web UI test: URL open action refuses non-http(s) schemes.
- Runtime headers test: expected header set emitted (`content-security-policy`, `x-content-type-options`, `x-frame-options`, `referrer-policy`, `permissions-policy`, and conditional HSTS policy validation path).
- Full targeted test execution: `npm run test --workspace apps/api` and focused `apps/web` tests touched by this card.
Acceptance criteria:
- All 8 findings are explicitly closed with code and test evidence.
- `/api/auth/devices/bootstrap` has anti-abuse behavior equivalent to or stronger than remote-auth.
- Auth-rate controls use bounded time semantics; no indefinite lockout behavior remains.
- Production runtime rejects weak/default secret posture instead of silently falling back.
- Trusted local persistence no longer stores `accountKey` directly at rest.
- API input ceilings enforce practical limits for payload and attachment vectors.
- URL open behavior is scheme-safe by construction.
- Security header baseline is expanded and verified by tests.
Risks / cautions:
- Local-state changes can break `local unlock` if migration logic is not backward-safe.
- Rate-limit window implementation can create accidental denial of service if thresholds are too strict.
- Production fail-closed checks can block local/dev flows if environment-mode detection is ambiguous.
- Header tightening can break embedded tooling if policies are applied without explicit exceptions.
Notes for Codex/dev:
- Preserve canonical terminology exactly: `remote authentication`, `local unlock`, `session restoration`, `expected_bundle_version`, `deprovisioned`.
- Keep anti-enumeration behavior generic; do not leak username or device existence via status text or timing branches where avoidable.
- If persistence schema changes are needed for rate-limit windows, include migration + rollback-safe tests.
- Treat this as a security hardening card, not a feature card; avoid opportunistic refactors not tied to the findings.
Evidence required to mark done:
- PR/repo diff mapping each of the 8 findings to a concrete patch and corresponding test.
- Passing API and targeted web test output attached to the card notes.
- Updated security notes in `docs/SECURITY.md` and/or `docs/THREAT_MODEL.md` for changed assumptions (rate-limit windowing, production secret posture, local persistence boundaries).
- Short closure table in the card notes: `finding -> fix -> test file -> status`.
Suggested next action: implement in three slices (`auth abuse and runtime fail-closed`, `local persistence and payload ceilings`, `client URL + headers hardening`) with tests committed in the same sequence.

Closure evidence snapshot:
- Finding 1 (`bootstrap brute-force`) -> rate-limit parity added in `/api/auth/devices/bootstrap` -> `apps/api/src/app.test.ts` (`applies rate limiting to device bootstrap...`) -> `closed`.
- Finding 2 (`trusted local plaintext-equivalent`) -> trusted local state sanitization + removal of `accountKit` persistence in session flows -> `apps/web/src/lib/trusted-local-state.test.ts`, `apps/web/src/lib/session-store.test.ts` -> `closed`.
- Finding 3 (`unbounded rate-limit`) -> explicit window contract + storage migration (`window_ends_at`) -> `packages/storage-abstractions/src/storage.test.ts`, `adapters/cloudflare-storage/src/migrations.test.ts` -> `closed`.
- Finding 4 (`bootstrap token fail-closed`) -> production runtime token validation + explicit runtime mode -> `apps/api/src/runtime-config.test.ts` -> `closed`.
- Finding 5 (`ephemeral key / in-memory in production`) -> production keypair requirement + distributed-storage enforcement -> `apps/api/src/runtime-config.test.ts`, `apps/api/src/index.test.ts`, `apps/api/src/worker-storage.test.ts` -> `closed`.
- Finding 6 (`payload/upload ceilings`) -> contract max + API body cutoff + envelope semantic size check -> `packages/contracts/src/schemas.test.ts`, `apps/api/src/app.test.ts` -> `closed`.
- Finding 7 (`unsafe URL schemes`) -> `http/https` allowlist + userinfo block + secure open flags -> `apps/web/src/pages/VaultShellPage.test.ts` -> `closed`.
- Finding 8 (`security headers baseline`) -> CSP + permissions-policy + no-store + conditional HSTS + error-path coverage -> `adapters/cloudflare-runtime/src/runtime.test.ts`, `apps/api/src/app.test.ts` -> `closed`.

## Phase 9.5

### P95-C01 - User listing and status view
Card ID: `P95-C01`
Title: `User listing and status view`
Phase/Epic: `Phase 9.5 - Owner/Admin User Lifecycle Operations`
Status: `done`
Priority: `P1`
Objective: Expose deployment users and their lifecycle states to owner or admin operators.
Description: Build the management view for listing users and showing current lifecycle status.
Motivation: Operational lifecycle controls need visibility before actions can be taken safely.
Scope includes: user list; lifecycle state display; role display.
Out of scope: lifecycle mutations.
Dependencies: `P0-C15`; `P4-C07`.
Files/areas impacted: `apps/api`; `apps/web`; `packages/contracts`.
Deliverables: user listing endpoint and management UI.
Required tests: Add integration tests for admin user listing and UI tests covering lifecycle badges, role rendering, and visibility of `deprovisioned` state.
Acceptance criteria: owner or admin can view users and their current state, including `deprovisioned` where applicable.
Risks / cautions: do not leak cross-account data or unnecessary personal detail.
Notes for Codex/dev: lifecycle states must use canonical names only.
Evidence required to mark done: Passing admin user-list API tests plus UI evidence showing correct lifecycle-state mapping.
Suggested next action: define lifecycle summary contract and render the admin list.

### P95-C02 - Suspend endpoint and UI
Card ID: `P95-C02`
Title: `Suspend endpoint and UI`
Phase/Epic: `Phase 9.5 - Owner/Admin User Lifecycle Operations`
Status: `done`
Priority: `P0`
Objective: Suspend a user without fully removing their account state.
Description: Implement the admin action and enforcement required to place a user into suspended status.
Motivation: Suspension is a necessary operational control distinct from full deprovisioning.
Scope includes: suspend action; authorization checks; status propagation.
Out of scope: irreversible user removal.
Dependencies: `P95-C01`; `P4-C07`.
Files/areas impacted: `apps/api`; `apps/web`.
Deliverables: suspend endpoint, UI control, and enforcement behavior.
Required tests: Add integration tests covering authorized suspend action, unauthorized suspend rejection, suspended-user request denial, and expected UI state update after suspension.
Acceptance criteria: suspended users are blocked exactly where the policy requires.
Risks / cautions: partial enforcement will create inconsistent account state.
Notes for Codex/dev: suspension effects on sessions and devices must be explicit even if implemented in a later card.
Evidence required to mark done: Passing suspend tests plus evidence that suspended users lose the allowed access paths defined by the lifecycle policy.
Suggested next action: implement lifecycle mutation endpoint with policy checks.

### P95-C03 - Reactivate endpoint and UI
Card ID: `P95-C03`
Title: `Reactivate endpoint and UI`
Phase/Epic: `Phase 9.5 - Owner/Admin User Lifecycle Operations`
Status: `done`
Priority: `P1`
Objective: Restore a suspended user to active status.
Description: Implement the admin action for reactivation and the resulting policy transitions.
Motivation: Suspension without controlled restoration creates operational dead ends.
Scope includes: reactivate action; policy validation; UI state update.
Out of scope: device bootstrap of new devices after reactivation if separately controlled.
Dependencies: `P95-C02`.
Files/areas impacted: `apps/api`; `apps/web`.
Deliverables: reactivation endpoint and UI action.
Required tests: Add integration tests for successful reactivation, invalid transition rejection, and restored access behavior only where policy permits it.
Acceptance criteria: reactivated users return to the allowed state defined by the lifecycle policy.
Risks / cautions: invalid transitions should fail clearly.
Notes for Codex/dev: keep lifecycle transition table centralized.
Evidence required to mark done: Passing reactivation tests plus evidence of the expected post-reactivation lifecycle state.
Suggested next action: encode valid lifecycle transitions before UI work.

### P95-C04 - Deprovision endpoint and UI
Card ID: `P95-C04`
Title: `Deprovision endpoint and UI`
Phase/Epic: `Phase 9.5 - Owner/Admin User Lifecycle Operations`
Status: `done`
Priority: `P0`
Objective: Deprovision a user according to the plan's operational model.
Description: Implement the admin action that places a user into `deprovisioned` state and applies the required downstream effects.
Motivation: Permanent or near-permanent account removal semantics must be explicit and enforced.
Scope includes: `deprovisioned` transition; authorization; downstream invalidation triggers.
Out of scope: physical deletion of all historical audit data unless the plan requires it.
Dependencies: `P95-C01`; `P4-C07`.
Files/areas impacted: `apps/api`; `apps/web`; docs.
Deliverables: deprovision flow and enforcement logic.
Required tests: Add integration tests covering authorized deprovision action, invalid transition rejection, subsequent access denial, and lifecycle state visibility in admin views.
Acceptance criteria: `deprovisioned` users cannot continue authenticated or trusted-device activity as defined.
Risks / cautions: mismatched data retention assumptions can create legal or support problems.
Notes for Codex/dev: use `deprovisioned` consistently, never `deleted` as a synonym.
Evidence required to mark done: Passing deprovision tests plus documented side effects on sessions, trusted devices, and admin-visible lifecycle state.
Suggested next action: define deprovision side-effect matrix across sessions and devices.

### P95-C05 - Session revocation and trusted-device invalidation on lifecycle change
Card ID: `P95-C05`
Title: `Session revocation and trusted-device invalidation on lifecycle change`
Phase/Epic: `Phase 9.5 - Owner/Admin User Lifecycle Operations`
Status: `done`
Priority: `P0`
Objective: Enforce lifecycle changes across active sessions and trusted devices.
Description: Revoke sessions and invalidate trusted-device usage when a user is suspended or `deprovisioned`, according to policy.
Motivation: Lifecycle state is meaningless if active sessions remain usable.
Scope includes: session revocation; trusted-device invalidation; enforcement propagation.
Out of scope: full device deletion records unless required.
Dependencies: `P95-C02`; `P95-C04`; `P9-C04`; `P5-C05`.
Files/areas impacted: `apps/api`; `apps/web`; session middleware.
Deliverables: lifecycle-triggered enforcement hooks and tests.
Required tests: Add integration tests showing session and trusted-device invalidation after suspension and `deprovisioned` transitions, including already-issued session rejection.
Acceptance criteria: lifecycle changes immediately affect future authorized actions according to policy.
Risks / cautions: stale sessions here become a direct security issue.
Notes for Codex/dev: verify both browser sessions and trusted device state checks.
Evidence required to mark done: Passing invalidation tests plus evidence that stale sessions and trusted-device actions are rejected after lifecycle changes.
Suggested next action: wire lifecycle changes into session and device enforcement layers.

### P95-C06 - Lifecycle regression tests
Card ID: `P95-C06`
Title: `Lifecycle regression tests`
Phase/Epic: `Phase 9.5 - Owner/Admin User Lifecycle Operations`
Status: `done`
Priority: `P1`
Objective: Lock lifecycle behavior with dedicated regression coverage.
Description: Add regression tests for valid and invalid lifecycle transitions and their operational effects.
Motivation: Lifecycle bugs tend to reappear after auth or admin changes.
Scope includes: suspend; reactivate; `deprovisioned`; invalid transitions.
Out of scope: UI style details.
Dependencies: `P95-C02`; `P95-C03`; `P95-C04`; `P95-C05`.
Files/areas impacted: test suites across `apps/api` and `apps/web`.
Deliverables: regression suite for lifecycle operations.
Required tests: Add lifecycle regression tests covering valid transitions, invalid transitions, repeated idempotent actions where allowed, and policy enforcement after each state change.
Acceptance criteria: lifecycle matrix is covered by repeatable automated tests.
Risks / cautions: missing regression coverage will reintroduce policy drift.
Notes for Codex/dev: keep tests data-driven if possible.
Evidence required to mark done: Committed lifecycle regression suite with passing results for the full transition matrix.
Suggested next action: create table-driven lifecycle transition tests.

## Phase 10

### P10-C01 - Vault import baseline
Card ID: `P10-C01`
Title: `Vault import baseline`
Phase/Epic: `Phase 10 - Import, Export, and Backup Format`
Status: `done`
Priority: `P2`
Objective: Import records from approved VaultLite/Bitwarden/1Password formats into encrypted vault items.
Description: Build and harden parsing, mapping, preview, dedupe, and execution for CSV/JSON/ZIP/1PUX inputs, including VaultLite self-reimport (`vaultlite.export.v1` and `vaultlite.backup.v1`).
Motivation: Migration from existing password tools is a practical adoption requirement.
Scope includes: parser; mapping validation; preview; import execution; attachment rebind path; backup passphrase-gated decrypt path.
Out of scope: encrypted third-party exports and unsupported item classes beyond current matrix.
Dependencies: `P7-C01`; `P2-C04`.
Files/areas impacted: `apps/web`; import helpers; `packages/contracts`.
Deliverables: vault import flow and format documentation.
Required tests: parser/mapping tests for CSV + JSON + ZIP + 1PUX + VaultLite export/backup; execution tests for duplicate handling, review-required rows, and backup attachment replay.
Acceptance criteria: supported formats import deterministically into encrypted items with canonical dedupe and report outputs.
Risks / cautions: malformed CSV handling must fail safely.
Notes for Codex/dev: keep importer format-specific instead of overly generic and keep passphrase memory-only for backup import.
Evidence required to mark done: `apps/web/src/lib/vault-import.test.ts` passing with coverage for VaultLite export/backup detection, passphrase requirement, and encrypted-envelope attachment replay.
Suggested next action: start `P12-C01` threat-model review update.

### P10-C02 - JSON export
Card ID: `P10-C02`
Title: `JSON export`
Phase/Epic: `Phase 10 - Import, Export, and Backup Format`
Status: `done`
Priority: `P1`
Objective: Export vault data to the approved JSON format.
Description: Build the export path for structured vault data in the project's defined JSON schema.
Motivation: Users need a deterministic data portability mechanism.
Scope includes: schema generation; export UI; version metadata.
Out of scope: attachment blob packaging.
Dependencies: `P7-C01`; `P7-C02`; `P2-C04`.
Files/areas impacted: `apps/web`; `packages/contracts`; docs.
Deliverables: JSON export flow and schema notes.
Required tests: Add integration tests covering JSON export shape, required version markers, and deterministic field presence for login and document items.
Acceptance criteria: exported JSON matches the contract and includes required version markers.
Risks / cautions: schema drift here will undermine restore and external tooling.
Notes for Codex/dev: tie export shape directly to versioned contracts.
Evidence required to mark done: Committed export fixture or snapshot plus passing tests validating shape and version markers.
Suggested next action: define export schema types and serializer.

### P10-C03 - Encrypted backup package format
Card ID: `P10-C03`
Title: `Encrypted backup package format`
Phase/Epic: `Phase 10 - Import, Export, and Backup Format`
Status: `done`
Priority: `P1`
Objective: Define and implement the encrypted backup package format for vault portability.
Description: Build the package structure and generation path for encrypted backups.
Motivation: Backup needs stronger guarantees than ad hoc exports.
Scope includes: package manifest; encryption format; versioning.
Out of scope: third-party cloud backup integrations.
Dependencies: `P0-C13`; `P3-C03`; `P3-C04`; `P10-C02`.
Files/areas impacted: `packages/crypto`; `apps/web`; docs.
Deliverables: backup package generator and format documentation.
Required tests: Add unit tests for manifest generation and package assembly plus integration tests covering full backup generation with and without attachments.
Acceptance criteria: encrypted backup package is versioned, documented, and reproducibly generated.
Risks / cautions: package format decisions will be hard to change after release.
Notes for Codex/dev: keep format simple and explicitly versioned.
Evidence required to mark done: Sample encrypted backup package fixture plus passing generation and validation tests.
Suggested next action: define manifest schema before coding packager.

### P10-C04 - Attachment-inclusive manifest
Card ID: `P10-C04`
Title: `Attachment-inclusive manifest`
Phase/Epic: `Phase 10 - Import, Export, and Backup Format`
Status: `done`
Priority: `P1`
Objective: Extend backup metadata to include attachment references and integrity data.
Description: Add attachment manifest entries so backups can represent vault items plus bound blobs coherently.
Motivation: Backup completeness requires explicit attachment handling.
Scope includes: attachment manifest entries; binding metadata; integrity references.
Out of scope: attachment restore UX.
Dependencies: `P8-C03`; `P10-C03`.
Files/areas impacted: backup format docs; `packages/contracts`; `packages/crypto`.
Deliverables: manifest extensions and backup package updates.
Required tests: Add tests covering attachment manifest generation, missing attachment handling, and exclusion of expired `pending` uploads from backup metadata.
Acceptance criteria: backups including attachments carry enough metadata to support validated restore.
Risks / cautions: inconsistent item-to-attachment references will break restore.
Notes for Codex/dev: manifest must reflect final attached state only, not expired pending uploads.
Evidence required to mark done: Committed backup fixture including attachment metadata entries validated by automated tests.
Suggested next action: add attachment entry schema to backup manifest.

### P10-C05 - Restore format docs
Card ID: `P10-C05`
Title: `Restore format docs`
Phase/Epic: `Phase 10 - Import, Export, and Backup Format`
Status: `done`
Priority: `P1`
Objective: Document the restore expectations and format semantics for exported and backup data.
Description: Write the operational and developer documentation needed to understand supported restore paths and constraints.
Motivation: Backup without restore clarity is operational theater.
Scope includes: restore preconditions; supported versions; failure modes.
Out of scope: full restore UI implementation if not in scope yet.
Dependencies: `P10-C02`; `P10-C03`; `P10-C04`.
Files/areas impacted: docs.
Deliverables: restore format documentation and operator notes.
Required tests: documentation review against backup fixtures.
Acceptance criteria: restore behavior and limitations are explicit and aligned with the actual format.
Risks / cautions: undocumented restore constraints will create support incidents.
Notes for Codex/dev: documentation must match implemented package versioning rules exactly.
Evidence required to mark done: `docs/IMPORT_FORMATS.md`, `docs/EXPORT_JSON_FORMAT.md`, and `docs/BACKUP_FORMAT.md` updated with self-reimport semantics and backup passphrase/integrity constraints.
Suggested next action: continue with `P12-C01`.

### P10-C06 - Backup validation tests
Card ID: `P10-C06`
Title: `Backup validation tests`
Phase/Epic: `Phase 10 - Import, Export, and Backup Format`
Status: `done`
Priority: `P1`
Objective: Validate backup generation and restore expectations with automated tests.
Description: Add automated coverage that checks manifest correctness, package integrity, and fixture compatibility.
Motivation: Backup regressions are high-cost and often discovered too late.
Scope includes: format validation; fixture tests; version compatibility checks.
Out of scope: UI tests beyond export initiation.
Dependencies: `P10-C03`; `P10-C04`; `P10-C05`.
Files/areas impacted: tests across backup-related modules.
Deliverables: backup validation suite.
Required tests: Add validation tests using committed backup fixtures for manifest correctness, package integrity, and supported-version acceptance or rejection.
Acceptance criteria: backups are validated automatically against committed expectations.
Risks / cautions: weak fixture coverage will miss incompatibility drift.
Notes for Codex/dev: keep fixed test fixtures under version control.
Evidence required to mark done: passing tests for `apps/web/src/lib/data-portability.test.ts`, `apps/web/src/lib/vault-import.test.ts`, full `@vaultlite/web` suite, plus contracts and crypto validation suites.
Suggested next action: start `P12-C01`.
## Phase 11

### P11-C01 - Extension unlock
Card ID: `P11-C01`
Title: `Extension unlock`
Phase/Epic: `Phase 11 - Browser Extension`
Status: `done`
Priority: `P2`
Objective: Implement the browser extension unlock experience for the approved V1 feature set.
Description: Build the extension-side unlock flow and trusted-device handling needed to access existing credentials.
Motivation: Extension support is part of V1, but should stay intentionally narrow.
Scope includes: extension startup; existing-account access; unlock path for trusted use.
Out of scope: creating new accounts from the extension; `save login` capture flows in V1.
Dependencies: `P5-C04`; `P6-C06`; `P6-C07`.
Files/areas impacted: extension app package or `apps/extension`; shared auth and crypto modules.
Deliverables: extension unlock flow.
Required tests: Add extension integration tests covering trusted-device unlock success, incorrect local unlock rejection, and extension storage-policy compliance for the unlock path.
Acceptance criteria: extension can unlock an existing account under the approved trusted-device model.
Risks / cautions: extension storage and state handling are easy places to violate the local storage policy.
Notes for Codex/dev: V1 extension scope is retrieval and fill-oriented, not capture-oriented.
Evidence required to mark done: Passing extension unlock tests and API auth tests (`apps/extension/src/*.test.js`, `apps/api/src/extension-auth.test.ts`) plus manual validation evidence for LTS link/unlock/recovery in a Chromium MV3 runtime.
Implementation snapshot: Extension pairing is LTS-only (`POST /api/auth/extension/link/request|approve|status|consume`) with one-time request proofs, strict state transitions, and deployment binding. Unlock/session continuity now includes backend-mediated unlock grants (`/api/auth/unlock-grant/*`) with extension-side scheduler resilience (`chrome.alarms`) and request-scoped bridge nudge handling. Extension runtime authority remains in `background.js`, with strict sender/route validation, fail-closed behavior, storage allowlist, and local unlock via `runtime-crypto.js` (`argon2id` profile `m=65536`, `t=3`, `p=4`, `dkLen=32`).
Suggested next action: start `P12-C01`.

### P11-C02 - Credential listing
Card ID: `P11-C02`
Title: `Credential listing`
Phase/Epic: `Phase 11 - Browser Extension`
Status: `done`
Priority: `P2`
Objective: Show available credentials in the extension for manual selection.
Description: Implement the list surface that lets users browse and choose credentials after unlock.
Motivation: The extension must provide a minimal usable retrieval experience.
Scope includes: credential list; basic filtering if approved; entry selection.
Out of scope: background page capture of new credentials.
Dependencies: `P11-C01`; `P7-C01`; `P7-C04`.
Files/areas impacted: extension app package or `apps/extension`.
Deliverables: credential listing UI and data wiring.
Required tests: Add extension UI tests covering credential-list rendering after unlock, empty-state behavior, and filtering behavior if search is included in the first delivery.
Acceptance criteria: unlocked extension displays accessible credentials reliably.
Risks / cautions: do not over-cache decrypted data in extension storage.
Notes for Codex/dev: keep list behavior consistent with web search constraints.
Evidence required to mark done: Passing listing/search/filter tests in `@vaultlite/extension` plus verified no long-lived decrypted payload persistence in extension storage.
Implementation snapshot: Listing consumes `/api/sync/snapshot` through background authority and projects a minimal popup view model (`itemId`, `title`, previews, host summaries, `matchFlags`) with deterministic sorting and context-aware ranking. Popup uses incremental icon patching and robust scroll anchoring to avoid destructive rerenders and top-jump during icon hydration/resolve cycles.
Suggested next action: start `P12-C01`.

### P11-C03 - Manual fill
Card ID: `P11-C03`
Title: `Manual fill`
Phase/Epic: `Phase 11 - Browser Extension`
Status: `done`
Priority: `P2`
Objective: Support explicit user-triggered fill from the extension.
Description: Build the minimal manual-fill action for selected credentials in supported pages.
Motivation: This delivers the main user value of the extension without widening scope too early.
Scope includes: explicit fill trigger; supported field mapping; permission handling.
Out of scope: autosave, autofill heuristics, and `save login` in V1.
Dependencies: `P11-C02`.
Files/areas impacted: extension app package or `apps/extension`.
Deliverables: manual-fill action and supported-page integration.
Required tests: Add extension integration tests for explicit manual fill on approved fixture pages, including rejection or no-op behavior on unsupported fields.
Acceptance criteria: user-triggered fill works on approved test pages.
Risks / cautions: content-script behavior must remain narrowly permissioned.
Notes for Codex/dev: keep V1 extension scope intentionally narrow; do not smuggle `save login` into this phase.
Evidence required to mark done: Passing manual-fill tests and fixture validation for supported contexts with safe no-op behavior in blocked/unsupported contexts.
Implementation snapshot: popup→background→content-script bridge enforces explicit user-triggered fill with exact-origin authorization, anti-race revalidation, top-level-only execution, and no autosubmit. Suggested-item UX now surfaces context-aware quick actions (`Fill` when current site matches, external-open otherwise), with disabled fill + tooltip for pages without supported fields.
Suggested next action: start `P12-C01`.

## Phase 12

### P12-C01 - Threat-model review update
Card ID: `P12-C01`
Title: `Threat-model review update`
Phase/Epic: `Phase 12 - Final Hardening and Release Readiness`
Status: `not_started`
Priority: `P0`
Objective: Revisit and update the threat model after implementation maturity.
Description: Review the implemented system against the original threat model and record deltas, residual risks, and mitigations.
Motivation: Final hardening needs a real comparison against what was actually built.
Scope includes: threat review; mitigation status; residual risk capture.
Out of scope: net-new product scope.
Dependencies: implementation maturity across prior phases; `P0-C04`.
Files/areas impacted: docs.
Deliverables: updated threat model review section or document revision.
Required tests: Re-run threat coverage against implemented code paths, compare the original threat list to actual mitigations, and record any unresolved or partially addressed items.
Acceptance criteria: threat model reflects the implemented system and identifies unresolved risk explicitly.
Risks / cautions: skipping this turns the original threat model into stale ceremony.
Notes for Codex/dev: review real code and configs, not only prior docs.
Evidence required to mark done: Committed threat-model update mapping original threats to implemented mitigations and residual risks.
Suggested next action: compare implemented flows to the original threat assumptions.

### P12-C02 - OPERATIONS.md
Card ID: `P12-C02`
Title: `OPERATIONS.md`
Phase/Epic: `Phase 12 - Final Hardening and Release Readiness`
Status: `not_started`
Priority: `P1`
Objective: Document deployment operations, backup, restore, and routine maintenance.
Description: Create the operator guide for the supported Cloudflare-first, owner-deployed V1 administration model.
Motivation: Owner-deployed Cloudflare-first operation requires documented procedures instead of implicit setup knowledge.
Scope includes: deployment steps; backup routine; restore notes; secret handling; lifecycle operations.
Out of scope: infrastructure-as-code automation if not implemented.
Dependencies: `P10-C05`; storage and deployment implementation decisions.
Files/areas impacted: docs.
Deliverables: `OPERATIONS.md`.
Required tests: Review `OPERATIONS.md` against actual deployment files, migration commands, backup procedures, and lifecycle operations present in the repo.
Acceptance criteria: operators can follow the document to run and maintain the deployment.
Risks / cautions: docs must match the actual supported deployment target.
Notes for Codex/dev: keep instructions concrete and versioned where possible.
Evidence required to mark done: Committed `OPERATIONS.md` cross-checked against real repo artifacts and commands, with no placeholder-only sections left.
Suggested next action: draft operations doc from implemented deployment and backup flows.

### P12-C03 - RELEASE.md
Card ID: `P12-C03`
Title: `RELEASE.md`
Phase/Epic: `Phase 12 - Final Hardening and Release Readiness`
Status: `not_started`
Priority: `P1`
Objective: Define the release procedure and checks for V1 delivery.
Description: Document the release workflow, validation steps, and required signoffs.
Motivation: Release readiness should be repeatable rather than ad hoc.
Scope includes: release steps; validation checklist; artifact expectations.
Out of scope: CI automation unless implemented separately.
Dependencies: `P12-C08`.
Files/areas impacted: docs.
Deliverables: `RELEASE.md`.
Required tests: Dry-run every release step against the repo state, confirming each step points to a real command, artifact, or checklist item.
Acceptance criteria: release process is documented and references the actual verification steps.
Risks / cautions: stale release docs will be worse than none.
Notes for Codex/dev: tie each step to a command or artifact where possible.
Evidence required to mark done: Committed `RELEASE.md` plus dry-run notes showing each listed release step is executable or verifiable.
Suggested next action: build release document from the final go or no-go checklist.

### P12-C04 - Secret scanning verification
Card ID: `P12-C04`
Title: `Secret scanning verification`
Phase/Epic: `Phase 12 - Final Hardening and Release Readiness`
Status: `not_started`
Priority: `P0`
Objective: Verify the repository is free of committed secrets before release.
Description: Run repository secret scans and document any findings or false positives.
Motivation: Secret hygiene is a release-blocking concern.
Scope includes: scan commands; false-positive notes; remediation tracking.
Out of scope: external secret-manager rollout.
Dependencies: repository maturity.
Files/areas impacted: full repository; docs if findings are recorded.
Deliverables: scan results and any remediation notes.
Required tests: Run repository secret scans using the supported local tooling and review every hit as real or false positive.
Acceptance criteria: no unaddressed secret findings remain.
Risks / cautions: pattern-only scans produce false positives that must still be reviewed.
Notes for Codex/dev: do not commit sample secrets in test fixtures.
Evidence required to mark done: Recorded secret-scan output, reviewed findings, and remediation or false-positive notes where needed.
Suggested next action: run repository secret scan and capture reviewed output.

### P12-C05 - Dependency audit verification
Card ID: `P12-C05`
Title: `Dependency audit verification`
Phase/Epic: `Phase 12 - Final Hardening and Release Readiness`
Status: `not_started`
Priority: `P0`
Objective: Review dependency vulnerabilities before release.
Description: Run dependency audits for the implemented stack and record any accepted or remediated findings.
Motivation: Release readiness requires known dependency risk visibility.
Scope includes: audit commands; triage notes; remediation status.
Out of scope: unrelated package upgrades without risk justification.
Dependencies: package manifests and lockfiles existing.
Files/areas impacted: dependency manifests and docs.
Deliverables: dependency audit results and triage notes.
Required tests: Run stack-appropriate dependency audit commands for the implemented manifests and review high-severity findings individually.
Acceptance criteria: no untriaged high-severity dependency issues remain.
Risks / cautions: avoid noisy upgrade churn without understanding impact.
Notes for Codex/dev: use stack-appropriate audit commands only when manifests exist.
Evidence required to mark done: Recorded audit outputs plus triage notes for every nontrivial vulnerability finding.
Suggested next action: run dependency audit once package manifests are stable.

### P12-C06 - Environment validation
Card ID: `P12-C06`
Title: `Environment validation`
Phase/Epic: `Phase 12 - Final Hardening and Release Readiness`
Status: `not_started`
Priority: `P1`
Objective: Validate the supported deployment environment and configuration assumptions.
Description: Verify the runtime environment, storage bindings, and required secrets or config are documented and correct.
Motivation: Environment drift is a common source of failed deployments and hidden security bugs.
Scope includes: env var checklist; storage bindings; deployment assumptions.
Out of scope: unsupported deployment targets.
Dependencies: deployment implementation and `P12-C02`.
Files/areas impacted: docs; deployment config.
Deliverables: environment validation checklist and verification notes.
Required tests: Run environment validation or deployment smoke checks against the supported Cloudflare-first setup, including config or binding verification where available.
Acceptance criteria: required environment assumptions are explicit and verified.
Risks / cautions: environment-specific behavior must not be left implicit.
Notes for Codex/dev: validate only against supported targets, not hypothetical ones.
Evidence required to mark done: Recorded environment validation output plus checked config or binding list for the supported deployment target.
Suggested next action: derive validation checklist from the actual deployment config.

### P12-C07 - Residual risk log
Card ID: `P12-C07`
Title: `Residual risk log`
Phase/Epic: `Phase 12 - Final Hardening and Release Readiness`
Status: `not_started`
Priority: `P1`
Objective: Record remaining accepted risks at release time.
Description: Create a compact log of known limitations, deferred hardening items, and accepted operational risks.
Motivation: A release without an explicit residual risk record hides debt from future maintainers.
Scope includes: known limitations; deferred items; acceptance rationale.
Out of scope: inventing mitigation work not planned for V1.
Dependencies: `P12-C01`; `P12-C04`; `P12-C05`.
Files/areas impacted: docs.
Deliverables: residual risk log.
Required tests: Review the residual risk log against the updated threat model, secret scan results, dependency audit results, and any accepted operational limitations.
Acceptance criteria: unresolved risks are explicitly named with rationale and owner context.
Risks / cautions: vague statements here are not useful.
Notes for Codex/dev: keep the log short, specific, and tied to evidence.
Evidence required to mark done: Committed residual risk log with each item tied to a concrete artifact, check result, or deferred decision.
Suggested next action: create residual risk entries from the final review artifacts.

### P12-C08 - Release go/no-go checklist
Card ID: `P12-C08`
Title: `Release go/no-go checklist`
Phase/Epic: `Phase 12 - Final Hardening and Release Readiness`
Status: `not_started`
Priority: `P0`
Objective: Define the final release gate checklist for V1.
Description: Assemble the concrete checklist that must be satisfied before release is approved.
Motivation: Release approval must be explicit and auditable.
Scope includes: test completion; docs completion; security checks; environment checks.
Out of scope: post-release roadmap.
Dependencies: `P12-C01`; `P12-C04`; `P12-C05`; `P12-C06`; `P12-C07`.
Files/areas impacted: docs.
Deliverables: final go or no-go checklist.
Required tests: Perform a go or no-go dry run using the checklist against the actual repository and release artifacts.
Acceptance criteria: checklist can be used to make a concrete release decision.
Risks / cautions: avoid vague checklist items that cannot be evidenced.
Notes for Codex/dev: every checklist line should point to an artifact, command, or file.
Evidence required to mark done: Committed release checklist template with evidence placeholders or references filled for each gate.
Suggested next action: compile the final checklist from implemented verification steps.

## Phase 13

### P13-C01 - Extension item edit parity
Card ID: `P13-C01`
Title: `Extension item edit parity`
Phase/Epic: `Phase 13 - Intelligent Assist and Contextual Autofill`
Status: `not_started`
Priority: `P0`
Objective: Permitir edição de item diretamente na extensão com comportamento consistente com o web app.
Description: Implementar fluxo de edição no popup para login, card, document e secure note com validações mínimas, sem perder o comportamento cache-first.
Motivation: Os cards de detecção/save/update/autofill dependem de um fluxo de edição rápido e seguro dentro da própria extensão.
Scope includes: UI de edição no popup; validação de campos obrigatórios; salvar sem recarga total; sincronização por snapshot/realtime.
Out of scope: autosave sem confirmação e edição em lote.
Dependencies: `P11-C03`; `P7-C01`; `P7-C02`.
Files/areas impacted: `apps/extension/popup.js`; `apps/extension/popup-view-model.js`; `apps/extension/background.js`.
Deliverables: edição funcional de item na extensão com testes.
Required tests: `apps/extension/src/popup-view-model.test.js`; `apps/extension/src/background-controller.test.ts` cobrindo abrir, editar, salvar, erro e rollback visual.
Acceptance criteria: usuário edita e salva item na extensão sem tela vazia temporária e sem regressão de lock/unlock.
Risks / cautions: regressão de UX cache-first ao trocar estado de edição.
Notes for Codex/dev: evitar limpar lista ativa durante save; sincronização deve ser em background.
Evidence required to mark done: testes de edição na extensão verdes e evidência manual de save sem flicker de lista.
Suggested next action: implementar edição mínima para itens `login`.

### P13-C02 - Item change history with field-level diff visibility
Card ID: `P13-C02`
Title: `Item change history with field-level diff visibility`
Phase/Epic: `Phase 13 - Intelligent Assist and Contextual Autofill`
Status: `not_started`
Priority: `P0`
Objective: Exibir histórico por item com diff de campos (antes/depois), incluindo valores substituídos quando usuário solicitar.
Description: Persistir eventos de alteração por item/dispositivo e renderizar timeline no popup/web com reveal explícito para campos sensíveis.
Motivation: Auditoria e confiança operacional para fluxos de update automático de credencial.
Scope includes: evento por alteração; tipo de mudança; dispositivo/origem; diff por campo; reveal explícito para campos sensíveis.
Out of scope: versionamento completo de item inteiro.
Dependencies: `P13-C01`; `P9-C01`.
Files/areas impacted: `apps/api/src/app.ts`; `apps/api/src/realtime.ts`; `adapters/cloudflare-storage/src/index.ts`; `apps/extension/popup.js`; `apps/web/src/pages/VaultShellPage.vue`.
Deliverables: histórico navegável com diffs por campo.
Required tests: `apps/api/src/app.test.ts` e `apps/extension/src/popup-view-model.test.js` cobrindo criação de eventos, ordenação e reveal controlado.
Acceptance criteria: histórico mostra `quando`, `dispositivo`, `tipo` e `before/after` por campo sem quebrar políticas de desbloqueio local.
Risks / cautions: exposição indevida de valores sensíveis se reveal não for protegido por `local unlock`.
Notes for Codex/dev: diffs sensíveis devem ficar criptografados em repouso.
Evidence required to mark done: endpoints/testes de histórico e validação manual de reveal após desbloqueio local.
Suggested next action: definir contrato de evento de histórico em `packages/contracts`.

### P13-C03 - Form metadata capture and sync contracts
Card ID: `P13-C03`
Title: `Form metadata capture and sync contracts`
Phase/Epic: `Phase 13 - Intelligent Assist and Contextual Autofill`
Status: `not_started`
Priority: `P0`
Objective: Capturar e sincronizar metadados de formulário para melhorar preenchimentos futuros.
Description: Salvar fingerprint/seletores/roles por origem e item, atualizar metadados quando o site mudar, e sincronizar entre dispositivos por realtime.
Motivation: Base técnica para reduzir falhas de detecção em sites reais.
Scope includes: schema de metadados; upsert por confiança; sync por websocket; fallback heurístico quando seletor falhar.
Out of scope: TTL temporal fixo para metadados.
Dependencies: `P13-C01`; `P11-C02`; `P9-C01`.
Files/areas impacted: `packages/contracts/src`; `apps/api/src/app.ts`; `apps/api/src/realtime.ts`; `adapters/cloudflare-storage/src/index.ts`; `apps/extension/content-script.js`; `apps/extension/background.js`.
Deliverables: contrato e pipeline de metadados de formulário sincronizado.
Required tests: API/extension tests para criação, atualização por mudança de layout e propagação realtime sem loop.
Acceptance criteria: metadados úteis são reutilizados entre sessões/dispositivos e atualizados quando detecção confirmar novo layout.
Risks / cautions: ruído de metadados pode degradar ranking se confiança não for bem tratada.
Notes for Codex/dev: atualizar metadados somente com sinais fortes de sucesso de preenchimento.
Evidence required to mark done: testes de captura/sync e inspeção de payload sem dados sensíveis desnecessários.
Suggested next action: implementar tipos `form_fingerprint` e `field_role` nos contratos.

### P13-C04 - Inline field suggestion anchor (content-script)
Card ID: `P13-C04`
Title: `Inline field suggestion anchor (content-script)`
Phase/Epic: `Phase 13 - Intelligent Assist and Contextual Autofill`
Status: `not_started`
Priority: `P1`
Objective: Exibir ícone inline em campos de login para iniciar sugestão contextual sem abrir popup.
Description: Detectar campos de autenticação no content-script e ancorar affordance visual consistente com ação de sugestão.
Motivation: Reduzir atrito de uso e aproximar UX esperada de gerenciadores líderes.
Scope includes: detecção de campo; ícone inline; acionamento por foco/click; integração com background para ranking.
Out of scope: preenchimento automático sem confirmação.
Dependencies: `P13-C03`; `P11-C03`.
Files/areas impacted: `apps/extension/content-script.js`; `apps/extension/bridge-content-script.js`; `apps/extension/src/fill-engine.ts`.
Deliverables: affordance inline funcional em campos suportados.
Required tests: `apps/extension/src/fill-engine.test.ts` e testes de DOM fixture para foco/click.
Acceptance criteria: ícone aparece em campos compatíveis e abre fluxo de sugestão sem causar regressão em páginas não suportadas.
Risks / cautions: interferir com UI de terceiros se injeção não for isolada.
Notes for Codex/dev: manter estilos isolados e fail-safe em páginas incompatíveis.
Evidence required to mark done: capturas/fixtures de campo suportado + testes automatizados.
Suggested next action: habilitar ancoragem apenas em inputs com confiança mínima de login.

### P13-C05 - Inline mini-search and ranked credential suggestion tray
Card ID: `P13-C05`
Title: `Inline mini-search and ranked credential suggestion tray`
Phase/Epic: `Phase 13 - Intelligent Assist and Contextual Autofill`
Status: `not_started`
Priority: `P1`
Objective: Permitir busca rápida no vault e seleção de credencial diretamente abaixo do campo.
Description: Renderizar mini-lista inline com sugestões ranqueadas e busca local rápida quando não houver match forte.
Motivation: Evitar abrir popup e acelerar preenchimento em contexto de login.
Scope includes: ranking por domínio/subdomínio/PSL + favorito + último uso + similaridade de username; busca inline; ação de fill.
Out of scope: ranking por telemetria remota.
Dependencies: `P13-C04`; `P11-C02`; `P7-C04`.
Files/areas impacted: `apps/extension/content-script.js`; `apps/extension/background.js`; `apps/extension/popup-view-model.js`.
Deliverables: mini-lista inline com seleção de credencial e preenchimento.
Required tests: testes de ranking e busca inline cobrindo baixa confiança e fallback manual.
Acceptance criteria: com ou sem match forte, usuário consegue selecionar credencial e preencher sem abrir popup.
Risks / cautions: ranking ruim pode aumentar falso positivo de preenchimento.
Notes for Codex/dev: baixa confiança deve continuar mostrando sugestões, mas sem autofill silencioso.
Evidence required to mark done: testes de ranking e demo manual em domínios sem match exato.
Suggested next action: implementar função de score determinística com pesos versionados.

### P13-C06 - Save login and update password post-submit prompts
Card ID: `P13-C06`
Title: `Save login and update password post-submit prompts`
Phase/Epic: `Phase 13 - Intelligent Assist and Contextual Autofill`
Status: `not_started`
Priority: `P1`
Objective: Sugerir salvar novo login e atualizar senha após submit detectado.
Description: Detectar submit de credenciais, classificar cenário (`new_login`, `update_password`) e abrir prompt com confirmação explícita.
Motivation: Cobrir fluxos de manutenção de credenciais com mínimo de cliques.
Scope includes: detecção pós-submit; prompt superior direito; abrir item prefill para confirmação final de save/update.
Out of scope: persistência automática sem interação do usuário.
Dependencies: `P13-C01`; `P13-C03`; `P13-C05`.
Files/areas impacted: `apps/extension/content-script.js`; `apps/extension/background.js`; `apps/extension/popup.js`.
Deliverables: prompts funcionais para salvar/atualizar credenciais.
Required tests: cenários com domínio conhecido/desconhecido, username novo e senha alterada.
Acceptance criteria: prompt aparece nos cenários definidos e usuário conclui update com fluxo curto e explícito.
Risks / cautions: falsos positivos em formulários não-auth.
Notes for Codex/dev: confirmar intenção do usuário antes de persistir dados sensíveis.
Evidence required to mark done: testes de submit-capture + validação manual em ao menos 3 fluxos reais.
Suggested next action: implementar classificador inicial de submit de login/senha.

### P13-C07 - Heuristic autofill engine v1 (same-origin iframe)
Card ID: `P13-C07`
Title: `Heuristic autofill engine v1 (same-origin iframe)`
Phase/Epic: `Phase 13 - Intelligent Assist and Contextual Autofill`
Status: `not_started`
Priority: `P1`
Objective: Melhorar taxa de preenchimento com heurística agressiva mantendo confirmação por padrão.
Description: Expandir detecção/fill para campos comuns de login em páginas principais e iframes same-origin.
Motivation: Cobrir grande parte dos sites sem exigir configuração manual por site.
Scope includes: heurística de roles; fallback quando seletor salvo falhar; suporte same-origin iframe; confirmação extra em HTTP inseguro.
Out of scope: cross-origin iframe (V2).
Dependencies: `P13-C03`; `P13-C04`; `P13-C05`.
Files/areas impacted: `apps/extension/src/fill-engine.ts`; `apps/extension/content-script.js`; `apps/extension/src/origin-policy.ts`.
Deliverables: engine heurístico v1 com cobertura ampliada.
Required tests: `fill-engine` tests para campos variados, iframe same-origin e guardrail HTTP.
Acceptance criteria: aumento de cobertura de preenchimento em fixtures sem regressão de segurança.
Risks / cautions: heurística agressiva pode preencher campo errado sem guardrails.
Notes for Codex/dev: padrão deve ser sugestão + clique; autofill completo só em modo explícito configurável.
Evidence required to mark done: suíte de fixtures atualizada e relatório de sucesso por tipo de formulário.
Suggested next action: consolidar matriz de detecção de campo por role.

### P13-C08 - Identity/address/card fill profiles v1
Card ID: `P13-C08`
Title: `Identity/address/card fill profiles v1`
Phase/Epic: `Phase 13 - Intelligent Assist and Contextual Autofill`
Status: `not_started`
Priority: `P2`
Objective: Preencher dados de identidade/endereço/cartão com suporte a campos text/select/mask.
Description: Implementar perfis de preenchimento completo para formulários de checkout/cadastro após seleção explícita do perfil.
Motivation: Aumentar utilidade prática além de login/senha.
Scope includes: mapping por tipo de campo; selects/mascaras; fluxo por etapas; CVV após seleção explícita de cartão.
Out of scope: detecção automática sem seleção de perfil.
Dependencies: `P13-C07`; `P7-C02`; `P10-C01`.
Files/areas impacted: `apps/extension/src/fill-engine.ts`; `apps/extension/content-script.js`; `apps/extension/popup.js`.
Deliverables: preenchimento assistido de identidade/endereço/cartão.
Required tests: fixtures de checkout/cadastro com campos mascarados e selects.
Acceptance criteria: perfil selecionado preenche corretamente campos compatíveis em formulários comuns.
Risks / cautions: risco de preencher dados sensíveis no campo errado.
Notes for Codex/dev: manter confirmação explícita de perfil/cartão antes do fill.
Evidence required to mark done: testes de perfis + validação manual em formulários de referência.
Suggested next action: definir catálogo de `fieldRole` para identidade/endereço/cartão.

### P13-C09 - TOTP suggestion and fill assist
Card ID: `P13-C09`
Title: `TOTP suggestion and fill assist`
Phase/Epic: `Phase 13 - Intelligent Assist and Contextual Autofill`
Status: `not_started`
Priority: `P2`
Objective: Sugerir e preencher código TOTP em campos 2FA com fluxo de interação consistente.
Description: Detectar etapa OTP, sugerir código do item correspondente e permitir clique para preencher; autofill automático opcional.
Motivation: Reduzir fricção em login com 2FA.
Scope includes: detecção de campo OTP; sugestão contextual; clique para fill; modo opcional de autofill.
Out of scope: bypass de confirmação de segurança.
Dependencies: `P13-C05`; `P13-C07`.
Files/areas impacted: `apps/extension/content-script.js`; `apps/extension/background.js`; `apps/extension/popup.js`.
Deliverables: fluxo TOTP inline funcional.
Required tests: testes de detecção OTP e preenchimento com modo padrão/automático.
Acceptance criteria: usuário consegue preencher OTP sem copiar/colar manual na maior parte dos sites suportados.
Risks / cautions: identificação incorreta de campo OTP pode causar erro de autenticação.
Notes for Codex/dev: expiração/refresh do código deve ser refletida sem jank visual.
Evidence required to mark done: testes de OTP + validação manual de fluxo 2FA.
Suggested next action: implementar detector OTP por `autocomplete`, `inputmode`, label e padrões comuns.

### P13-C10 - Site allowlist and denylist controls
Card ID: `P13-C10`
Title: `Site allowlist and denylist controls`
Phase/Epic: `Phase 13 - Intelligent Assist and Contextual Autofill`
Status: `not_started`
Priority: `P2`
Objective: Permitir controle por site de sugestões/fill/save prompts.
Description: Adicionar controles globais e por domínio para habilitar/desabilitar assistências de preenchimento.
Motivation: Evitar comportamento indesejado em sites específicos e melhorar governança de UX.
Scope includes: opções por domínio; override de heurística; suporte a allowlist/denylist no runtime.
Out of scope: políticas centralizadas multi-admin.
Dependencies: `P13-C05`; `P13-C06`; `P13-C07`.
Files/areas impacted: `apps/extension/options.js`; `apps/extension/background.js`; `apps/extension/popup.js`.
Deliverables: configuração funcional de allowlist/denylist.
Required tests: testes de política por domínio com bloqueio/liberação de cada capacidade.
Acceptance criteria: regras por site são respeitadas em sugestão, fill e save/update prompts.
Risks / cautions: regra conflitante pode gerar comportamento difícil de diagnosticar.
Notes for Codex/dev: exibir regra ativa para facilitar suporte.
Evidence required to mark done: testes de política e confirmação manual em domínios distintos.
Suggested next action: definir precedência de regras (denylist > allowlist > default).

### P13-C11 - Local non-sensitive assist telemetry
Card ID: `P13-C11`
Title: `Local non-sensitive assist telemetry`
Phase/Epic: `Phase 13 - Intelligent Assist and Contextual Autofill`
Status: `not_started`
Priority: `P2`
Objective: Medir eficácia de detecção/sugestão/fill sem coletar dados sensíveis.
Description: Registrar métricas locais para guiar melhorias de heurística e reduzir regressões.
Motivation: Sem telemetria técnica, tuning de heurística vira tentativa e erro.
Scope includes: métricas de sucesso/falha por tipo de formulário; contadores de prompt/fill; export local para diagnóstico.
Out of scope: envio remoto automático de telemetria.
Dependencies: `P13-C05`; `P13-C06`; `P13-C07`.
Files/areas impacted: `apps/extension/background.js`; `apps/extension/runtime-common.js`; `apps/extension/options.js`.
Deliverables: painel/artefato local de métricas não sensíveis.
Required tests: testes garantindo ausência de PII/segredos no payload de telemetria.
Acceptance criteria: métricas ajudam a medir qualidade sem expor credenciais ou conteúdo secreto.
Risks / cautions: logging excessivo pode degradar performance em páginas complexas.
Notes for Codex/dev: limitar cardinalidade e retenção local.
Evidence required to mark done: testes de schema + revisão manual de payload.
Suggested next action: definir schema mínimo com chaves estáveis.

### P13-C12 - Cross-origin iframe fill support v2
Card ID: `P13-C12`
Title: `Cross-origin iframe fill support v2`
Phase/Epic: `Phase 13 - Intelligent Assist and Contextual Autofill`
Status: `not_started`
Priority: `P3`
Objective: Expandir suporte para formulários de login em iframes cross-origin.
Description: Projetar e implementar estratégia segura para detecção/sugestão/fill em iframes de origem diferente.
Motivation: Alguns provedores de autenticação embutem login em iframe externo.
Scope includes: desenho de permissões; isolamento de origin; validação explícita de contexto.
Out of scope: bypass de políticas de navegador ou expansão insegura de permissões.
Dependencies: `P13-C07`; revisão de segurança dedicada no contexto de `P12-C01`.
Files/areas impacted: `apps/extension/content-script.js`; `apps/extension/bridge-content-script.js`; `apps/extension/src/origin-policy.ts`; docs de segurança.
Deliverables: design + implementação v2 para cross-origin iframe com guardrails.
Required tests: testes de permissão/origin e fixtures com iframe cross-origin.
Acceptance criteria: suporte cross-origin funcional sem quebrar isolamento de segurança da extensão.
Risks / cautions: aumento relevante de superfície de ataque.
Notes for Codex/dev: tratar como entrega separada após validação de risco.
Evidence required to mark done: threat-review específico + testes green em cenários cross-origin.
Suggested next action: registrar ADR curto de permissões e riscos antes de codar.

## Cross-Phase Risks
- `R-01`: Auth-state ambiguity between `remote authentication`, `local unlock`, and `session restoration`.
  Impact: high risk of incorrect guards, leaky UI states, and auth regressions.
  Mitigation: freeze contracts in `P0-C08`, `P2-C03`, and `P5-C06` before expanding UI flows.
  Owner/area: auth and web app.
- `R-02`: Local storage drift from ADR policy.
  Impact: plaintext or overexposed client data could invalidate the security model.
  Mitigation: enforce allowlisted storage via `P0-C11`, `P6-C04`, and related tests.
  Owner/area: web app and crypto.
- `R-03`: Attachment lifecycle inconsistency.
  Impact: orphaned blobs, broken backups, and undefined restore behavior.
  Mitigation: implement explicit `pending` to attached transitions in `P8-C01` through `P8-C06`.
  Owner/area: API, storage, attachments.
- `R-04`: Sync conflict behavior not matching the ADR.
  Impact: silent data loss or non-deterministic device convergence.
  Mitigation: encode conflict examples in tests first for `P9-C01` and `P9-C02`.
  Owner/area: sync and contracts.
- `R-05`: Lifecycle enforcement gaps for suspended or `deprovisioned` users.
  Impact: stale sessions or trusted devices continue operating after admin action.
  Mitigation: centralize enforcement in `P4-C07`, `P95-C02`, `P95-C04`, and `P95-C05`.
  Owner/area: auth and admin controls.
- `R-06`: Plan and repository drift.
  Impact: implementation starts before gates or ADR decisions are actually present.
  Mitigation: keep `Global Gates`, `Current Focus`, and `Decision Log` updated as source-of-truth execution aids.
  Owner/area: project management and handoff.

## Decision Log
- 2026-03-30: Added `Phase 13 - Intelligent Assist and Contextual Autofill` with card IDs `P13-C01` to `P13-C12`, explicit dependencies, and V1/V2 scope boundaries (same-origin iframe in V1, cross-origin iframe deferred). This phase is queued after Phase 12 and does not change the current release-hardening focus.
- 2026-03-23: Synced status-card with repository state and moved execution focus to Phase 12. `P11-C01`, `P11-C02`, and `P11-C03` are now `done` based on implemented LTS-only extension pairing, unlock/session continuity with backend-mediated unlock grants, strict bridge hardening, listing/fill stabilization, and green automated suites in `@vaultlite/extension` and `@vaultlite/api` extension auth coverage.
- 2026-03-23: Extension and web manual-icon flows now operate on shared server-side overrides with popup detail-icon editing and robust sync behavior (queued retries, non-retriable 4xx drop, and cross-surface refresh triggers), reducing extension/web icon drift during normal use.
- 2026-03-19: Closed the Phase 11 runtime implementation path and moved `P11-C01`/`P11-C02`/`P11-C03` to `review_needed`. Added operational MV3 runtime files (`apps/extension/background.js`, `apps/extension/popup.js`, `apps/extension/options.js`, `apps/extension/full-page-auth.js`, `apps/extension/content-script.js`, `apps/extension/runtime-*.js`) enforcing background-only secret authority, strict sender capability checks, exact-origin fill authorization, anti-race revalidation, and fail-closed lock behavior. Validation evidence: `@vaultlite/api`, `@vaultlite/web`, and `@vaultlite/extension` test suites green; workspace typecheck green; migration validation green; `npm audit --omit=dev` reports 0 vulnerabilities.
- 2026-03-19: Started Phase 11 implementation (`P11-C01`/`P11-C02`/`P11-C03`) with closed security defaults: website-assisted extension pairing (one-time hashed code + rate limits), opaque extension bearer allowlist (`session/restore`, `sync/snapshot`) with rotation window, extension pairing persistence migration `0009_extension_pairings`, and MV3 isolation helpers in `apps/extension` (background authority, exact-origin fill policy, top-level-only fill engine). Evidence: `apps/api/src/extension-auth.test.ts`, `apps/extension/src/*.test.ts`, full workspace typecheck/test green.
- 2026-03-18: Completed `P95-C04` through `P95-C06` with lifecycle-focused integration coverage and deterministic transition assertions. Evidence: `apps/api/src/admin-lifecycle.test.ts` now covers deprovision authorization and side effects, already-issued session rejection after lifecycle mutations, trusted-device invalidation effects, and matrix assertions for valid, invalid, and idempotent transitions; `apps/web/src/pages/AdminConsolePage.test.ts` includes deprovision confirmation flow coverage.
- 2026-03-18: Completed `P95-C01` through `P95-C03` with synchronized API/UI evidence. API now has explicit lifecycle integration coverage in `apps/api/src/admin-lifecycle.test.ts` for owner list visibility (`active`/`deprovisioned`), suspend authorization and enforcement, suspended-user denial on protected/authenticated paths, successful reactivation, and invalid transition rejection. UI/admin evidence remains green in `apps/web/src/pages/AdminConsolePage.test.ts`.
- 2026-03-18: Completed `P9-C01` through `P9-C05` with live sync snapshot orchestration (`snapshotToken`/`cursor`/ETag), deterministic conflict handling (`revision_conflict`, `item_deleted_conflict`), trusted device listing with `lastAuthenticatedAt`, atomic device revocation, and atomic password rotation (`expected_bundle_version`, idempotent replay semantics). Regression evidence: `@vaultlite/api` (`src/sync-devices-rotation.test.ts`, `src/vault.test.ts`, `src/app.test.ts`), `@vaultlite/web` (`src/App.test.ts`, `src/pages/SettingsPage.test.ts`, `src/lib/vault-workspace.test.ts`, `src/pages/VaultShellPage.test.ts`), `@vaultlite/cloudflare-storage` test suite all green.
- 2026-03-18: Completed `P9-C06` hardening pack end-to-end with fail-closed runtime mode, bounded auth/bootstrap rate limiting, trusted local state sanitization, payload/upload ceilings, client URL scheme guard, expanded security headers baseline, and updated `docs/SECURITY.md` + `docs/THREAT_MODEL.md` with regression coverage.
- 2026-03-17: Added `P9-C06` as a dedicated `P0` security hardening remediation pack for the 8 audit findings (auth bootstrap anti-abuse, bounded rate-limit windows, production fail-closed token/key posture, local `accountKey` persistence hardening, payload ceilings, URL scheme validation, and security header baseline expansion). Execution order now prioritizes `P9-C06` before sync baseline.
- 2026-03-17: Repository audit pass completed to align cards with implementation evidence. `P7-C05` was reset from `in_progress` to `not_started` because no password-generator helper/UI/tests are present yet; `P8-C03` to `P8-C06` remain `not_started` and API finalize still returns `attachment_finalize_not_implemented`.
- 2026-03-16: Completed `P8-C01`, `P8-C02`, and `P8-C07` in one attachment-focused sequence. Added upload-init contracts and API, pending record lifecycle with idempotency and expiry, encrypted client upload using the approved blob envelope, cloudflare-storage migration `0004_attachment_upload_pending`, and document attachment status UX in `/vault` with targeted tests across contracts, storage, API, and web.
- 2026-03-16: Promoted the corrected docs baseline for web UI execution to `AGENTS.v2.md`, `docs/UI_STYLE.v2.md`, and `docs/WEB_UI_EXECUTION.md`; archived and legacy plan texts are historical context only and no longer normative for the active web redesign round.
- 2026-03-15: Phase 2 introduced canonical domain states, lifecycle transition rules, and the first zod-based contract baseline in packages/domain and packages/contracts.
- 2026-03-15: Phase 3 introduced Node built-in Argon2id KDF, AES-256-GCM envelopes, Account Key helpers, Account Kit canonicalization, Ed25519 signing, and fixed crypto vectors in packages/crypto.
- 2026-03-15: Phase 0 baseline docs, threat model, execution gate checklist, and ADRs 0001-0010 were created and aligned with the current plan.
- 2026-03-15: Phase 1 monorepo scaffold was created with npm workspaces plus pnpm-workspace.yaml so the repo stays executable in the current environment while remaining pnpm-friendly.
- 2026-03-15: Phase 4 added D1 migration baseline, storage abstractions, Cloudflare adapters, Hono API namespaces, secure cookie session issuance, CSRF validation, anti-enumeration, and lifecycle enforcement hooks.
- 2026-03-15: Phase 5 replaced plaintext password transport with opaque `remote authentication` proofs, shipped onboarding persistence, trusted-device bootstrap using Account Kit verification, signed Account Kit export, and an initial reissue flow.
- 2026-03-15: Phase 6 added the Vue router shell, route guards, IndexedDB-backed trusted local state, auto-lock, `local unlock`, `session restoration`, CSP baseline, and CSRF-wired client requests.
- 2026-03-15: Local development wiring now includes `wrangler.toml`, local D1 and R2 bindings, root `dev:api`, a Vite `/api` proxy, a local invite helper, and a passing `smoke:local-flow` path that covers invite issuance, onboarding, and `session restoration`.
- 2026-03-15: Invite expiration timestamps are normalized to UTC before persistence, and runtime Worker IDs now use cryptographically random values so local D1-backed flows do not collide across restarts.
- 2026-03-15: Onboarding now fetches canonical runtime metadata from the API, signs the Account Kit before final persistence, and uses an atomic `completeOnboardingAtomic` backend path so invite consumption no longer happens before Account Kit export succeeds.
- 2026-03-15: Account Kit reissue now validates canonical runtime metadata on the API side and the local smoke flow covers authenticated reissue through the Worker plus Vite proxy path.
- 2026-03-15: Cloudflare migration loading now treats `infrastructure/migrations/*.sql` as the validation source of truth and uses an embedded runtime fallback only when the Worker environment cannot read the filesystem directly.
- 2026-03-15: `P4-C06`, `P7-C01`, and `P7-C02` are complete; the vault shell now exposes encrypted CRUD for `login` and `document` while delete remains a temporary hard delete until `P7-C03`.
- 2026-03-15: Added `Phase 7.5 - UX/UI Visual Baseline` after core vault semantics and before attachments, sync, and owner/admin expansion to avoid both pre-functional design churn and late retrofit cost.
- 2026-03-15: `P7-C03` now persists `vault_item_tombstones` with revision increment and keeps vault list/detail live-only; `P7-C04` now uses an in-memory local decrypted index with an explicit allowlist and no password indexing.
- 2026-03-15: Added `docs/UI_STYLE.md` and `docs/EXTENSION_UX_BASELINE.md` as standing UI/UX reference documents; `P75-C01` is now `in_progress` because the baseline is documented but not yet applied to the current web shell.
- 2026-03-15: `P75-C01` and `P75-C02` are now implemented in the web app; the shell uses shared CSS tokens and parity-aware theme variables, `/vault` is the authenticated landing route, and the vault workspace now follows a sidebar/list/detail layout without dead navigation items.
- 2026-03-15: `P75-C03` and `P75-C04` are now implemented in the web app; onboarding, auth, unlock, and vault forms share normalized feedback and busy-state patterns, vault search now supports `/` and `Ctrl/Cmd+K`, `Escape` closes active vault edit/create context, and the shell received a practical responsive/accessibility pass without introducing a parallel UI system.
- 2026-03-15: Replaced the interim web UI with the approved refactor baseline: public/auth screens were rebuilt with strict microcopy control, authenticated navigation now lives in a real app shell, `/settings` became the canonical security surface, `/vault` is route-driven for list/detail/create/edit, and dirty-state discard confirmation is now explicit before editor exit.
- `2026-03-14`: `Global Gates` are treated as transversal blockers, not an executable phase.
- `2026-03-14`: `P1-C03` is already marked `done` because repository hygiene baseline and `.gitignore` exist.
- `2026-03-14`: `P5-C03` is explicit to separate onboarding persistence and initial trusted-device registration from generic onboarding UI.
- `2026-03-14`: Phase `9.5` card IDs use `P95-*` format to avoid dotted identifiers in execution tooling.
- `2026-03-14`: Browser extension V1 is retrieval and fill-oriented; `save login` is out of scope for the first delivery.

## Next Cards
1. `P12-C01` - `Threat-model review update`
       Condition to finish: threat model reflects implemented unlock-grant, LTS-only pairing, bridge hardening, and residual risks.
2. `P12-C04` - `Secret scanning verification`
       Condition to finish: repository-wide scan reviewed with no unaddressed secret findings.
3. `P12-C05` - `Dependency audit verification`
       Condition to finish: dependency audit triaged with no untriaged high-severity issues.
