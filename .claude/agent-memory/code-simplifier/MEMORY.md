---
name: code-simplifier-memory
description: Findings from prior bloat/dead-code audits of packages/engine, packages/web, scripts — what was reported, what was excluded as a standing decision, and file/function sizes worth re-checking next pass.
metadata:
  type: project
---

# Code-simplifier memory index

- [First full audit — 2026-09-06](audit_2026_09_06_first_pass.md) — repo-wide sweep before any
  memory existed. Dead exports (`Combatant`, `energy.ts` trio), the Phase-1
  opening-burst-comparator caution flag (don't re-flag as plain dead code), chart-axis-helper and
  badge-JSX duplication, `sync-data.ts`/`IvBreakpointsView.tsx` size notes, standing-decision
  exclusions confirmed.
- [Multi-raid Power-Up Optimizer batch audit — 2026-09-09](audit_2026_09_09_multiraid_batch.md) —
  scoped to commits 5136c68/3043516. Two real dead-field/stale-comment findings
  (`pokeGenieMatch.ts`/`rosterPool.ts` unused `isFullyEvolved`; `fetchCache.ts` stale "not yet
  consumed" comment), one small engine-only duplicated pricing formula, and the top finding:
  `PowerUpOptimizerView.tsx`'s single-raid JSX (~400 lines) never got the same component
  extraction its multi-raid sibling did in the same file. Also records which `unused-exports`
  hits were false positives (same-file-only usage, JSX prop types) so they aren't re-investigated.

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
