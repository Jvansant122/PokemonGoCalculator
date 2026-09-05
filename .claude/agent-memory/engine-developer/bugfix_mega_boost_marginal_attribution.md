---
name: bugfix-mega-boost-marginal-attribution
description: Team-damage-from-boost must be the boost's marginal/attributable delta, not teammates' total output; undefined (not 1) means "no boost mechanic"; own-boost is gated per-move-type
metadata:
  type: project
---

Implemented 2026-09-05, user-reported correctness bug plus a bundled feature (three fixes, one
pass, user explicitly approved bundling).

**Fix 1 — `uptime.ts`'s `convertUptimeToTeamDamage` was returning the teammates' TOTAL boosted
output, not the boost's marginal contribution.** A teammate at 10 DPS boosted to 13 DPS should
show up as 3 (the attributable extra), not 13. Formula changed from
`matching*dps*boostMultiplier + nonMatching*dps*OFF_TYPE_MEGA_BOOST_MULTIPLIER` to
`matching*dps*(boostMultiplier-1) + nonMatching*dps*(OFF_TYPE_MEGA_BOOST_MULTIPLIER-1)`. This is a
real, user-facing conceptual fix, not a cosmetic rename — re-derive any pinned number built on the
old total-output formula (see below for the one that moved).

**Fix 2 — `boostMultiplier` must be `number | undefined`, never a `?? 1` fallback.** `undefined`
means "this candidate has no boost mechanic active at all" (genuinely non-mega, or explicitly
disabled — see Fix 3B) and makes `convertUptimeToTeamDamage` return `0` immediately, before
`matching`/`nonMatching` are even touched. Passing `1` is **not** equivalent: under the delta
formula, `1` still fully credits `(OFF_TYPE_MEGA_BOOST_MULTIPLIER - 1)` to non-matching teammates,
which is real nonzero credit for a boost that doesn't exist. Every `?? 1` fallback on
`species.boost?.multiplier` (both in engine call sites and in web's own re-derivations) needs to
drop the fallback and propagate `undefined` through. Changed: `uptime.ts`'s
`UptimeConversionInputs.boostMultiplier`/`Candidate.boostMultiplier`, `comparison.ts`'s
`CandidateResult.boostMultiplier`. **`SustainedCandidateResult` never had a `boostMultiplier`
field at all** (a deliberate decision documented in `packages/web/src/sensitivity.ts`'s own
comment — it reads `species.boost?.multiplier` straight from `SpeciesDefinition` instead) — don't
add one there just because `CandidateResult` (opening-burst path) has it; that's an intentional
asymmetry, not a gap.

**Fix 3 — own-damage mega boost must be gated per-move-type.** `comparison.ts` was applying
`species.boost?.multiplier` unconditionally to BOTH a candidate's fast and charged move damage,
regardless of whether that move's type matched `species.boost.boostedType` (e.g. Mega Camerupt's
Ground-type Earthquake shouldn't get its Fire boost). Added `ownBoostMultiplier(boost, moveType)`
helper in `comparison.ts`: full multiplier only when `moveType === boost.boostedType`, else `1`.
Gated at all 4 call sites (fast+charged, `runComparison`+`runSustainedComparison`). This was
invisible in every pinned fixture because Mega Raichu X/Y's default moveset (Static
Shock+Wild Charge) is Electric on both moves, matching their boosted type either way — didn't
touch any Scenario A/B pinned number.

**New feature — `Scenario.candidateMegaBoostDisabled: [boolean, boolean]`** (matched by index),
threaded as `candidateMegaBoostDisabled?: [boolean, boolean]` into both `ComparisonInputs` and
`SustainedComparisonInputs` (default `[false, false]`). A full toggle via `resolveBoost(species,
disabled)` — when `true`, `species.boost` is treated as entirely absent for BOTH the own-damage
boost (Fix 3) AND the team-damage attribution (Fix 1/2), never a partial disable. Lets a user
compare a mega candidate's DPS fairly against a non-mega one.

**Pinned number that moved (re-derived, not weakened):** `uptime.test.ts`'s
`findCrossoverPartySize` "lower-DPS-but-tankier candidate overtakes" test — crossover party size
was `4` under the old total-output formula, is `18` under the correct delta-only formula (X's
uptime edge is worth much less per teammate once only the marginal boost counts, so it takes a
much larger party to overtake Y's raw-damage lead). Verified by hand:
`totalX(p) = 190 + 13*p*2*0.3`, `totalY(p) = 221 + 10*p*2*0.3`, crossing between p=17 and p=18.

**Web-side fallout (not fixed here, engine package only):** `packages/web/src/App.tsx`'s default
`Scenario` object now fails to typecheck (missing `candidateMegaBoostDisabled`) — expected, and
`web-developer`'s job to add (checkbox per candidate + default `[false, false]`). Also
`App.tsx`/`sensitivity.ts`/`DamageOverTimeChart.tsx`/`BossMovesetSweep.tsx` all currently do
`species.candidates[i]?.boost?.multiplier ?? 1` themselves (not reading it off `CandidateResult`)
— they need the equivalent disable-toggle-aware fix, and to stop rendering/treat as N/A when the
resolved multiplier is `undefined`.
