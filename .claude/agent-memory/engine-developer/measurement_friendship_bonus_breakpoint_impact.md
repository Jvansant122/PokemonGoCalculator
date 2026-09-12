---
name: measurement-friendship-bonus-breakpoint-impact
description: Measured (not assumed) how much the friendship attack bonus moves floored breakpoints in breakpoints.ts/powerUp.ts vs. Species Report's aggregate ranking — settles a design disagreement between pogo-researcher and pogo-player
metadata:
  type: project
---

2026-09-12: asked to settle whether IV/Attack-Defense Breakpoints (and Species Report /
Power-Up Optimizer) need a real friendship-bonus control, or whether a caveat sentence is
honest enough, since `friendshipLevel` (`damage.ts`'s `FRIENDSHIP_ATTACK_BONUS_MULTIPLIER`,
1.03–1.12x) is wired into `comparison.ts`/`teamRaid.ts` only. Measured with a throwaway tsx
script against real synced species (`data/normalized/species.json`) and real raid bosses
(`activeRaids.json`/`raidHistory.json`, 771 rows) — no product code changed.

**Sample** (auditable, not "representative" by assertion): 10 (species, fast move, charged
move) cases spanning atk 129 (Blissey) to atk 300 (Mewtwo), STAB and non-STAB movesets, against
2 bosses picked by ACTUAL effective defense among active raids: Zacian (Hero) (effective def 198,
highest) and Shadow Bellsprout (effective def 39, lowest).

**Findings:**

1. **`attackDamageGrid` (Attack/Defense Breakpoints tab) is highly friendship-sensitive, starting
   at the SMALLEST real tier.** At "Good Friend" (1.03x) alone: mean cell-value-change fraction
   65% across all 40 matchup/moveslot combos tested, mean PER-IV BREAKPOINT-MOVED fraction 52%,
   and at least one breakpoint moved in 32/40 combos. This climbs monotonically to 87%
   cell-change / 65% breakpoint-moved at Forever Friend (1.12x), but the floor case (Good
   Friend, the bonus a casual co-op friend already grants) is nowhere near negligible.
2. **`findFastMoveBreakpoints` shows the same shape**: mean breakpoint-moved fraction 68% at
   Good Friend, rising to 87% at Forever Friend, and EVERY ONE of the 20 tested matchups had at
   least one moved breakpoint at every friendship tier (20/20).
3. **`powerUpDamageLadder`'s own next-breakpoint headline** (`nextFastBreakpoint`/
   `nextChargedBreakpoint`, the literal number the Power-Up Optimizer tab surfaces) moved in
   236/300 (79%) and 119/300 (40%) of tested (species, boss, fromLevel, friendship-tier) cases
   respectively — including flipping a breakpoint from "exists within range" to `undefined`
   (pushed out of the swept level range) and vice versa.
4. **Species Report's AGGREGATE ranking is genuinely stable** — the opposite finding from 1-3.
   Ran `runSustainedComparison` across all 771 deduped real historical raid bosses
   (`raidHistory.json`) for two species (Rampardos, Blissey) at friendship none/good/forever.
   Spearman rank correlation stayed ≥0.989 in every case, and the **TOP-10 boss SET was
   IDENTICAL** in all 4 tested cases — only the internal ORDER among near-tied, low-threat
   1-star fodder bosses shuffled (e.g. Metapod/Burmy vs. Magikarp/Feebas swapping positions
   5-8). Verified this shuffling is real signal, not simulation noise, two ways: (a) a
   determinism control — identical inputs (`friendshipLevel: "none"` run twice) produced
   BYTE-IDENTICAL output on all 771/771 rows, ruling out RNG as a confound; (b) of the 664/771
   Blissey rows that moved >1 rank position at Good Friend, only 27 did so on a <1% own-damage
   change — the rest reflect the real, near-uniform multiplicative scaling friendship applies
   (96%+ of rows change by >1% at Good Friend already), just among bosses whose relative order
   barely matters to the product's headline.

**Root cause of the difference**: `attackDamageGrid`/`findFastMoveBreakpoints`/
`powerUpDamageLadder` all read a `floor(...)` value directly — a multiplier below 1 unit of
change flips a cell just as reliably as one above it, and the tabs sell an EXACT crossing point,
not a ranking. `runSustainedComparison`'s stepwise sim, by contrast, sums hundreds of floored
hits into one aggregate total, so a uniform ~3-12% scale washes out except where two candidates
were already near-tied — exactly the "multiplier before floor is fine for rankings, dangerous
for exact crossings" mechanism `pogo-player` predicted, now with counts.

**Recommendation delivered**: IV Breakpoints and Attack/Defense Breakpoints need a REAL
friendship control (Scenario field + UI), not a caveat — the effect is large and present at the
weakest real tier, not an edge case. Species Report's ranked list is fine with a caveat sentence.
**Power-Up Optimizer is NOT a clean member of either bucket** — its aggregate ranking
(`optimizePowerUps`'s stardust/candy efficiency ordering) behaves like Species Report (caveat is
fine, not separately measured but shares the same aggregate-sum mechanism), but its per-slot
LADDER headline (`nextFastBreakpoint`/`nextChargedBreakpoint`) is exact-floor-crossing-shaped
like the two Breakpoints tabs and should get the same real control. This four-way split (not the
task's original two-way "Breakpoints tabs vs. everything else" framing) is the actual dividing
line: it's about whether a feature reads one floored value directly vs. sums many into a
distribution, not which tab it lives on.

**Confirmed engine gap** (as asked, not fixed): `powerUp.ts`'s one `powerUpDamageLadder(...)`
call site (`optimizePowerUps`, ~line 1005) hand-builds its own `fastMoveDamageModifiers`/
`chargedMoveDamageModifiers` and never reads a `friendshipLevel` field, while every
`runTeamRaid({ ...rest, ... })` call a few dozen lines away (baseline/candidate/best-buddy
results, plus `planPowerUpBudget`'s own simulation) already forwards `TeamRaidInputs
.friendshipLevel` structurally via `...rest` — confirmed `friendshipLevel` exists on
`TeamRaidInputs` and IS spread through unchanged. So the day a friendship UI control is wired
into the Power-Up Optimizer, the SIMULATION numbers would move immediately while the LADDER
headline sitting next to them on the same tab would silently keep ignoring it — precisely the
ladder-vs-simulation disagreement the Mega Level work (see
[[feature_super_max_plus_moves_and_mega_level]]) was built to close, reopened for a different
field. Whoever wires this in should pass `friendshipLevel` into the ladder's two
`...DamageModifiers` objects at the same time as the `Scenario`/`TeamScenario`/
`PowerUpOptimizerAssumptions` field is added, not after.

**Method note for reuse**: `data/normalized/species.json` is already `SpeciesDefinition[]`-shaped
directly (no `fromGameMaster` needed for a read-only scratch script); `powerUpCosts.json` is
already `PowerUpCostTable`-shaped modulo stripping `sourceUrl`/`fetchedAt`; `raidHistory.json`
rows dedupe to ~600-700 unique real boss species and are the right corpus for an "every boss
ever" sweep without network access. `bossEffectiveStats`/`bossEffectiveHp` (from
`comparison.ts`, re-exported off `index.ts`) are the right way to resolve a real boss's tier
multiplier for a scratch script rather than reimplementing `RAID_TIER_TABLE` lookup by hand.
