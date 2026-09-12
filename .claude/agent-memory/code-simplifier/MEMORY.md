---
name: code-simplifier-memory
description: Findings from prior bloat/dead-code audits of packages/engine, packages/web, scripts — what was reported, what was excluded as a standing decision, and file/function sizes worth re-checking next pass.
metadata:
  type: project
---

# Code-simplifier memory index

- [First full audit — 2026-09-06](audit_2026_09_06_first_pass.md) — repo-wide sweep before any
  memory existed. Dead exports (`Combatant`, `energy.ts` trio), the Phase-1
  opening-burst-comparator caution flag (RESOLVED 2026-09-11 — the cluster was deleted outright),
  chart-axis-helper and
  badge-JSX duplication, `sync-data.ts`/`IvBreakpointsView.tsx` size notes, standing-decision
  exclusions confirmed.
- [Multi-raid Power-Up Optimizer batch audit — 2026-09-09](audit_2026_09_09_multiraid_batch.md) —
  scoped to commits 5136c68/3043516. Two real dead-field/stale-comment findings
  (`pokeGenieMatch.ts`/`rosterPool.ts` unused `isFullyEvolved`; `fetchCache.ts` stale "not yet
  consumed" comment), one small engine-only duplicated pricing formula, and the top finding:
  `PowerUpOptimizerView.tsx`'s single-raid JSX (~400 lines) never got the same component
  extraction its multi-raid sibling did in the same file — RESOLVED the very next commit
  (455a936, 2026-09-09), confirmed still in place as of the 2026-09-12 audit. Also records which
  `unused-exports` hits were false positives (same-file-only usage, JSX prop types) so they aren't
  re-investigated.
- [Opening-burst deletion + friendship-threading batch — 2026-09-12](audit_2026_09_12_opening_burst_deletion_and_friendship_batch.md) —
  scoped to commits 23fb03e..91dd2cf. Two stale test comments (`sustainedComparison.test.ts:235,465`
  referencing deleted `runComparison`/`scenarioA.test.ts`); `combat.ts` frozen at 2 exports
  (low-priority fold-in option, not a finding); a real but *cautioned* duplication candidate (the
  12-site outgoing-damage-modifier object literal) explicitly weighed against the exact bug shape
  it would risk hiding; swept the whole friendship-threading diff for the "hand-built object
  missing a sibling's field" bug shape and found no unfixed instance. Confirms the 2026-09-09
  PowerUpOptimizerView finding as resolved.

## Cross-pass reminders (don't rediscover)

- `findCrossoverPartySize`/`CrossoverPoint` (uptime.ts) — WIRED since 2026-09-10 (IDEAS #19, `runComparator.ts`'s party-size flip). `sensitivity.ts` deliberately still does NOT use it, see
  pogo-researcher's own memory + `sensitivity.ts:190-197` comment. Not a fresh finding ever again
  unless that comment/memory file disappears.
- `packages/engine/test/fixtures/hypotheticalDuo.ts` species not re-exported from
  `packages/engine/src/index.ts` — standing decision, dead-export scan working as intended.
- `optimizePowerUps`/`planPowerUpBudget` and `runRosterPlanner`/`planRosterBudget` pairs — never
  propose merging; each pair answers a structurally different question, documented in both files.
- `ts-unused-exports` blind spots seen twice now: web→engine boundary (documented in the task
  brief) AND same-file-only usage / JSX prop types / structural typing of array-element types.
  Always confirm with Grep before flagging.
- `scripts/sync-data.ts` size (3078 lines as of 2026-09-09, up from 1306) — flagged as a split
  option to data-sync twice now, never as a hard finding (internally well-organized both times).
- `packages/engine/src/rosterPlanner.ts` (2975 lines as of 2026-09-12) and `powerUp.ts` (2329
  lines) — same "well-organized despite size" verdict as sync-data.ts, staged with clear `// ---
  Stage N ---` comments. Not a finding; re-check if either crosses ~3500 lines.
- The outgoing-damage-modifier object literal (`stab`/`typeEffectiveness`/`megaBoostMultiplier`/
  `weatherBoosted`/`friendshipLevel`) is hand-built at 12+ call sites across the engine
  (`comparison.ts`/`teamRaid.ts`/`powerUp.ts`/`rosterPlanner.ts`/`rosterMoveChange.ts`). Real
  duplication, but three real bugs (2026-09-12) were exactly "one of these sites forgot a field its
  siblings had" — any future extraction proposal must keep outgoing/incoming as two structurally
  different function signatures (incoming has no `friendshipLevel` parameter at all), never one
  shared builder with an optional field. Don't propose a single unified builder.
- `combat.ts` frozen at 2 exports (`bossChargedMoveReadySeconds`, `DamageTrajectoryPoint`) since
  the 2026-09-11 opening-burst deletion, deliberately left as its own module to keep that deletion
  diff honest. Low-priority fold-into-simulate.ts option, not a finding — re-check if it stays at 2
  exports for another audit cycle or grows back.
