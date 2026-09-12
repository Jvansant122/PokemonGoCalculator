---
name: audit-2026-09-12-opening-burst-deletion-and-friendship-batch
description: Post-batch audit of commits 23fb03e..91dd2cf (opening-burst deletion, dodge-lockout extraction, friendship threaded to five more engine modules). Two stale test comments, one confirmed-resolved prior finding, one duplication tension flagged with caution, no new dead code.
metadata:
  type: project
---

Scope: `packages/engine/src`, `packages/web/src`, `scripts/` diffed against the prior audit
(2026-09-09). Ran `npm run lint` (clean) and `npm run unused-exports` (38 modules, all type-only
exports — same class already excused twice, not re-flagged; count is consistent with the prior
~37, no new *value* export came back unused).

**Confirmed RESOLVED:** the 2026-09-09 audit's top finding — `PowerUpOptimizerView.tsx`'s
single-raid JSX never getting the same component extraction its multi-raid sibling got — is fixed.
`SingleRaidResultsSection`/`SingleRaidBudgetPlanSection` exist (added in `455a936`, "chore:
post-ship cleanup of the multi-raid batch", 2026-09-09, i.e. the very next commit after that
audit). File is still 3686 lines total but is now internally split into named render functions on
both branches — don't re-flag the missing-extraction shape again; if this file recurs as a finding
it should be about splitting into separate files, not missing component extraction.

**`combat.ts` is down to 2 exports** (`bossChargedMoveReadySeconds`, `DamageTrajectoryPoint`) after
the opening-burst deletion (930a25c), both still heavily used across engine (`simulate.ts`,
`teamRaid.ts`) and web (5+ call sites via the package export surface). Deliberately left as its own
module to keep the deletion diff honest per the commit's own memory note
(`deletion_opening_burst_cluster_2026_09_11.md`). Flagged to engine-developer as a low-priority
"fold into simulate.ts or types.ts?" option, not a finding — re-check next pass whether it grew
back or stayed frozen at 2 exports.

**Two stale test comments found** (both predate the deletion commit but now point at symbols/files
930a25c removed today):
- `packages/engine/test/sustainedComparison.test.ts:235` — test name says "same gating as
  runComparison"; `runComparison` no longer exists.
- `packages/engine/test/sustainedComparison.test.ts:465` — comment says "(see scenarioA.test.ts)";
  that file was deleted today.

**Duplication tension (flagged, not a clean "fix this")**: the outgoing-damage-modifier object
literal (`stab`/`typeEffectiveness`/`megaBoostMultiplier`/`weatherBoosted`/`friendshipLevel`) is
now hand-built at 12 call sites across `comparison.ts`, `teamRaid.ts`, `powerUp.ts` (x2),
`rosterPlanner.ts`, `rosterMoveChange.ts` — real, measurable duplication (~6 lines x 12). BUT: this
is the exact shape that produced three real bugs fixed today (`5be01ce`, part of `6bb3282`) —
an object built field-by-field silently missing `friendshipLevel` its sibling call sites/spread
already had. A shared constructor is a legitimate option but only if it stays two structurally
different functions (outgoing takes `friendshipLevel`, incoming's signature has no such parameter
at all) — never one shared builder with an optional/omittable field, which is exactly the kind of
"looks-covered-but-isn't" shape this project's own `fix_powerup_ladder_friendship_omission.md` and
`fix_rosterplanner_friendship_omission.md` memory notes warn against. Handed to engine-developer as
an option, explicitly flagged with that caution attached rather than a plain "extract this."

**Swept for more of the "hand-built object missing a sibling's field" bug shape** (the brief's
highest-value ask): checked every `outgoingFastMoveDamageModifiers`/`outgoingChargedMoveDamageModifiers`/
`fastDamageOut`/`chargedDamageOut` construction site in `powerUp.ts`, `teamRaid.ts`,
`rosterPlanner.ts`, `rosterMoveChange.ts`, and every web `run/run*.ts` friendship pass-through —
all now correctly set `friendshipLevel` on outgoing only, all incoming sites correctly omit it with
an explicit comment. No unfixed instance of this bug shape found anywhere in the batch.
`ivComparison.ts`/`breakpoints.ts`/`speciesReport.ts` don't use this named-object pattern at all
(breakpoints.ts takes flat params, not an outgoing/incoming modifier object), so they were never a
candidate for this specific bug shape.

**`rosterPlanner.ts` (2975 lines) / `powerUp.ts` (2329 lines)** — both grew modestly today
(+47/+21 lines respectively) via the friendship threading, not created by it. Both are internally
staged with clear `// --- Stage N ---` section comments (same "well-organized despite size"
verdict `sync-data.ts` got twice). Not a fresh finding — recorded here as a size to re-check
next pass if either crosses ~3500 lines, same treatment `sync-data.ts` gets.

**Test-only-export pattern check** (`entryBossMetricsInputs` in `rosterPlanner.ts`,
`benchedProxyDamagePerSecond` in `rosterMoveChange.ts`, both exported 2026-09-12 "purely for direct
test access" per their own doc comments): consistent with how this repo already does it elsewhere
— same rationale/wording pattern as e.g. `powerUpOptimizerExport.ts`'s exported helpers and the
2026-09-09 audit's own note on same-file-only exports. Not a finding.

## Excluded as standing decisions (checked, not re-flagged)
- Mega/primal boost `1.3` — not touched this batch, not present in this batch's diff at all.
- Per-tab scenario/Assumptions triples — not touched.
- `hypotheticalDuo.ts` fixtures — still not re-exported from `index.ts`; scan working correctly.
- `data/raw`/`data/normalized` — not touched this batch.
- `sync-data.ts`'s stale-looking `scenarioA.ts`/`PRIMAL_KYOGRE` references (lines ~1268/1293/3190)
  — these refer to a DIFFERENT, already-long-deleted file (`packages/engine/src/fixtures/
  scenarioA.ts`, deleted 2026-09-06 per CLAUDE.md), not today's `test/scenarioA.test.ts`. Already
  correctly narrated as historical/deleted in two of the three spots; the third (a runtime
  `console.log` string, line ~3190) predates this batch entirely (last touched 2026-09-11,
  commit 33fc02c) and is data-sync's routing, not this batch's orphan. Not flagged.
