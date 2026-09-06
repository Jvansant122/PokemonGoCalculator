---
name: feature-hide-inert-boost-ui-and-move-efficiency-metrics
description: Hiding the party/team-damage UI group and Total-damage/Own+team columns when no candidate has an active mega/primal boost; adding EPS (fast) and DPS×DPE efficiency (charged) figures to MoveSelect option text
metadata:
  type: project
---

Implemented 2026-09-05, two independent UI-only requests, no `Scenario`/`Assumptions` field added
(both are pure display-conditionality / label changes, so no add-scenario-assumption checklist
needed — confirmed that reasoning before skipping it, don't skip that check reflexively next time).

**Hiding inert boost UI, not just showing N/A** — four places touched, all keyed off "does at
least one candidate currently have a *resolved* boost" (mega/primal species AND not
`candidateMegaBoostDisabled`-ticked for it), not "is either species flagged mega" alone:
- `AssumptionPanel.tsx`: added a local `hasActiveBoost(species, disabled)` — NOT imported from
  `App.tsx`'s existing `resolveBoost` (see `[[feature_disable_mega_boost_toggle]]`) because
  `App.tsx` already imports `Assumptions` from `AssumptionPanel.tsx`, so importing back would be
  circular. Precedent for this "small local equivalent instead of a shared import" pattern already
  existed in `sensitivity.ts`, which independently inlines the same `boostDisabled[i] ? undefined :
  candidates[i]!.boost?.multiplier` logic rather than importing `App.tsx`'s helper — followed that
  precedent rather than inventing a third convention or introducing a shared-helpers module for
  what's ultimately a two-line boolean. Wrapped the three party fields (`partySize`/`teammateDps`/
  `matchingTeammateCount`) in `{anyBoostActive && (...)}`, computed as a plain `const` in the
  component body (not memoized — this component already re-renders on every keystroke, it's cheap)
  so it's live as species/checkboxes change, per the ask.
- `App.tsx` result card: wrapped the ENTIRE "Other trainers' damage..." dt/dd pair in `{hasBoost &&
  (...)}` (previously only the dd showed conditional N/A text, the dt always rendered) — now both
  the label and value disappear together for an inert candidate, alongside the pre-existing
  `{hasBoost && ...}` "Own + team damage" pair right after it.
- `DamageOverTimeTable.tsx`: added `showTotalColumn = xHasBoost || yHasBoost` (OR across both
  candidates, not per-candidate — this is one shared table with one shared column, can't drop it
  for only one side). When false, both candidates' "Total damage" `<th>`/`<td>` are omitted and
  `colSpan` on the group header drops from 3 to 2; caveat paragraph gets one unified sentence
  instead of the two per-candidate "equals exactly" sentences.
- `BossMovesetSweep.tsx`: same OR-across-both pattern (`showOwnPlusTeamColumn`), drops the
  "Own+team" column, and additionally renames the "Winner" column header to "Winner (own total)"
  (from "Winner (own+team)") since the winner-decision math is unchanged (`ownPlusTeam` is still
  computed internally for `winnerIndex` — dropping the column is purely a display change, the
  underlying "survivability counted as team DPS" comparison still runs even when it happens to
  equal own-total-only this scenario).

**MoveSelect.tsx new derived metrics** — extended `optionLabel`, kept all pre-existing DPS/damage/
duration/energy text intact:
- Fast moves: `~X.X EPS` = `energyGain / durationSeconds`, appended next to the existing DPS figure
  (one string: `"~{dps} DPS, ~{eps} EPS"`).
- Charged moves: `Efficiency: X.X (DPS×DPE)` = `power² / (durationSeconds × energyCost)`, i.e.
  `DPS × DPE` where `DPE = power / energyCost` — labeled explicitly as this tool's own composite,
  not an official/community stat, per the user's own instruction to avoid implying it's a known
  metric (PvPoke etc. don't publish this exact product). Added only to charged options; fast moves
  get EPS instead, never both on one option.
- Verified via a throwaway scratch `.mjs` (no DOM/JSX pipeline needed since it's pure arithmetic):
  Counter (power 12, duration 0.9s, energyGain 8) → 8.9 EPS; Close Combat (power 100, duration
  2.3s, energyCost 45) → DPS 43.5, DPE 2.22, efficiency 96.6, confirmed `power²/(duration×cost)`
  matches `DPS×DPE` computed independently.

**Verification ladder this session**: `tsc --noEmit` clean, `vite build` succeeded (pre-existing
chunk warning only). No browser-preview tool available in this session's actual tool grant
(confirmed against the tool list, not assumed) — ran `vite preview`, curled root + the JS/CSS asset
paths for 200s (note: `vite preview`'s HTML references `/assets/...` at the plain root, NOT
prefixed with `/PokemonGoCalculator/` the way the real GH-Pages deploy `base` would serve it — a
`vite preview` quirk, not a bug; fetch the asset path straight off the HTML rather than assuming
the configured `base`), `node --check` on the downloaded bundle, and grepped it for the new option
text (`"Efficiency:"`, `"DPS×DPE"`, `"EPS)"`, `"energy cost"`) and the new hide-copy (`'redundant
"Total damage'`, `'redundant "Own+team'`) as evidence the changes actually shipped in the built
bundle, not just compiled. Killed the background preview process afterward via its PID (Windows —
`netstat -ano` + `Stop-Process`, since there's no `pkill` here).

**No engine/Scenario change needed or made** — both requests are pure conditional-rendering and
label changes on values already computed (`resolveBoost`'s output, `power`/`duration`/`energyCost`/
`energyGain` already on every move object). Nothing to flag to `engine-developer` this session.
