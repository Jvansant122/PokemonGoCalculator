---
name: feature-power-up-optimizer-tab
description: Building the Power-Up Optimizer (sixth tab) — per-slot cost-modifier exclusivity math, a real (not hypothetical) performance measurement of optimizePowerUps, and the null-vs-zero efficiency distinction
metadata:
  type: project
---

Built 2026-09-08. Engine half (`packages/engine/src/powerUp.ts`, `optimizePowerUps`) and data half
(`data/normalized/powerUpCosts.json`) already existed and were tested (30 engine tests green)
before this session started — this was a pure wiring task: `packages/web/src/registry.ts` (added
`powerUpCostTable`/`powerUpCostsFetchedAt` exports, stripping the JSON's `sourceUrl`/`fetchedAt`
provenance fields down to the engine's exact `PowerUpCostTable` shape), new
`powerUpOptimizerScenario.ts` (web-owned, `?pu=` param, modelled on `speciesReportScenario.ts`),
new `PowerUpOptimizerAssumptionPanel.tsx` + `PowerUpOptimizerView.tsx` (modelled directly on
`TeamAssumptionPanel.tsx`/`TeamRaidView.tsx`'s roster-editor pattern), `App.tsx`'s sixth tab,
`scripts/check-scenario-roundtrip.mjs`'s new TABS row, and the `add-scenario-assumption` skill +
`web-developer.md`'s own tab tables (both now six rows, "five"/"three" counts corrected
throughout).

**A THIRD mutual exclusion beyond Team Raid's precedent, and the resolution order matters.**
Team Raid's `normalizeTeamAssumptions` already established two rules (isMega roster-wide
exclusivity, isShadow forced off by `.boost`) that this tab reuses verbatim. Power-Up Optimizer
adds a third: Shadow and Purified are mutually exclusive at the COST layer specifically
(`powerUp.ts`'s `powerUpStepCost` throws if both `PowerUpCostModifiers` flags are set — this is
independent of `shadowAdjustedBaseStats`' own Shadow+boost throw, a different check on a different
object). Resolution order in `normalizePowerUpAssumptions`: boost forces Shadow off FIRST, then
`effectiveIsShadow(species, <the already-boost-corrected isShadow>)` forces Purified off SECOND —
this two-step chain means a boost-carrying species with BOTH Shadow and Purified checked ends up
with Shadow forced off (by boost) but Purified SURVIVES (proven via a scratch script, not assumed)
— because after Shadow is corrected to false, `effectiveIsShadow` also reads false, so nothing
forces Purified off. This is actually CORRECT, not a bug: a real Purified Pokémon CAN be Mega
Evolved in-game (only Shadow cannot), so "mega + purified" is a legitimate combination the
normalization should allow, and it does — by construction, not by having specifically designed for
that case up front. If a future edit "simplifies" this to a flat "boost forces both Shadow AND
Purified off" rule, that would be a real regression, not a cleanup — verify against the real
mechanic before doing that.

**`optimizePowerUps` is fast in practice — 217ms for the full 202-candidate default roster sweep**,
measured via a throwaway `tsx` script calling it directly with the exact shipped default roster
(6 slots, levels 25-40, vs `tyranitar-mega`, 3 iterations each). This matters because the task
description's own framing ("expensive; debounce it") implied this might need serious performance
care (Species Report's sweep took ~1.1-1.4s at full scale and needed a whole debounce
infrastructure narrative) — the reality here is two orders of magnitude cheaper than that fear,
because `runTeamRaid` itself is cheap (a handful of stepwise-battle simulations, not the ~500-boss
sweep Species Report does). Kept the debounce (400ms, modelled on Species Report's 300ms) as cheap
insurance for a slower future roster/boss combination, not because it was empirically necessary at
today's default. Don't assume a "the docs say expensive" framing means measurement can be skipped
— it would have been easy to over-build worker/chunking infrastructure here for a problem that, at
today's real numbers, doesn't need it.

**Null-efficiency (not zero) for a resource with no cost is load-bearing, and worth a scratch-script
proof, not just reading the engine's type.** `deltaTeamDpsPerCandy`/`deltaTeamDpsPerXlCandy`/
`deltaTeamDpsPer1000Stardust` are each `null` (not `0`) when that specific resource's cost is `0`
for a given candidate — e.g. a pure-XL power-up step (regular `candy: 0`) has `deltaTeamDpsPerCandy:
null` while `deltaTeamDpsPerXlCandy` is a real (possibly-zero) number. Confirmed this numerically
against a real pure-XL candidate from the default roster (`{cost: {stardust:10000, candy:0,
xlCandy:10}, deltaTeamDpsPerCandy: null, deltaTeamDpsPerXlCandy: 0}`) rather than trusting the doc
comment alone. The ranked table's sort (`sortedCandidates`) treats `null` as "sinks to the bottom"
and renders it as "—", explicitly NOT as a worse-than-zero number — a genuine `0` efficiency
candidate (like the XL one above) sorts normally among other numeric values, only `null` gets the
special bottom-of-list treatment. Getting this backwards (treating null as 0, or sorting nulls
first) would silently misrank every pure-regular-candy or pure-XL-candy step.

**Reused `effectiveIsShadow`/`applyShadowToggle` from `shadowToggle.ts` for the COST side too, not
just combat** — `costModifiers.isShadow` is built as `effectiveIsShadow(species, slot.isShadow)`
(true if either the user's toggle is on OR the species is already registry-flagged Shadow), the
same helper already used for the combat-side `applyShadowToggle`. This means a species that's
inherently Shadow (rare in the candidate/attacker picker, but possible) correctly gets the Shadow
COST multiplier too without a second parallel "is this shadow" computation — one source of truth
for both the combat stats and the power-up cost.

**Level/IV clamping is a call-site-boundary concern, not a raw-state concern** — `clampHalfLevel`/
`clampIv` are applied only when building `optimizerInputs` (the object handed to
`optimizePowerUps`), never to the raw `PowerUpSlotAssumption.level`/`ivAttack` etc. stored in
component state. `powerUpCost`/`powerUpDamageLadder` throw on a non-half-level or an
out-of-[1,50]-range level (`toHalfIndex`'s own guard), and a live-typed number input can transiently
be neither (e.g. typing "3" as the first digit of "35", or clearing the field to retype) — clamping
at the state layer would fight the user's typing; clamping only at the engine-call boundary lets
the input stay exactly what was typed while guaranteeing the engine never sees an invalid value.
Same reasoning `applyShadowToggle`'s "apply only at the engine-call boundary" convention already
established for a different kind of value.

**Verification this session**: no browser tool available (Read/Write/Edit/Bash/Grep/Glob only,
reconfirmed per [[verification_without_browser_tool]]). `npm run check-scenario-roundtrip` (17
fields, all round-trip — new "Power-Up Optimizer" row alongside the existing five, 97 fields total
project-wide), `npx tsc --noEmit` clean in packages/web, `npm run build --workspace=packages/web`
succeeded (pre-existing >500kB chunk warning only), `npm run test:engine` 24 files/237 tests green
(zero engine files touched — confirmed via `git status --porcelain packages/engine` showing only
other agents' already-in-flight, pre-existing powerUp.ts/teamRaid.ts changes I never edited). Two
throwaway `tsx` scripts (both deleted after, `git status --porcelain packages/web` reconfirmed
clean each time): one running the real default-roster `optimizePowerUps` call end-to-end (the
217ms/202-candidate/null-efficiency numbers above) PLUS a full `PowerUpOptimizerScenario` encode →
`buildPowerUpOptimizerScenarioUrl` → `parsePowerUpOptimizerScenarioFromUrl` round-trip with
NON-default values (stardust 12345, slot 2 at level 27.5, isShadow+isLucky both true, rankBy
"candy" — `JSON.stringify(decoded) === JSON.stringify(scenario)` true) and a second round-trip of
an "old-shape" scenario missing `bossChargedMoveCadence` entirely, confirming it decodes as
`undefined` (proving the `?? DEFAULT_ASSUMPTIONS.bossChargedMoveCadence` guard in
`scenarioToAssumptions`, not the engine, is what prevents that reaching the `<select>`); a second
script exercising `normalizePowerUpAssumptions` directly against real registry species (the four
mega/shadow/purified exclusion cases above). Also served the real production build via `vite
preview`, curled root/JS/CSS for 200s, `node --check`ed the bundle, and grepped it for shipped
literal strings ("Power-Up Optimizer" ×1 nav label, "power-up-optimizer" ×6, "recomputing" ×2,
"Rank candidates by", "Shadow and Purified are mutually exclusive" ×2, "single-slot power-up"
case-insensitive ×2, "no further breakpoint before level 50" ×2, "Best stardust efficiency", and
`.badge-breakpoint` in the CSS bundle) — all found. **Did not click through the actual live-typing
UX in a rendered browser** (re-ranking on level change, checkbox exclusivity's visual disabled
state, the "recomputing…" opacity dip) — same real gap as every prior tab-build session in this
project's history; flagging per convention rather than implying it was checked.
