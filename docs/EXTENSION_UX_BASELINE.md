# VaultLite Extension UX Baseline

Status: `official baseline`
Last updated: `2026-03-15`
Primary UI reference: `docs/UI_STYLE.md`
Scope phase: `Phase 7.5` baseline for `Phase 11`

## Purpose

This document defines the structural and interaction baseline for the browser extension.

It exists so the extension does not become:
- a compressed web app
- a mini dashboard
- a generic popup with unclear priorities

The extension must be context-first, fast, and safe.

## Core Principle

The extension is `domain-first`.

That means:
1. unlock or authenticate as required
2. show matches for the current site first
3. keep `Fill` easy to reach
4. fall back to global search only when needed

The extension is not a primary browsing surface for the whole vault.

## Surfaces

Official extension surfaces:
- `popup`
- `full-page auth/unlock/bootstrap view`
- `options/settings`

## Theme

The extension follows the same theme policy as the web app:
- default: `prefers-color-scheme`
- explicit user preference overrides default
- extension should share the same preference when technically viable
- extension must not drift silently from the web app theme policy

Baseline validation in this phase covers:
- popup locked light
- popup locked dark
- popup with domain matches light
- popup with domain matches dark

## Popup

### Objective

Resolve the current site with the least friction possible.

### Required flow after unlock

1. show current-domain matches
2. if none exist, fall back to global search
3. keep `Fill` above the fold whenever there is an eligible item
4. expose `Copy username` and `Copy password` as secondary actions
5. expose `Open in web app` as an escape hatch, not a primary habit path

### Required states

- `locked`
- `local unlock required`
- `session expired requiring remote authentication`
- `domain matches available`
- `no domain matches, global search fallback`
- `manual fill unavailable`
- `empty vault`
- `technical recoverable error`

### Structural rules

- do not start in a mini-dashboard mode
- do not center the popup around analytics, health, or overview widgets
- current-domain context is the first sorting principle
- the popup uses compact utility density
- no critical primary action may be pushed below the first useful viewport block
- no clipping of primary actions
- no clipping of the search field
- no overflow that hides `Fill`
- avoid scrolling the popup body when internal regions can scroll instead

### Density

- popup row target: `52-60px`
- list metadata preview: max 1 short line
- keep rows information-rich but scan-friendly

## Full-Page Auth/Unlock/Bootstrap View

Used for:
- `remote authentication`
- `local unlock`
- Account Kit import/bootstrap
- recoverable technical errors

Rules:
- use the same auth-shell language as the web app
- one task per screen
- no sidebar
- short and clear security copy
- no decorative detours

## Options / Settings

Used for:
- extension preferences
- device/session information
- lower-frequency secure actions

Rules:
- keep sections explicit and shallow
- do not turn options into a backoffice
- sensitive actions remain clearly separated from routine preferences

## Action Hierarchy

Primary:
- `Fill`

Secondary:
- `Copy username`
- `Copy password`
- local context actions that help the active site task

Escape hatch:
- `Open in web app`

Rules:
- `Fill` must remain visually dominant for eligible matches
- secondary actions must not compete with `Fill`
- sensitive actions do not belong in the primary popup action cluster

## Search Behavior

Rules:
- search comes immediately after essential header/context
- search is available even when current-domain matching fails
- global search is fallback, not first posture
- no server-side plaintext search behavior is implied by extension UX

## Feedback And Empty States

Use the same semantics as the web app:
- `Toast` for short non-critical confirmations
- `InlineAlert` for contextual issues
- sensitive blocks for security-impact actions
- no stack of high-emphasis messages without hierarchy

Primary empty states must offer an action when obvious:
- no domain match -> search globally
- empty vault -> go to the web app to create an item, or show the next practical step if available

## Secrets In The Extension

Rules:
- revealed secrets re-mask on state transitions that change trust context
- reveal cannot persist accidentally through rerender or lock boundary
- copy feedback must be textual and visual, not color-only
- secrets never appear in compressed list previews

## Accessibility

Required:
- accessible labels for fill, copy, reveal, lock, and search
- high-contrast interactive states
- keyboard-usable popup behavior where supported
- reduced-motion respect
- no icon-only critical meaning

## Phase Boundary

This phase does not require final extension polish.

It does require:
- structural coherence
- explicit state taxonomy
- valid action hierarchy
- theme parity baseline
- reference screenshots for the primary popup states

Detailed functional UI for extension delivery still belongs to `Phase 11`.

