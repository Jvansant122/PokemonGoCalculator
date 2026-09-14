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
- **4-stage split + species-moves batch — 2026-09-14** (scoped to 91dd2cf..633e35c, 31 commits;
  see below for the one real finding and everything checked and excluded).

## 2026-09-14 batch findings

**[stale-comment / docs-drift] CLAUDE.md:302** — "Checks — the first four are what `npm run check`
runs" is now wrong. `package.json`'s `check` script chains FIVE
(`check-scenario-roundtrip && check-raid-history-sources && check-mega-gates && check-docs-drift
&& check-species-split`) since `scripts/check-species-split.mjs` was added and wired in this batch
(commit `697b652`/`8a03721` cluster) without CLAUDE.md's Commands section being updated — the new
check isn't in the enumerated list either. **Confirmed via `npm run check-docs-drift`, which passes
clean** — it validates tab counts/params/command-existence/agent+skill mentions/hooks/PLANs, but
has no check that compares `npm run check`'s actual composition against CLAUDE.md's prose "first
N" claim, so this class of drift is structurally invisible to it (same shape as the
`diff-normalized.mjs` non-array-fallback bug the brief flagged: a real gap with no test path that
exercises it). HANDOFF.md's 2026-09-14 section does correctly say "`check-species-split` (in `npm
run check`)" — so the fact is known, just not propagated to CLAUDE.md's own Commands section.
**HANDOFF: overseer (direct CLAUDE.md edit) or data-sync (added the script, forgot the doc
update).** Optionally: `check-docs-drift.mjs` gaining a section that asserts `package.json`'s
`check` script's chain length/names against CLAUDE.md's "first N" sentence would make this
mechanically impossible going forward, same pattern as the hook-paragraph check added this same
batch (`ec5f2ed`) — worth offering to `meta-architect`/`data-sync` as an option, not building it
myself.

**Everything else checked this pass came back clean — recorded here so it isn't re-walked:**

- `PowerUpOptimizerView.tsx` (1714 lines post-split, commit `ef4256e` did 3792→1699) — checked
  every extracted-module import for post-split residue (all ≥2 references, none dead per lint
  passing clean) and every remaining top-level function/component for dead-after-split status (all
  called). `MultiRaidResultsSection.tsx` (1018 lines) / `SingleRaidResultsSection.tsx` (884 lines)
  — no duplication between them found; each mode's efficiency-sort helper
  (`rosterCandidateEfficiency` / `rankedRowEfficiency`) correctly delegates to the SAME shared
  resolver (`powerUpCandidateSort.ts`'s `efficiencyForRankBy`/`compareCandidatesByEfficiency`)
  rather than reimplementing it — this was already true before the split and stayed true after.
  Doc comments' claims about symbols "staying exported because also used by
  MultiRaidBudgetStepRow/MultiRaidBudgetPlanSection in PowerUpOptimizerView.tsx" were verified true
  by grep, not just trusted.
- `registry.ts` + `scripts/sync-data/speciesSplit.ts` + `scripts/check-species-split.mjs` (the
  speciesCore.json/speciesMoves.json split, IDEAS #26 Stage 1) — well-tested precondition guard
  (`deriveSpeciesSplit` throws on a move-id conflict, exercised by a deliberately-constructed
  conflicting pair per its own doc comment), a real re-join checker with no shortcuts (compares
  species.json to speciesCore+speciesMoves rejoined, species-by-species, plus orphan-detection
  both directions). Not a finding.
- `packages/engine/src/scenarioValidation.ts` (new, 210 lines) + `packages/web/src/
  webScenarioValidation.ts` (new, 108 lines) — the "mirror" the task brief flagged for a
  duplication check. **Confirmed NOT duplication**: the web file imports the engine's actual
  primitives (`isFiniteNumber`/`isPlainObject`/`sanitizeKnownFields`/`FieldValidators`) directly
  rather than re-declaring them, and its own additions are strictly web-only concerns (five
  web-owned scenario enums, two engine-typed-but-unguarded-there values, a generic nested-array
  sanitizer none of engine's fixed-length `TeamScenario.slots` needs). `FieldValidators<Scenario>`/
  `FieldValidators<TeamScenario>` are TypeScript mapped types, so a field missing its own validator
  is a compile error, not a silent gap — no completeness finding possible here even in principle.
- `dodgeFastAttackLockout.ts` (web) vs `rosterPlanner.ts`'s internal `bossDodgeFastAttacksLockout`
  — both correctly delegate to the shared engine primitive `fastMoveCadenceTooFastToDodge`; one
  produces the boolean for planning, the other the user-facing warning sentence. Not duplication.
- IDEAS #25 (the 12-site outgoing-damage-modifier object literal, parked 2026-09-12) — **site count
  unchanged at 12** (`comparison.ts` ×2, `powerUp.ts` ×4, `rosterMoveChange.ts` ×2,
  `rosterPlanner.ts` ×2, `teamRaid.ts` ×2) after this batch. `rosterPlanner.ts` grew +434 lines
  this batch (Best Buddy candidates) but none of that growth touched this literal's call sites —
  calculus unchanged, stays parked, don't re-propose.
- `rosterClearConfirm.ts`/`dodgeExecutionErrorLeader.ts`/`rosterCandidateDedupe.ts` — each has
  exactly one call site, flagged by the task brief as worth checking for needless abstraction, but
  each is a small pure-logic extraction with its own `.test.ts` (testability-without-rendering is
  this codebase's own established convention for JSX-adjacent logic, not novel over-abstraction
  introduced this batch). Not a finding.
- `scripts/diff-normalized.mjs` non-array-fallback crash — **already fixed in this batch**
  (`697b652`, the same commit that added speciesMoves.json's non-array shape): `Array.isArray`
  guards added around the generic fallback's `added`/`removed`/`changed` access, plus a
  `typeof result.changed === "boolean"` branch for the whole-file-boolean shape. Swept the rest of
  `diff-normalized.mjs` and `check-docs-drift.mjs`'s new sections (5b hooks paragraph check) for
  the same "fallback path assumes a shape nobody's tested" bug class — both defensive (try/catch
  around JSON.parse, `?? {}`/`?? []` defaults throughout), nothing else found.
- TODO/FIXME/XXX sweep across `packages/engine/src`, `packages/web/src`, `scripts/` — zero hits in
  product code.
- `npm run lint` — clean. `npm run unused-exports` — 44 modules (up from ~37 baseline), all typed
  exports or same-file-only value exports (`powerUpOptimizerSentences.ts`'s `formatShortfall`/
  `joinWithAnd`, confirmed by grep to have zero call sites outside their own file) — same known
  false-positive class as prior passes, not re-flagged.

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
- `scripts/sync-data.ts` size: 1306 → 3078 (2026-09-09) → 3360 (2026-09-12) → **3510** (2026-09-14,
  +150 from the speciesSplit integration). Flagged as a split option to data-sync three times now,
  never as a hard finding (internally well-organized every time). Re-check if it clears ~4000.
- `packages/engine/src/rosterPlanner.ts`: 2975 (2026-09-12) → **3409** (2026-09-14, +434, Best
  Buddy candidates) — within ~100 lines of the ~3500 re-check threshold set 2026-09-12. Check first
  on the next pass. `powerUp.ts` unchanged at 2329 lines this batch — same "well-organized despite
  size" verdict, not re-measured line-by-line this pass.
- The outgoing-damage-modifier object literal (`stab`/`typeEffectiveness`/`megaBoostMultiplier`/
  `weatherBoosted`/`friendshipLevel`) is hand-built at 12 call sites across the engine
  (`comparison.ts`/`teamRaid.ts`/`powerUp.ts`/`rosterPlanner.ts`/`rosterMoveChange.ts`) — IDEAS #25,
  deliberately parked 2026-09-12, site count re-confirmed unchanged at 12 on 2026-09-14. Real
  duplication, but three real bugs (2026-09-12) were exactly "one of these sites forgot a field its
  siblings had" — any future extraction proposal must keep outgoing/incoming as two structurally
  different function signatures (incoming has no `friendshipLevel` parameter at all), never one
  shared builder with an optional field. Don't propose a single unified builder. Only re-open the
  question if a future batch pushes the site count materially past 12 or opens most of those files
  for unrelated work.
- `combat.ts` frozen at 2 exports (`bossChargedMoveReadySeconds`, `DamageTrajectoryPoint`) since
  the 2026-09-11 opening-burst deletion — unchanged as of 2026-09-14 (not touched this batch). Low-
  priority fold-into-simulate.ts option, not a finding — re-check if it stays at 2 exports for
  another audit cycle or grows back.
- `PowerUpOptimizerView.tsx` extraction (`ef4256e`, 2026-09-14): 3792 → 1699 lines, into
  `powerUpOptimizerScenario.ts` (codec, 725 lines now), `powerUpOptimizerSentences.ts` (141 lines),
  `MultiRaidResultsSection.tsx` (1018 lines), `SingleRaidResultsSection.tsx` (884 lines). Swept for
  residue 2026-09-14, found none — see this pass's findings above. Don't re-sweep from scratch next
  time unless the file grows again; just diff against 1714 lines (its 2026-09-14 size).
