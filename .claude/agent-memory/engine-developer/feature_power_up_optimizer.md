---
name: feature-power-up-optimizer
description: powerUp.ts's cost table/ladder/optimizer module (2026-09-08) — GAME_MASTER interpretation, a discovered spec discrepancy, and the paired-run design
metadata:
  type: project
---

Built `packages/engine/src/powerUp.ts` (Part A-E of a spec from the overseer) for a new
"Power-Up Optimizer" tab: ranks a power-up by TEAM-DPS gained per resource spent (stardust/candy
kept as separate numbers, never blended), and surfaces the floored per-hit damage breakpoint
separately from the noisier simulated-fight DPS numbers.

**Why**: product thesis extension — power-ups are a resource-spend decision, and like everything
else in this project the headline output should be "where does spending more actually change
anything," not a single composite score.

**How to apply**: `powerUpCostTableFromGameMaster(upgrades, luckyStardustDiscountPercent)` is the
ONE on-ramp for GAME_MASTER's `POKEMON_UPGRADE_SETTINGS -> data.pokemonUpgrades` — same role as
`fromGameMaster`/`fromGameMasterMove`. `scripts/sync-data.ts` should call it directly rather than
growing a second interpretation. `powerUpStepCost`/`powerUpCost`/`powerUpLevelsAbove` do
integer-safe half-level-index arithmetic (`level * 2`) internally — never accumulate `+= 0.5`
floats. `powerUpDamageLadder` reuses `effectiveStatsAtLevel`/`calculateDamage` unchanged (no new
damage math). `optimizePowerUps` reuses `runTeamRaid` unchanged, per-candidate, with the SAME seed
set as the baseline (common random numbers) — this is load-bearing for making small deltas
rankable at all; independently-seeded runs would bury a real delta in jitter.

**Interpretation discrepancy found and NOT silently forced to match**: the task spec that
commissioned this module hand-derived `39.5->40.5` costing `{19000, 15, 10}`. Running the
verified interpretation (array index = whole level, both its half-steps cost that same tabulated
amount — matches 4 of 5 given anchors, plus the prose description, plus the candy/XL split for
this EXACT pair) instead produces `{20000, 15, 10}` — verified via a throwaway `tsx` script, not
hand arithmetic. Every other given anchor (level 1, 1->2, level 40, 49.5->50, shadow/purified/
lucky rounding, lucky+purified stacking) matches exactly. Used the code-verified 20000 as the
pinned test value per this project's standing discipline (`CLAUDE.md`: re-derive, don't
hand-force an assertion to match a possibly-wrong prior expectation) — flagged explicitly in the
module's top doc comment and in the delivered report for a human to double-check against the raw
dump if it matters. See [[fact_cpm_table_extended_to_50]] for the precedent of trusting
pre-verified/re-derived numbers over hand arithmetic in this codebase.

**Part D** (`TeamRaidSlotInput.level?`/`.ivs?`): a genuinely small, additive change —
`slot.level ?? level` / `slot.ivs ?? ivs` in `runTeamRaid`'s fight loop, byte-identical when
omitted. Whole existing `teamRaid.test.ts` suite passed unchanged.

**Environment note**: this session hit repeated `PostToolUse` hook OOM/VirtualAlloc failures
running `npm run test:engine` (vitest's default forked-worker pool) that were NOT caused by the
edits — `tasklist` showed 6 stray leftover `node.exe` processes from earlier failed runs eating
memory; killing them fixed it immediately, and `npx vitest run --pool=forks
--poolOptions.forks.singleFork=true` is a reliable single-process fallback for verifying a change
when the hook itself is failing for unrelated memory-pressure reasons. Don't assume a hook OOM
failure means the edit broke something — check for stray node processes first.

Also see the standalone `RAID_TIER_TABLE`-style precedent in `raidBoss.ts` for "verify by running
code, cite discrepancies rather than hiding them" as the house style this follows.
