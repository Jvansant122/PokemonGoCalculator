---
name: bugfix_tie_leader_and_dodge_lockout_surfaced
description: Fixed two >= tie-declares-a-fake-leader bugs (rankingFlip.ts, DodgeExecutionErrorBand.tsx) found via a live 0-0-tie repro, and surfaced the previously-invisible fastMoveCadenceTooFastToDodge/dodgeFastAttacksLockout engine flags at the toggle + on zeroed result cards across Comparator/Team Raid/Species Report
metadata:
  type: project
---

Two related fixes approved off a pogo-researcher + pogo-player pass, both real, both live-verified.

**Bug 1 — `>=` silently names a leader on an exact tie.** `rankingFlip.ts`'s `computeRankingFlip`
had `finalLeader = crossingLeader ?? (totals[last].x >= totals[last].y ? x.name : y.name)` — a 0-0
tie (or any exact tie) falls into `>=` and wrongly names x the leader. Same bug, independently
present, in `DodgeExecutionErrorBand.tsx`'s `leaderAt` (`p.a.meanTotalDamage >= p.b.meanTotalDamage
? "a" : "b"`) — found by explicitly checking it per the task's instruction ("check for the same bug
class"), and it was real. Fixed both to a genuine three-state result: `finalLeader: string | null`
(rankingFlip) / `"a" | "b" | "tie"` (DodgeExecutionErrorBand), plus a `finalTieIsBothZero` flag so
"both dealt zero damage" (usually a config problem) reads differently from a genuine nonzero tie.
Matched the existing "tied" convention already used by `BossMovesetSweep.tsx`'s `winnerIndex: 0 | 1
| null` rather than inventing a fourth tie-representation in the same codebase.

**Extracted `DodgeExecutionErrorBand`'s leader/tie logic into `dodgeExecutionErrorLeader.ts`**
(`computeDodgeExecutionErrorLeader`) purely to get real unit-test coverage on the fix — this
project has NO React-component-rendering test precedent anywhere (grepped, zero `render(` calls
outside `main.tsx`), so a rendering component's own inline logic is otherwise untestable by this
codebase's actual conventions. Mirrors `rankingFlip.ts` itself, which was extracted from
`DamageOverTimeChart.tsx` for the exact same reason (AUDIT_2026-09-08.md finding 0).

**Bug 2 (a gap, not a bug) — the engine's `fastMoveCadenceTooFastToDodge`/`dodgeFastAttacksLockout`
had ZERO web consumers**, despite the engine's own doc comment on
`fastMoveCadenceTooFastToDodge` explicitly saying it's "usable for a live warning on the toggle
itself," and MECHANICS.md's dated entry ("A boss fast move at ≤0.5s cannot be fast-dodged at all —
and that is arithmetic, not a bug") already documenting the mechanic. Surfaced in two places on
three tabs (Comparator, Team Raid, Species Report — the three with the shared "Also dodge boss's
fast attacks?" toggle):

1. **At the toggle itself**, keyed off the boss's fast move ALONE (`dodgeFastAttackLockout.ts`'s
   `dodgeFastAttackLockoutWarning`) — deliberately shown regardless of the toggle's OWN current
   value, so the risk is visible the moment a qualifying boss is selected, before the toggle is
   even switched on. Reused `.species-picker-warning` (the existing `--warn`-colored class already
   used by `SpeciesPicker`'s unknown-species-id warning and `BossSetPanel`'s empty-set warning) —
   no new visual language invented. Comparator also warns inside its per-candidate dodge-override
   block (`CandidateDodgeOverride`), since that has its own independent fast-attack-dodge select.
2. **Inline on the result card itself**, gated on the engine's own already-computed
   `dodgeFastAttacksLockout` flag (`SustainedCandidateResult`/`TeamRaidSlotResult` both carry it —
   it already extends `DistributionSummary`) via a second function,
   `dodgeFastAttackLockoutResultNote` (past-tense "Dodge lockout active: ..." phrasing vs. the
   toggle's forward-looking "Turning X on results in..."). Team Raid aggregates across slots
   (`N of M fights this encounter (species names)`) since the toggle is shared across the whole
   roster, not per-slot.

**Species Report is the interesting case** — it sweeps ~600 possible bosses with ONE shared
toggle, so neither "the boss" (singular) nor a per-row rendering fits cleanly. Judgment call made
(documented per the task's explicit ask): the toggle-level warning computes a LIVE count of how
many of the *currently tier/past-raid-filtered* bosses qualify — cheap, no-simulation-needed, pure
per-species arithmetic (`fastMoveCadenceTooFastToDodge` against each boss's own FIRST fast move,
since Species Report always fights each boss with its first fast/charged move only — see its own
"Boss movesets" caveat), so it updates instantly like `allTiersPresent` does, not gated behind the
debounced sweep. The result-side treatment is a **badge column flag** (new `.badge-dodge-lockout`,
reusing `.badge-approximate`/`.badge-unsourced`'s exact warn hue under its own name/comment — same
precedent as those two, which also independently reused the same hue for a different specific
fact) read straight off `row.sustained.dodgeFastAttacksLockout` (already engine-computed, no
re-derivation needed), PLUS a footnote below the table counting affected rows out of the total, and
one added sentence in the pre-existing "Data quality flags" caveat details block (already
documents "approximate"/"fallback" — a third flag belongs in the same place). Also added the ≤0.5s
case as its own sentence in Comparator's "Known caveats → Simulation, damage tracking & mega/primal
mechanics" details block, which already covers this class of mechanic and never mentioned it.

**Verification actually performed — real browser, not just tests.** A `vite preview` (port 4173)
was already available from `npm run verify`'s own build step; drove it with Playwright
(`chromium.launch()`) exactly per [[feature_shadow_enrage_timings_surfaced]]'s technique: built
real scenario URLs via each tab's own `assumptionsToScenario`/`buildScenarioUrl` (Comparator),
`assumptionsToTeamScenario`/`buildTeamScenarioUrl` (Team Raid), and
`assumptionsToScenario`/`buildSpeciesReportScenarioUrl` (Species Report — note this one's
`buildSpeciesReportScenarioUrl` lives in `speciesReportScenario.ts`, NOT `@pogo-analyzer/engine`,
unlike the other two) against Mega Tyranitar + `BITE_FAST` (real 0.5s-duration move) +
`dodgeFastAttacks: true`, from a throwaway `packages/web/src/_scratch_*.ts` (per
[[feature_energy_gated_interval_cadence]]'s "scratch scripts must live inside the repo" — a
`.mjs` outside the repo can't resolve `playwright` from the repo's own `node_modules`), read
`innerText()` after expanding every `<details>`. Confirmed on ALL THREE tabs: zero console errors,
the toggle warning text present (Comparator's read live count correctly, e.g. Species Report
reported "9 of the currently-selected bosses" and rendered exactly 9 `.badge-dodge-lockout`
elements and a matching "9 of 17 rows" footnote), the result-card note present, and — the actual
headline bug — Comparator's chart caption read "Neither candidate dealt any own+team damage in
this window under these assumptions" instead of the pre-fix "Kartana leads throughout," and
DodgeExecutionErrorBand's own caption read the equivalent both-zero sentence instead of naming a
fake leader. **Gotcha hit while doing this**: `CollapsibleSection` ids are NOT DOM ids (rediscovered
from [[feature_species_report_type_rank_readability]]/[[feature_known_caveats_subdisclosures]]'s
prior notes) — an `#comparator-assumptions` Playwright locator silently matches nothing, so the
detailed-assumptions `<details>` never actually expanded and the toggle warning read as "not
found" on the first attempt purely because collapsed `<details>` content is excluded from
`innerText()`; fixed by locating `summary` elements by their visible text instead.

Also ran `npm run test:web` (358 passed, including new
`rankingFlip.test.ts`/`dodgeExecutionErrorLeader.test.ts`/`dodgeFastAttackLockout.test.ts` cases),
`npm run typecheck`, `npm run lint` (clean), `npm run test:e2e` (27 passed, unaffected — the new UI
is conditional and doesn't fire on any tab's default scenario), and `npm run verify` end to end.

No `Scenario` field was added anywhere — both fixes read an already-computed engine flag or call
an already-exported pure engine predicate; `check-scenario-roundtrip` was correctly untouched.
