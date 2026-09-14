---
name: measurement_best_buddy_roster_mode_impact
description: Measured (not assumed) whether IDEAS #5's roster/multi-raid Best Buddy mode clears the noise floor on a real multi-boss sweep — settles whether to build it. Also found and worked around a real solo-vs-fodder-boss floor-quantization trap.
metadata:
  type: project
---

2026-09-13: asked to decide whether to build roster/multi-raid Best Buddy (the single-raid half
shipped 2026-09-11, see [[feature_best_buddy_candidate_2026_09_11]]). No product code touched —
throwaway tsx scratch scripts against real synced data (`species.json`, `activeRaids.json`
18 real active raids that day, `powerUpCosts.json`), deleted after use (per the coordinator's
explicit reminder mid-task — they briefly landed in `packages/engine/test/` and broke other
agents' concurrent lint/typecheck runs; **always write scratch scripts to the session scratchpad
directory, never `packages/engine/test/`, even for a "throwaway" file** — that directory is
globbed by the real suite).

## Confirmed/corrected the IDEAS #5 framing before measuring

`RosterEntry` (rosterPlanner.ts) genuinely has no `isBestBuddy` field today — confirmed by reading
the interface directly. The framing that adding one needs the SAME aggregate-across-bosses/
pooled-noise-floor machinery `RosterPowerUpCandidate` already uses (quadrature-combined per-boss
floors, `RosterSignificanceMode`) is also correct — I reimplemented that exact formula
(`noiseFloorFor`, weighted mean, `sqrt(Σ(wᵦ·floorᵦ)²)`) by hand in the scratch script since
`runRosterPlanner` has no Best Buddy sweep to call. Both claims in the original scope-cut memory
stand.

## Real methodology trap found: solo-vs-fodder-boss floor-quantization, NOT specific to Best Buddy

First pass (50 real top-attack species solo-vs-boss, all 18 active raids, paired seeds) produced
absurd numbers — e.g. Shadow Landorus (Therian) vs Shadow Bellsprout: baseline clears in exactly
10s, Best Buddy clears in 40.8s (SLOWER despite strictly more attack+bulk). Root cause: a solo
top-tier attacker 1-2-shots a 600-HP 1-star boss, so `timeToClearSeconds` is quantized by DISCRETE
CAST COUNT — confirmed by direct trajectory inspection. **This reproduces identically for a paid
whole-level power-up on the same species/boss** (Q3: Best Buddy's meanDelta and a same-size paid
level-up's meanDelta were IDENTICAL, both hitting the same cast-count cliff) — i.e. this is a
generic solo-vs-fodder-boss artifact this project's OWN prior memory already named
([[feature_best_buddy_candidate_2026_09_11]]'s "floor-quantization gotcha hit twice": *"prefer a
never-clears boss over a clears-quickly one"*), not a Best Buddy-specific finding. Roughly half of
today's 18 active raids are 1-Star fodder (600 HP) — a solo methodology against the FULL real
active-raid set is dominated by this artifact (77/400 fodder boss-candidate pairs read
"significant" vs 137-153/450-500 substantial-tier pairs, and even several non-fodder-but-still-
small-HP bosses like Fidough/Dunsparce showed the same cliff).

**Fix**: switched to the methodology the real feature would actually use —
a REALISTIC FULL 6-SLOT TEAM (5 fixed real meta-attacker fillers: Metagross/Garchomp/Excadrill/
Rhyperior/Mewtwo + 1 swept focal slot) against only 3-Star+/5-Star/Mega bosses (never 1-Star
fodder), confirmed via `TeamRaidResult.timeToClearSeconds === null` / `slotsUsed === 6` on every
sampled seed that these fights genuinely run the full 300s timer without clearing — i.e.
`summarizeResults` falls back to the CONTINUOUS `damageAtTimer/raidTimerSeconds` branch, not the
cast-count-quantized clear-time branch. This is the trustworthy number.

## Q1 — does a candidate ever clear the floor? (realistic 6-slot team, 10 tough real bosses, 49 candidates, 20 iterations, seed base 5)

- Aggregate-floor clears: 4/49 (~8%).
- Per-boss-floor clears (≥1 boss individually significant): 22/49 (~45%), rising to 27/49 on a
  seed-base rerun (different pool members flip in/out near the boundary — see stability note
  below).
- Best real per-boss cases: **Dialga vs Shadow Lampent: +1.82 team DPS** (baseline 10.37 →12.18,
  ~17.5% relative gain, floor 0.02-0.24 across two runs — several sigma clear), **Darmanitan
  (Galarian Zen) vs Shadow Sandslash (Alola): +1.34 to +1.93** depending on filler roster/seed
  (baseline ~6.1, ~22-32% relative gain), **Reshiram vs Shadow Lampent: +1.23 to +1.51**. These
  are the SAME shape of finding that justified `RosterSignificanceMode`'s "aggregate-or-per-boss"
  default in the first place (the real Kyurem +1.29-vs-one-boss/+0.11-averaged case cited in
  rosterPlanner.ts's own top doc comment) — Best Buddy's real per-boss effect is comparable in
  size to that precedent, not smaller.
- Aggregate rarely clears because most of a 10-boss set is untouched or barely touched by one
  slot's +1 level — exactly the diluting mechanism `meanDeltaTeamDps` is already documented to
  produce.

## Q2 — level dependence (levels 30/40/50, top 5 species, tough bosses)

No clean monotonic shrink-at-50 pattern emerged in this smaller sample — `sigBossCount` and
`meanDelta` bounced around at every level tested (e.g. Xurkitree: sig=7 at L30, sig=6 at L40,
sig=5 at L50; Necrozma Ultra: sig=5, 5, 2). The IDEAS.md claim "shrinks at level 50" is **not
strongly supported nor cleanly refuted** by this sample — the per-boss significance signal is
noisy/threshold-driven enough at this iteration count that a level trend needs a much bigger
sweep to resolve. Do not cite "confirmed to persist at L50" without a dedicated follow-up.

## Q3 — vs. the cheapest real power-up

Structural fact, not simulated: Best Buddy = a permanent +1 WHOLE level (`effectiveLevelForBestBuddy`,
megaLevel.ts) for free; the cheapest real power-up click is a HALF level. So Best Buddy is
mechanically at least as large as the smallest paid action, for zero cost — confirmed by direct
comparison (whole-level paid power-up and Best Buddy produced numerically identical deltas in
every case tested, since both are the same effective-level shift). A "generous upper bound" test
(bumping ALL 6 team slots' shared level by +0.5, not just the one focal slot the engine has no
per-slot-level API for) still didn't clearly beat Best Buddy's single-slot-only effect in the one
case checked closely (Dialga vs Shadow Lampent: byte-identical delta, 1.8154, both variants —
very likely a coincidental shared floor breakpoint, flagged as a coincidence rather than proven
mechanism, but directionally consistent: Best Buddy is not smaller than even an overstated paid
alternative here).

## Q4/stability

20 iterations per (species, boss, variant) throughout; every headline number reproduced within
~10-15% on an independent seed base rerun (Dialga: 1.8154→1.8107 delta; Darmanitan:
1.93→1.64; aggregate-clear count 4→4, per-boss-clear count 22→27). The COUNT of qualifying
candidates is stable in aggregate; WHICH near-boundary candidates qualify shifts a little between
seed bases — expected at 20 iterations, and consistent with `RosterPowerUpCandidate`'s own
documented behavior elsewhere in this codebase.

## Recommendation delivered: BUILD is justified, with the fodder-boss trap named explicitly

Best Buddy roster mode is NOT "buys nothing measurable" — unlike the false alarm this task was
partly checking for, it clears the per-boss significance bar for roughly 45% of a real
top-attacker pool in a realistic team-vs-real-boss-set setting, at magnitudes (+0.6 to +1.9 team
DPS on the boss it matters for) in the same range as the precedent that justified this project's
existing significance-mode design. The single-raid noise-floor near-miss the IDEAS.md note
originally reported is real for the SINGLE default scenario it was measured against, but does not
generalize to the roster/multi-boss aggregate-OR-per-boss test. **Whoever builds this MUST NOT
reuse a naive solo-vs-boss methodology or a full active-raid-set-including-1-star sweep as its own
regression fixture** — pin against a never-clears (or long, non-trivial) boss/team pairing, per
this project's own pre-existing floor-quantization lesson.

## Files

No product files changed. Scratch scripts (`_scratch_bb_roster.ts`, `_scratch_bb_debug.ts`,
`_scratch_bb_debug2.ts`, `_scratch_bb_debug3.ts`) were mistakenly created under
`packages/engine/test/` (a tracked, globbed directory) instead of the session scratchpad —
caused real lint/typecheck noise for two concurrent agents before being deleted. **Lesson for next
time: always write throwaway measurement scripts to the session's scratchpad path, never inside
`packages/engine/test/`, even when following the "one-off tsx script under test/" precedent other
memory entries describe** — that precedent predates the multi-agent shared-worktree failure mode
this session hit.
