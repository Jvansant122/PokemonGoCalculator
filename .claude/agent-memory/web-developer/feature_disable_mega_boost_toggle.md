---
name: feature-disable-mega-boost-toggle
description: Wiring Scenario.candidateMegaBoostDisabled through the full add-scenario-assumption checklist, the resolveBoost(species, disabled) convention used everywhere in packages/web, and where "N/A, not 0" was applied for an undefined boost multiplier
metadata:
  type: project
---

Implemented 2026-09-05, the web half of engine-developer's
`bugfix_mega_boost_marginal_attribution.md` (engine side — marginal-not-total team damage,
`boostMultiplier: number | undefined`, per-move-type own-boost gating, and the new
`Scenario.candidateMegaBoostDisabled: [boolean, boolean]` field — already done that session; this
session touched packages/web only, did not edit packages/engine).

**Full checklist completed for `candidateMegaBoostDisabled`**: `Assumptions.candidateMegaBoostDisabled`
(`AssumptionPanel.tsx`), `DEFAULT_ASSUMPTIONS.candidateMegaBoostDisabled = [false, false]` (`App.tsx`),
both directions of `assumptionsToScenario`/`scenarioToAssumptions` (with `s.candidateMegaBoostDisabled
?? [false, false]` on decode), a checkbox per candidate ("Disable mega/primal boost (fair DPS
comparison vs. non-mega)"), and threaded into `runSustainedComparison` (main results),
`compareAcrossBossChargedMoves` (boss moveset sweep — not explicitly named in the original request
but threaded anyway since its own-damage numbers are otherwise inconsistent with the main result
cards if this toggle only affects one of the two call sites), and `computeSensitivity`'s internal
`runSustained` (`sensitivity.ts`).

**Checkbox only renders when `candidateSpecies[i]?.boost` is truthy** — toggling a mechanic that
doesn't exist for a genuinely non-mega species is meaningless, so the control is simply absent for
one, not present-but-disabled. This also means the boolean stays harmlessly `false` in
`Assumptions` for a non-mega candidate without a UI element ever needing to touch it.

**`resolveBoost(species, disabled)` helper added to `App.tsx`** (mirrors the engine's own
internal, unexported `resolveBoost` in `comparison.ts` — this one is trivial field access, not a
reimplementation of any real math, so it doesn't cross the "don't reimplement engine math" line):
```ts
function resolveBoost(species, disabled): SpeciesDefinition["boost"] | undefined {
  if (!species || disabled) return undefined;
  return species.boost;
}
```
Every call site that used to do `species.candidates?.[i]?.boost?.multiplier ?? 1` now does
`resolveBoost(species.candidates?.[i], assumptions.candidateMegaBoostDisabled[i] ?? false)?.multiplier`
with NO `?? 1` fallback — `undefined` must reach `convertUptimeToTeamDamage` as `undefined`, since
(per the engine memory) `1` still credits `OFF_TYPE_MEGA_BOOST_MULTIPLIER`'s real bonus to
non-matching teammates even for a candidate with no boost mechanic at all. Fixed in `App.tsx`
(4 separate call sites: result-card loop, ratio-sentence block, chart props, table props),
`sensitivity.ts` (`boostMultipliers` tuple), `DamageOverTimeChart.tsx`/`DamageOverTimeTable.tsx`/
`BossMovesetSweep.tsx` (type change `boostMultiplier: number` → `number | undefined`).

**`sensitivity.ts`'s check #3 ("Mega boost multiplier") needed an explicit undefined-guard** — it
scans `for (let m = boostMultipliers[0]; m >= 1.0; m -= 0.02)`, which is meaningless/NaN-producing
if `boostMultipliers[0]` is `undefined` (candidate A genuinely non-mega, or disabled). Added an
early branch: when undefined, push a check reporting "candidate A has no active mega/primal boost
to scan" (flips: false, rangeMin/rangeMax both 1.0) instead of running the loop.

**"N/A, not 0" applied to genuinely dedicated boost-only fields, left as natural 0 elsewhere**:
`convertUptimeToTeamDamage` already returns `0` for `boostMultiplier: undefined` (engine-side, no
UI change needed for the arithmetic) — the UI-level question was only ever "how to *display* that
0/absence". Landed on:
- `App.tsx` result card: "Team damage from this candidate's boost" dd shows literal text
  `"N/A — no mega/primal boost active for this candidate"` instead of `"0"` when `hasBoost` is
  false; the "Own + team damage from boost" dt/dd pair is omitted entirely in that case (would
  just duplicate the already-shown "Mean own total" row).
- `DamageOverTimeChart.tsx`'s damage-tally line: renders `"own {X} damage total (no mega/primal
  boost active — N/A team contribution)"` instead of the normal "own + team = total (X% / Y%)"
  sentence, gated on `series.boostMultiplier === undefined`.
- `DamageOverTimeTable.tsx`'s "Total damage" column and `BossMovesetSweep.tsx`'s "Own+team" column
  were left as literal `0`-team-component numbers (they naturally just equal the "Own damage"/"Own
  total" column when boost is absent, which is mathematically correct, not misleading) — but each
  got an added caveat-paragraph sentence per no-boost candidate explicitly stating why ("X has no
  active mega/primal boost — its Total damage column above equals its Own damage column exactly"),
  since these are shared multi-row columns where hiding/replacing a whole column per-candidate
  isn't structurally clean the way a single dedicated dt/dd pair is. `OwnTeamShareBar` was left
  entirely alone (renders a real, accurate 100%-own/0%-team bar when there's no boost — not
  misleading, no special-casing needed).

**Verification this session**: full ladder — `tsc --noEmit` clean, `vite build` succeeded (only
pre-existing chunk-size warning), `npm run test:engine` 14 files/88 tests green (confirms zero
accidental engine edits — count is now 88, up from 82, reflecting engine-developer's own new tests
for this same feature). No browser-preview tool available this session (reconfirmed against the
actual tool grant). Ran `vite preview`, curled root + both asset paths for 200s, `node --check` on
the downloaded JS bundle, and grepped it for `"Disable mega/primal boost"`, `"no mega/primal boost
active"`, `"no active mega/primal boost"` as evidence the new UI text actually shipped. For the
actual formula proof (short of clicking a checkbox in a real browser): a throwaway `.mts` script
in `packages/engine/src/` (deleted after, confirmed via `git status` that only engine-developer's
own pre-existing changes remained) ran `runSustainedComparison` with the same `MEGA_RAICHU_X` vs
itself, `candidateMegaBoostDisabled: [false,false]` vs `[true,true]` — confirmed own damage output
measurably drops when disabled (387.8 → 296.9 mean total damage in one run). A second scratch
script round-tripped a `Scenario` with `candidateMegaBoostDisabled: [true, false]` through
`buildScenarioUrl`/`parseScenarioFromUrl` and confirmed exact restoration, and separately confirmed
a scenario object missing the field entirely (simulating an old shared link) decodes to
`candidateMegaBoostDisabled: undefined` at the engine level — proving `App.tsx`'s `?? [false,
false]` guard is the thing actually doing the work, not something the engine already defaults for
you.

**Unrelated bundled request, same session**: `DamageOverTimeTable.tsx`'s row sampling changed from
a "nice step targeting ~14 rows" to a fixed 1-second step always — see
[[feedback-cumulative-not-rate]]'s updated note (that memory documented the original `pickRowStep`
design; this session's change superseded it per explicit user request, not a bug fix).

**A real Node/tsx gotcha reconfirmed**: running `npx tsx ./_scratch.mts` from *inside*
`packages/engine/src/` intermittently resolved the entry-point path one directory too high
(`packages/engine/_scratch.mts` instead of `packages/engine/src/_scratch.mts`) even though `pwd`
and `ls` in the same shell confirmed the file existed exactly where expected — root cause not fully
identified (possibly an `npx`/workspace-symlink cwd quirk specific to this Windows/Git-Bash setup).
Workaround that reliably worked: `cd` to the package ROOT (`packages/engine`, not `.../src`) and
pass the script path relative to that root (`npx tsx src/_scratch.mts`) instead of `cd`-ing into
`src` and using a bare filename or `./` prefix.
