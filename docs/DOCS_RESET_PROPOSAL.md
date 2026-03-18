# VaultLite Documentation Reset Proposal

## Why Codex is getting trapped

The current documentation set mixes three different layers of truth:

1. stable product and security constraints
2. historical architecture and execution plans
3. current UI implementation guidance

That would already be annoying enough, but the repo also keeps multiple superseded plan versions alive as if ambiguity were a feature. The result is predictable:

- Codex reads old planning language as active instruction
- UI implementation gets pulled toward older navigation and future-scope surfaces
- historical roadmap text competes with the current vault-first redesign
- docs/plans becomes a graveyard that still whispers bad ideas into the generator

## Recommendation: keep a very small active set

## Keep as active source of truth

These should remain active and current:

- `AGENTS.md`
- `docs/PRD.md`
- `docs/SECURITY.md`
- `docs/THREAT_MODEL.md`
- `docs/ARCHITECTURE.md`
- `docs/UI_STYLE.md`
- `docs/WEB_UI_EXECUTION.md`
- `status-card.md`

## Keep but mark as frozen / out of current scope

- `docs/EXTENSION_UX_BASELINE.md`

This should remain available, but explicitly marked as:
- frozen baseline
- extension only
- not governing current web redesign implementation

## Archive out of active truth

These are historically useful, but they should stop governing implementation:

- `docs/plans/2026-03-14-vaultlite-v1-foundation.md`
- `docs/plans/2026-03-14-vaultlite-v1-corrected-plan.md`
- `docs/plans/2026-03-14-vaultlite-v1-corrected-plan-v2.md`
- `docs/plans/2026-03-14-vaultlite-v1-corrected-plan-v2.1.md`
- `docs/plans/2026-03-14-vaultlite-v1-corrected-plan-v2.2.md`
- `docs/plans/2026-03-14-vaultlite-v1-corrected-plan-v2.2.1.md`
- `docs/plans/2026-03-15-phase7-tombstones-local-index-implementation.md`
- any critical-review or intermediate review file that exists only to explain how older plans were corrected

## What to do with archived plans

Do not delete them if you still want history.
Move them to something like:

- `docs/archive/plans/`
- `docs/archive/reviews/`

And add a clear header to each archived file:

> Archived historical plan. Not an active implementation source of truth.

## Replace these files

### Replace `AGENTS.md`
Current problem:
- it still points Codex to "the latest plan in docs/plans"
- that means Codex keeps chasing historical plan files instead of the current UI execution rules

New rule:
- `AGENTS.md` must point to a short authority chain, not to a folder full of fossils

### Replace `docs/UI_STYLE.md`
Current problem:
- it still carries too much future-surface and general baseline language
- it is broader than the current redesign needs
- it leaves room for Codex to resurrect `Devices`, `Import / Export`, and `Admin` too early

New rule:
- `UI_STYLE.md` should be the standing visual baseline only
- active authenticated navigation for the current round must be explicitly limited

### Add `docs/WEB_UI_EXECUTION.md`
Current problem:
- execution rules are spread across plan versions, reviews, and chat-derived docs
- Codex keeps treating historical architecture and roadmap text as implementation instruction

New rule:
- current web implementation rules need one coercive doc
- this doc must govern routes, IA, responsive behavior, microcopy, and page-specific constraints

## Minimal active authority chain

After the reset, Codex should follow this order:

1. `AGENTS.md`
2. `docs/PRD.md`
3. `docs/SECURITY.md`
4. `docs/THREAT_MODEL.md`
5. `docs/ARCHITECTURE.md`
6. `docs/UI_STYLE.md`
7. `docs/WEB_UI_EXECUTION.md`
8. `status-card.md`

Nothing in `docs/archive/` should count as active truth.

## Hard rule for Codex

If a document is archived, it is historical context only.
It must not override current implementation docs.
