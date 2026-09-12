# First run: 2026-09-06 — full audit (no prior memory existed)

Full audit of packages/engine/src, packages/web/src, scripts/. `npx tsc --noEmit` clean in both
packages (no unreachable-code hints). No TODO/FIXME/XXX anywhere in scanned scope.

## Reported

- `packages/engine/src/types.ts` `Combatant` interface — zero usages anywhere in the repo
  (declaration only). Dead export. Status: reported, awaiting engine-developer action.
- `packages/engine/src/energy.ts` `accumulateEnergy` + `EnergyEvent` + `energyFromFastMove` —
  zero call sites outside energy.ts/energy.test.ts; simulate.ts inlines its own stepwise energy
  math instead (uses `energyFromDamageTaken`/`MAX_ENERGY` directly, which ARE live — don't lump
  those two in). Status: reported.
- `packages/engine/src/combat.ts` `simulateOpeningBurst`/`AttackerProfile`/`BossProfile`/
  `OpeningBurstResult` and `packages/engine/src/comparison.ts` `runComparison`/`ComparisonInputs`/
  `CandidateResult` — the "Phase 1" opening-burst comparator, zero production callers. Kept alive
  only by tests (comparison.test.ts, scenarioA/B.test.ts, bossTiming.test.ts, simulate.test.ts),
  framed it as a deliberate acceptance-test harness for the core stats/damage/typeChart formula
  pipeline. **RESOLVED 2026-09-11 — deleted outright** at the user's instruction ("there is no
  opening salvo"): the whole cluster went, along with scenarioA/B.test.ts and the runComparison
  half of comparison.test.ts. `combat.ts` now exports only `bossChargedMoveReadySeconds` (live
  in production) and `DamageTrajectoryPoint`. Nothing left here to audit or re-flag.
- `packages/web/src/TeamDamageChart.tsx` and `packages/web/src/DamageOverTimeChart.tsx` —
  byte-for-byte-identical `niceStep()` (~7 lines) and `formatTick()` (~4 lines). Reported.
- Badge JSX duplication (`isHypothetical`/`isShadow` → `<span className="badge badge-...">`,
  ~2 lines each) at three call sites: ComparatorView.tsx (~514-515), SpeciesReportView.tsx
  (~549-550), TeamAssumptionPanel.tsx (~158-159). Reported.
- Share-link base-URL pattern `window.location.href.split("?")[0]!` repeated 3x (ComparatorView,
  TeamRaidView, SpeciesReportView). Reported as minor/low-priority.
- `packages/engine/src/uptime.ts` `findCrossoverPartySize`/`CrossoverPoint` — zero call sites in
  packages/web; `sensitivity.ts` independently reimplements a similar-but-not-identical scan.
  NOT a fresh finding — already surfaced by pogo-researcher and explicitly declined in a code
  comment at `packages/web/src/sensitivity.ts:190-197`. Do not treat as new next time unless that
  comment or `.claude/agent-memory/pogo-researcher/finding_crossover_party_size_unwired.md` is gone.
- `scripts/sync-data.ts` (1306 lines then; 3078 as of 2026-09-09) — oversized but internally
  organized into clear banner-commented sections. Flagged as an option (split into modules) for
  data-sync, not a hard finding. Still true 2026-09-09 (see that pass's file for update).
- `packages/web/src/IvBreakpointsView.tsx` — `IvBreakpointsView()` itself ~673 lines (343-1016).
  Oversized-function finding for web-developer. Not touched by the 2026-09-09 batch, not
  re-measured since.

## Excluded as standing decisions (checked, not flagged)

- Mega/primal boost `1.3` — only `DEFAULT_MEGA_BOOST_MULTIPLIER` + fixture literals. Not a target.
- Scenario-family types (now six) — not proposed for unification.
- `packages/engine/test/fixtures/hypotheticalDuo.ts` species — correctly not re-exported from
  `packages/engine/src/index.ts`; dead-export scan working as intended.
- `data/raw/`, `data/normalized/`, `scripts/sync-data.ts` — size/generation findings route to
  data-sync, not a plain cleanup target.
- Team Raid Simulator's lack of cross-slot team-boost math — confirmed intentional.

## File sizes as of 2026-09-06 (superseded by later passes where noted)

packages/engine: simulate.ts 523, teamRaid.ts 575, comparison.ts 466, speciesReport.ts 224,
breakpoints.ts 216, combat.ts 208, uptime.ts 182.
packages/web: IvBreakpointsView.tsx 1016 (function ~673), ComparatorView.tsx 741,
SpeciesReportView.tsx 614, TeamAssumptionPanel.tsx 508, AssumptionPanel.tsx 558,
DamageOverTimeChart.tsx 305, TeamRaidView.tsx 393.
scripts/sync-data.ts 1306.

Note: CLAUDE.md's tab/scenario count was stale at this point (predated IV Breakpoints as 4th
tab); resolved by 2026-09-09 (CLAUDE.md now lists six tabs). History only, no action needed.
