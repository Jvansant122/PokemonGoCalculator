---
name: feature_tm_move_change_optimizer_powerup_tab
description: Web half of PLAN_tm_move_change_optimizer.md — second-charged-move + Elite TM candidates on the Power-Up Optimizer's single-raid mode. Merged-ranked-table technique, mega kmBuddyDistance gap fix, unknown-moveset loop verification.
metadata:
  type: project
---

Built 2026-09-10/11. Engine half (`packages/engine/src/tmMove.ts`) already landed and untouched.
Scope: single-raid mode of the Power-Up Optimizer ONLY — the task's own 5-item build checklist
never named multi-raid/roster mode, and honoring it would mean re-deriving `rosterPlanner.ts`'s
team-composition/swap-in machinery in the web layer (out of bounds — that's `engine-developer`'s
call) plus the scale risk `PLAN_tm_move_change_optimizer.md` itself flags ("may be the reason
regular-TM candidates are infeasible in roster mode"). Flagged as a follow-up, not built.

## Real gap found + fixed: mega/primal species carry no own `kmBuddyDistance`

Confirmed empirically (`lucario-mega.kmBuddyDistance === undefined` while `lucario` itself is
`5`) before assuming — this data layer only ever populates buddy distance on the BASE form, same
established gap as `candyFamilyId` (`resolveMegaBaseCandyFamilyId` already exists in
`registry.ts`). Without a fix, EVERY mega/primal slot would show "buddy distance unknown, no
second-charged-move candidate" even when the base form's tier is known and CLAUDE.md's own
standing decision ("a TM on the base form is a TM on the mega") says it should apply. Added
`resolveMegaBaseKmBuddyDistance` to `registry.ts`, mirroring the candy-family helper exactly, used
in `run/runPowerUpOptimizer.ts` instead of reading `species.kmBuddyDistance` directly. Verified via
a real scratch-script call: Mega Lucario went from `secondChargedMoveBlocked` (reason: buddy
distance unknown) to a real 75000/75 candidate (Lucario's real 5km tier) after the fix.

## Merged-ranked-table technique (second-charged-move competes with power-ups)

Built a `RankedCandidateRow` normalizer type (kind: "power-up" | "second-charged-move",
`levelRange`/`change` display fields) in `PowerUpOptimizerView.tsx`, with
`powerUpCandidateToRow`/`secondChargedMoveCandidateToRow` mapping functions. Combined BOTH engine
result arrays (`result.data.candidates`, `result.secondChargedMoveCandidates`) into one list before
calling the EXISTING `sortCandidatesByEfficiency` (unchanged) — since both sides already draw on
the same stardust/candy budget, this was the correct place to merge, unlike Elite TM (own,
non-fungible item currency — CLAUDE.md's standing rule — kept in a wholly separate
`EliteTmSection`, never merged). Added "Type" and "Change" columns to the one table rather than
inventing a second parallel table, per the task's explicit "render inside the existing
stardust/candy ranking" instruction.

## Elite TM section: ranked by raw Δ, not efficiency

An Elite TM's cost is always exactly 1 item (`eliteTmItemsSpent: 1`), so there's no
per-1000-stardust-style ratio to compute — sorted by `deltaTeamDps` descending instead. Heading
implements the plan's own framing verbatim: `eliteTmHeading()` renders "your N Elite Fast TM(s),
best N targets" when the count is known, or "unknown Elite Fast TM count — showing every ranked
target" when `null`. Rows past the Nth position (when known) get a "✗ (would need another)"
within-stock marker — the count NEVER gates which candidates are generated, only this display
framing (confirmed via `secondChargedMoveEligibility`/`generateEliteTmCandidates` calls that never
reference the on-hand fields at all).

## TM inventory fields are display-only, deliberately never fed to the engine call

`fastTmOnHand`/`chargedTmOnHand`/`eliteFastTmOnHand`/`eliteChargedTmOnHand`: `number | null`, `null`
= unknown (never gates candidate generation — reused the candy-grid's "unknown, not zero"
convention explicitly). None of the four ever changes a simulated number (Elite TM candidates are
generated regardless of how many you own), so they were deliberately left OUT of both narrowed
engine-input memos (`optimizerAssumptions` for single-raid, `multiRaidInputs`) the same way
`rankBy` already is — the `add-scenario-assumption` checklist's step 6 explicitly allows this for
a setting that's genuinely display-only, and calling it out in code comments avoids it reading as
an oversight later. One `??`-guard subtlety that ISN'T a bug here (unlike most other optional
fields): because `DEFAULT_ASSUMPTIONS.fastTmOnHand` is itself `null`, `s.fastTmOnHand ?? null`
correctly collapses BOTH an absent field (old link) and an explicitly-shared `null` ("unknown") to
the same `null` result — no need for the usual `?? DEFAULT_ASSUMPTIONS.x` form, since the default
IS the nullish fallback value.

## Single-raid mode's 6 slots are ALWAYS a "known" moveset

The plan's whole "known/unknown/unrecognised" 3-state gate only matters for the separately
imported Roster-tab pool (`hydratedPool`) — this tab's own species/move pickers can never leave a
move blank, so `currentChargedMoveIds` passed to `generateSecondChargedMoveCandidates` is always
exactly length 1 for a fielded slot. Second-charged-move candidates are NEVER blocked for "unknown
moveset" reasons on this tab; only for "already has 2," "can't learn one without Shadow/Purified,"
or "buddy distance unknown" (the mega gap above, now fixed for all real cases).

## Unknown-moveset roster prompt: reused, didn't recompute

`PowerUpOptimizerView.tsx` already built an `entryMovesetBadges: Map<entryId, ...>` for the
multi-raid result tables (only ever `.set()` when a badge applies) — its `.size` IS the exact
"entries with unknown/unrecognised moveset" count the plan wants, no new computation needed.
Rendered as a mode-independent `<p className="caveats">` right under the subtitle (visible in
BOTH single-raid and multi-raid mode, since it's about the imported roster, not either mode's own
computation) with an honest scope caveat: "your separately-imported roster, not the [6-slot roster
below]." Built a real `<a href={getBaseUrl() + "?view=roster"}>` (full-page navigation — App.tsx
only reads `view=` on initial mount, so this is consistent with every other cross-tab link in this
file, e.g. `handleSendToTeamRaid`'s `window.location.href` assignment) rather than the plain
unlinked "Roster tab" text some OTHER caveat strings in this file already use.

## Verification: full live Playwright loop, not just reading the diff

No e2e spec added this pass (single-raid mode change, not a new tab/share-link surface per se —
flagged for a follow-up if this becomes a recurring gap). Instead ran TWO throwaway Playwright
scripts directly via `node` against `vite preview` on the PRODUCTION build (`packages/web/__scratch_*.mjs`,
deleted after, confirmed via `git status --porcelain packages/web` clean before AND after):

1. Live-typed the 4 TM count fields, confirmed the merged ranked table shows BOTH "Power-up" and
   "2nd charged move" rows sorted together, confirmed the Elite TM section renders "your 1 Elite
   Fast TM, best 1 target" / "your 2 Elite Charged TMs, best 2 targets" (matching real typed
   values), confirmed the "Move changes" caveat entry exists. Zero console errors.
2. **The actual "last loop is the feature" verification the task demanded**: seeded
   `localStorage["pogo-analyzer:roster-pool:v1"]` via `page.addInitScript` with one entry
   (`fastMoveIsDefaulted: true, chargedMoveIsDefaulted: true`, matching a real blank-CSV-row
   shape) BEFORE the app's first script ran, confirmed the Power-Up Optimizer note said "1
   imported roster entry has..." with a Roster-tab link, navigated to the Roster tab via its real
   tab button, confirmed the "default moveset" badge (case-INSENSITIVE match — `.innerText()`
   reflects the CSS `text-transform: uppercase` on `.badge`, so a naive lowercase `.includes()`
   false-negatived on first try), clicked "Edit," opened the REAL `MoveSelect` listbox
   (`#roster-form-fast` → click → `#roster-form-fast-listbox li[role='option']` → click; same
   listbox structure per [[feature_move_select_listbox_and_effectiveness_chips]]), picked a real
   move for both fast and charged, saved, confirmed the badge disappeared, navigated back to
   Power-Up Optimizer, confirmed the note/count was GONE. Full loop, zero console errors at every
   step.

**Gotcha re-hit (already in memory once, worth a second pointer)**: `CollapsibleSection`'s `id`
prop is a localStorage persistence key, NOT a DOM `id` — a `#pu-assumptions summary` selector
finds nothing. Use `page.locator("summary", { hasText: "..." })`. Worse trap this session:
several of this tab's sections default OPEN (`defaultOpen` prop) — blindly clicking a summary
"to open it" instead CLOSES an already-open one, and `.innerText()` on a closed native `<details>`
silently returns empty (not an error) since the UA stylesheet hides non-summary children — always
check `await details.evaluate(el => el.open)` before deciding whether to click.

## Verification actually performed

`npm run verify` fully green (test/typecheck/lint/check/build) — 510 engine tests, 284 web tests
(smoke test's default-scenario run rose from ~0.5s to ~0.7-0.75s per case with TM candidates
added, still comfortably inside the 400ms-debounce-then-compute UX), 227 script tests, 0 lint
errors (one pre-existing `SpeciesPicker` warning, unchanged, not mine to fix this session).
`check-scenario-roundtrip`: Power-Up Optimizer now 45 fields (was 41), all round-trip both
directions including a NEW non-default `scenarioRoundtrip.test.ts` case (`fastTmOnHand: 3,
chargedTmOnHand: 1, eliteFastTmOnHand: 2, eliteChargedTmOnHand: 0` — the `0` deliberately exercises
"known zero" vs "unknown null" surviving distinctly). Confirmed via `git status --porcelain
packages/engine` that zero engine files were touched. A concurrent session (Roster tab / e2e specs)
was mid-flight in the same worktree the entire time (confirmed via `git status` before starting,
per [[feedback_concurrent_sessions_shared_worktree]]) — never touched or staged any of its files.
