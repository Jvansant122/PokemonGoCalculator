---
name: code-simplifier-memory
description: Findings from prior bloat/dead-code audits of packages/engine, packages/web, scripts — what was reported, what was excluded as a standing decision, and file/function sizes worth re-checking next pass.
metadata:
  type: project
---

## First run: 2026-09-06

No prior memory existed before this pass (directory didn't exist). Full audit of
packages/engine/src, packages/web/src, scripts/. `npx tsc --noEmit` clean in both packages
(no unreachable-code hints). No TODO/FIXME/XXX anywhere in scanned scope.

### Reported this pass (see full findings in the session's report to the overseer)

- `packages/engine/src/types.ts` `Combatant` interface — zero usages anywhere in the repo
  (declaration only). Dead export. **Status: reported, awaiting engine-developer action.**
- `packages/engine/src/energy.ts` `accumulateEnergy` + `EnergyEvent` + `energyFromFastMove` —
  zero call sites outside energy.ts/energy.test.ts; simulate.ts inlines its own stepwise energy
  math instead (uses `energyFromDamageTaken`/`MAX_ENERGY` directly, which ARE live — don't lump
  those two in). **Status: reported.**
- `packages/engine/src/combat.ts` `simulateOpeningBurst`/`AttackerProfile`/`BossProfile`/
  `OpeningBurstResult` and `packages/engine/src/comparison.ts` `runComparison`/`ComparisonInputs`/
  `CandidateResult` — the "Phase 1" opening-burst comparator, zero production callers (web only
  ever calls `runSustainedComparison`/`compareAcrossBossChargedMoves`/`simulateStepwiseBattle`).
  Kept alive only by tests (comparison.test.ts, scenarioA/B.test.ts, bossTiming.test.ts,
  simulate.test.ts), which frame it as a deliberate acceptance-test harness for the core
  stats/damage/typeChart formula pipeline, independent of the sustained/stepwise engine.
  **Flagged with caution, not a clean dead-code call** — plausibly intentional regression-pin
  infrastructure adjacent to the "no user-selectable combat phase" standing decision (this WAS
  that removed phase-picker's other half). Needs an explicit call: keep as permanent acceptance
  harness (document that explicitly) or fold the acceptance pinning into runSustainedComparison
  and retire Phase 1. **Do not re-flag as a plain dead-code finding next pass** — it's already
  been surfaced with full context once.
- `packages/web/src/TeamDamageChart.tsx` and `packages/web/src/DamageOverTimeChart.tsx` —
  byte-for-byte-identical `niceStep()` (~7 lines) and `formatTick()` (~4 lines) axis-tick-formatting
  helpers, both single-package (web), no cross-package boundary issue. Clean duplication finding.
  **Status: reported.**
- Badge JSX duplication (`isHypothetical`/`isShadow` → `<span className="badge badge-...">`,
  ~2 lines each) at three call sites: `ComparatorView.tsx` (~514-515), `SpeciesReportView.tsx`
  (~549-550), `TeamAssumptionPanel.tsx` (~158-159). Genuine 3-site duplication, small but real.
  **Status: reported.**
- Share-link base-URL pattern `window.location.href.split("?")[0]!` repeated 3x (ComparatorView,
  TeamRaidView, SpeciesReportView) feeding into each view's own `build*ScenarioUrl`. Small (1-line)
  duplication, low value to extract given each view's scenario type is deliberately separate.
  **Status: reported as minor/low-priority.**
- `packages/engine/src/uptime.ts` `findCrossoverPartySize`/`CrossoverPoint` — zero call sites in
  packages/web; `sensitivity.ts` independently reimplements a similar-but-not-identical party-size
  scan. **This is NOT a fresh finding** — already surfaced by pogo-researcher
  (`.claude/agent-memory/pogo-researcher/finding_crossover_party_size_unwired.md`) and explicitly
  declined in a code comment at `packages/web/src/sensitivity.ts:190-197` (different flip-anchoring
  semantics between the two). Re-reported for visibility only, tagged as already-investigated —
  **do not treat as new duplication next pass unless the sensitivity.ts comment or the memory file
  is gone.**
- `scripts/sync-data.ts` (1306 lines) — oversized for a single file; internally organized into
  clear banner-commented sections (fetch/cache, normalize, mega/primal naming, shadow variants,
  diffing, main). Not obviously bloated/duplicated within, just large. Flagged as an option
  (split into modules) for data-sync to consider, not a hard finding.
- `packages/web/src/IvBreakpointsView.tsx` — the exported `IvBreakpointsView()` function itself is
  ~673 lines (343-1016) even though the file's helper functions above it are reasonably decomposed.
  Oversized-function finding for web-developer to consider splitting render sections into
  subcomponents.

### Excluded as standing decisions (checked, not flagged)

- Mega/primal boost `1.3` — only appears as `DEFAULT_MEGA_BOOST_MULTIPLIER` (uptime.ts) and as
  necessary per-fixture literal boost values in test files. Not a magic-number target.
- Three (now four — see note below) scenario-family types — not proposed for unification.
- `packages/engine/test/fixtures/hypotheticalDuo.ts` species — correctly not re-exported from
  `packages/engine/src/index.ts`; confirmed via the dead-export scan working as intended, not
  flagged.
- `data/raw/`, `data/normalized/`, `scripts/sync-data.ts` — size/generation findings route to
  data-sync per CLAUDE.md, not treated as a plain cleanup target.
- Team Raid Simulator's lack of cross-slot team-boost math — confirmed intentional (own-party
  boost doesn't apply), not flagged as a gap.

### Note for the overseer (not a code-bloat finding, a doc-freshness one)

CLAUDE.md's "Repo layout" section and "three scenario types" standing decision both predate a
4th tab: **IV Breakpoints** (`App.tsx`'s `AppTab` is `"comparator" | "team-raid" |
"species-report" | "iv-breakpoints"`, its own `IvBreakpointsScenario` type and `ivc` query param,
per `packages/web/src/ivBreakpointsScenario.ts` and `App.tsx`'s own comment listing all four
params: `s`/`ts`/`sr`/`ivc`). This doesn't change anything about this agent's findings (the
4th scenario type follows the exact same encode/decode pattern as the other three, so no fresh
duplication concern), but CLAUDE.md itself is stale on tab/scenario count — worth a note to
meta-architect/overseer, out of this agent's own remit to fix.

### File sizes worth re-checking next pass rather than re-measuring from scratch (as of 2026-09-06)

packages/engine: simulate.ts 523, teamRaid.ts 575, comparison.ts 466, speciesReport.ts 224,
breakpoints.ts 216, combat.ts 208, uptime.ts 182 — none currently flagged as oversized beyond
comparison.ts/combat.ts's dead-cluster note above.
packages/web: IvBreakpointsView.tsx 1016 (function itself ~673 lines), ComparatorView.tsx 741,
SpeciesReportView.tsx 614, TeamAssumptionPanel.tsx 508, AssumptionPanel.tsx 558,
DamageOverTimeChart.tsx 305, TeamRaidView.tsx 393.
scripts/sync-data.ts 1306.
