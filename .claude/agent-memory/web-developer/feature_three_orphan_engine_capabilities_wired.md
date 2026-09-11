---
name: feature_three_orphan_engine_capabilities_wired
description: Wired IDEAS.md #23 (Team Raid own-cast dodge cost), #24 (Frustration notice), and #5 (Best Buddy candidates) — three engine capabilities that shipped with no UI caller
metadata:
  type: project
---

2026-09-11: three engine-only capabilities (IDEAS.md #5/#23/#24) wired into `packages/web` with zero
`Scenario`/engine-call shape changes needed — all three were already fully plumbed through the run
modules as pass-through fields (`ReturnType<typeof optimizePowerUps>` etc.), so no `run/*.ts` edits
were required, only view-layer rendering. `check-scenario-roundtrip` correctly stayed at 152 fields.

**#23 (Team Raid own-cast dodge cost).** Extracted the Comparator's inline `OWN_CAST_DODGE_COST_HINT`
into a shared `ownCastDodgeCostHint.ts` exporting only the CORE caveat paragraph (the "this is an
unsourced placeholder" sentence, which must read identically everywhere) — each tab appends its own
trailing sentence describing what number it's actually showing, since Team Raid is a SINGLE
deterministic run (no seeds, no "mean per run") while the Comparator means over 200. Summed
`holdChargedMoveDodgeCostEvents`/`Seconds` across every `TeamRaidSlotResult` row (one per fight,
across cycles) into one whole-encounter total in the "Raid result" `<dl>`, gated on
`assumptions.holdChargedMoveUntilSafe`, badge-unsourced styled identically to the Comparator's own.
Live-verified (Playwright against `dist`, default roster/boss with the toggle flipped on):
`Own-cast dodge-vulnerability cost ~12.00s total across this encounter (12 events)`.

**#24 (Frustration notice).** `RosterMoveChangeResult.frustrationNotices` renders as its own
`result-card` block (heading "Holds Frustration — informational, NOT an exclusion") placed BEFORE
the second-charged-move/Elite-TM tables, structurally separate from the `excluded`/`otherExcluded`
lists further down — never a table row next to "Reason", which would read as an exclusion despite
the engine's own doc comment insisting it categorically isn't one.

⚠️ **Load-bearing finding: this is currently UNREACHABLE with any real data in this app.** No
species in `data/normalized/species.json` — shadow or otherwise — ever carries a charged move
literally named "Frustration" in its `chargedMoves` list (verified directly: `grep`-equivalent scan
of all 1750 entries, 0 hits; a sampled shadow's own `chargedMoves` is a plain 3-move list with no
Frustration). That's correct and expected — Frustration is assigned dynamically in-game to a
freshly-caught, unpurified Shadow, never listed in GAME_MASTER's static per-species movepool this
sync pipeline reads — but it means BOTH import paths (`pokeGenieMatch.ts`'s CSV move-name matching,
which matches only against `species.chargedMoves`) AND the Roster tab's hand-entry `MoveSelect`
(options = `species.chargedMoves`, no free-text) can never produce a pool entry whose
`chargedMoveId` resolves to a move named "Frustration". The UI code path is correct and tested (see
below), but a live user cannot currently trigger it through any real workflow. This is a
data-layer/engine gap, not a web bug — flag for `engine-developer`/`data-sync` if this should ever
be closed (e.g. a synthetic "this Shadow could also have rolled Frustration" annotation at import
time), but that's a real design call, not an obvious fix.

**#5 (Best Buddy candidates, single-raid only).** New `.badge-free` CSS class (reuses
`.badge-persists`' info-blue hue, own doc comment — same "reuse hue, add meaning" convention as
`.badge-unsourced` reusing `.badge-approximate`'s). Two render sites: (1) `data.bestBuddyCandidates`
as its own ranked table (no cost/efficiency columns AT ALL — the engine type has no such fields,
never render a blank/"—" placeholder for one) in a new `CollapsibleSection`, with a "biggest gain"
headline sentence above the table (matches the tab's existing `Recommendation`-section convention);
(2) `plan.bestBuddyRecommendation` as its own `.blocked-gain-callout`-styled box inside
`SingleRaidBudgetPlanSection`, right after `bestBlockedCandidate`'s two callouts, rendered only when
non-null (structurally can only ever be one object, never an array — verified by TypeScript, not
just convention). **Multi-raid mode explicitly told it doesn't have this** — added a `<p>` note in
`MultiRaidResultsSection`'s intro explaining why (no per-entry `isBestBuddy` field on `RosterEntry`,
needs the aggregate-across-bosses noise machinery single-raid doesn't have) rather than silently
rendering nothing, per the task's own explicit requirement. Also fixed a STALE caveat sentence in
the single-raid "Known caveats" block that still said "Best Buddy status... is not modelled in this
tab" — true before this session, false after; a genuinely stale doc-comment-style claim is worth
grep'ing for whenever a "not modelled yet" gap gets closed.

Live-verified (Playwright, default PU_DEFAULTS roster/boss, `holdChargedMoveUntilSafe` unrelated to
this): the ranked table rendered real nonzero per-slot deltas (e.g. Slot 6 Heracross +0.49, Slot 3
Terrakion +0.29 team DPS), each correctly labeled "≈0 (within noise)" since none individually cleared
the run's ±0.73 noise floor at the tab's fixed 20 seeds — an HONEST result, not a bug: Best Buddy's
absolute team-DPS effect (one +1 effective level bump) is small relative to this tab's noise floor at
default settings, on this specific roster/boss. Tried level 50 (all slots) as a second scenario —
deltas got SMALLER, not bigger (0.00-0.10), an interesting but unexplained real finding worth a
raised eyebrow if revisited, not investigated further this session. Did NOT manage to produce a live
non-null `bestBuddyRecommendation` render in the time budgeted — the "at most one" structural
guarantee is instead proven by (a) the field's own type (`BestBuddyPlanRecommendation | null`, never
an array — TypeScript-enforced) and (b) a dedicated `run.smoke.test.ts` shape-only test. Reported
this gap plainly rather than manufacturing a favorable scenario — matches this task's own explicit
instruction to say so when a real-number render can't be produced, which is exactly what happened
for #24 above and PARTIALLY for this positive-recommendation case (the negative/candidates-table case
DID render real numbers; only the plan's single-recommendation POSITIVE branch didn't, within budget).

**Playwright gotcha rediscovered live** (already in memory elsewhere, but cost real time this
session): `CollapsibleSection`'s `id` prop is a `localStorage` key, NOT a DOM id — EVERY top-level
section on Team Raid and Power-Up Optimizer starts collapsed by default in a fresh browser context
(no persisted fold state), including the whole `PowerUpOptimizerAssumptionPanel` itself (wrapped in
its own `CollapsibleSection id="pu-assumptions" defaultOpen={false}`). A Playwright script targeting
a field inside it must `getByRole("heading", { name: "Assumptions" }).click()` (or the section's own
heading) FIRST, then locate the real input by its actual `id` — a timeout on "element is not visible"
against a real, correctly-`id`'d `<input>` is almost always this, not a rendering bug. Locate a
section's content by `page.getByRole("heading", {name}).locator("xpath=ancestor::details[1]")`, not
by `#id`.
