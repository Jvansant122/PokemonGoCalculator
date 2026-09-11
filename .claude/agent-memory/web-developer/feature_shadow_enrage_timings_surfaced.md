---
name: feature_shadow_enrage_timings_surfaced
description: Surfaced Shadow raid enrage/subdue timings (engine-computed 2026-09-10, unconsumed until now) in Comparator and Team Raid result cards; found a real engine bug in the per-slot re-detection, and a real Playwright browser-verification technique for finding live shadow raid bosses to test against.
metadata:
  type: project
---

IDEAS.md #17b (2026-09-11): `simulate.ts`'s `StepwiseRunResult.enragedAtSeconds`/`subduedAtSeconds`
and `teamRaid.ts`'s `TeamRaidSlotResult.enragedAtRaidSeconds`/`subduedAtRaidSeconds` had zero web
consumers despite shipping 2026-09-10. Added one `dt`/`dd` pair to each surface, gated on
non-null (absent/zero renders nothing — never a misleading "0.0s enrage" for a non-Shadow boss).

**The two clocks, confirmed by reading doc comments (do not guess this one):**
- `representativeRun.enragedAtSeconds`/`subduedAtSeconds` (Comparator, from `SustainedCandidateResult`
  via `runSustainedComparison`) — LOCAL to that one candidate's own single continuous fight (each
  candidate fights a FRESH boss, no cross-candidate carryover), same run/seed the chart already
  uses for `faintedAtSeconds`. Render directly, same "(this run)" honesty label as the existing
  `holdChargedMoveDodgeCostEvents` convention.
- `TeamRaidSlotResult.enragedAtRaidSeconds`/`subduedAtRaidSeconds` (Team Raid) — RAID-GLOBAL clock
  (`startClock + local seconds`), same clock as `timeToClearSeconds`/`startedAtRaidSeconds`. A
  multi-slot encounter's boss HP is one continuous pool, so the first non-null value across the
  flat chronological `slots` array IS the one real transition — added as a single summary line in
  the "Raid result" `dl`, not a per-row column (see bug below for why a per-row column would have
  been actively misleading).

**Real engine bug found (flagged to engine-developer, NOT fixed — out of scope per this task's
own instructions and CLAUDE.md's package ownership split):** `simulate.ts`'s per-run
`enragePhase` always initializes to `"normal"` regardless of `boss.enrage.damageDealtBeforeFight`.
Once the boss has genuinely enraged in an earlier team-raid slot, EVERY subsequent slot's fight
re-detects "normal -> enraged" at its own tick 0 (since that fight's carried-over HP is already
below 60%), producing a non-null `enragedAtRaidSeconds` on every following slot — directly
contradicting `TeamRaidSlotResult.enragedAtRaidSeconds`'s own doc comment ("null... if it may have
already happened in an earlier slot/cycle"). Verified live: against `sandslash-alola-shadow`
(3-star shadow, default team), `enragedAtRaidSeconds` was non-null on 14 of 14 fielded slots, only
the FIRST (20.1s) being the real transition. Subdue is accidentally unaffected — `"normal"` is
both the phase's initial default AND the true post-subdue state, so no phase mismatch fires on a
later fight's first tick. `.find()` picking the first non-null across the chronological `slots`
array sidesteps the bug for a correct headline (confirmed: 20.1s enrage / 143.7s subdue / 154.6s
clear, sane ordering) — this is WHY the summary-line design (not a per-slot table column) was
chosen; a raw per-row rendering would have shown the bogus repeats.

**Finding real live Shadow raid bosses to test against:** `data/normalized/activeRaids.json` rows
crossed against `species.json`'s `isShadow` flag — as of 2026-09-11:
`thundurus-incarnate-shadow` (5-star, 266/164/188, too tanky for the default team's fighting-heavy
moveset to enrage within the raid timer — fighting is resisted by its flying typing, a real
matchup trap worth remembering), `sandslash-alola-shadow` (3-star, ice/steel — SE against by the
default fighting-heavy team, reaches enrage+subdue+clear cleanly), `bagon-shadow`/`torchic-shadow`/
`machop-shadow`/`bellsprout-shadow` (1-star, 600 HP, any single strong Comparator candidate clears
past 60% quickly). A too-tanky/off-type boss silently produces an "always null" result that looks
identical to "wiring is broken" — check `data/normalized/species.json`'s `isShadow` AND a
type-effectiveness sanity check before picking a boss to test enrage against, not just "any active
Shadow raid."

**Playwright-as-browser-tool verification, one step further than prior sessions' technique:** built
scenario URLs directly via each tab's own `assumptionsToScenario`/`buildScenarioUrl` (Comparator)
and `assumptionsToTeamScenario`/`buildTeamScenarioUrl` (Team Raid) from a throwaway `tsx` script,
wrote them to a JSON file (avoids all bash heredoc quoting fights with a giant base64 query string
embedded in JS source — a plain `.mjs` reading `JSON.parse(fs.readFileSync(...))` sidesteps it
entirely), then drove `vite preview` + Playwright's `chromium.launch()` from Bash to read rendered
`innerText` off the real built app and screenshot both result cards. Confirmed zero console errors
on every page load. This is a faster and more reliable pattern than clicking through
`SpeciesPicker`/`MoveSelect` for a scenario that's easy to express as a `Scenario` object.

**Regression tests** added to `run/run.smoke.test.ts` (not a new file — this project's convention
is one shared smoke file per `run/` module) pin the exact live-verified numbers above with
`toBeCloseTo` (NOT `toBe` — `20.4 + swapCostSeconds` etc. accumulate float error across a
multi-slot raid-clock sum, `143.70000000000002 !== 143.7` under `Object.is`), plus sanity-order
assertions (enrage < faint/subdue < clear) and a "non-Shadow boss -> both null" case for each tab.

**Concurrent-session interference during `npm run verify`:** hit `test/rosterMoveChange.test.ts`
failing in `packages/engine` (unrelated to this feature) — confirmed via
`[[pattern_worktree_isolation_for_concurrent_session_verify]]`'s exact recipe (worktree at HEAD +
`npm install` + copy only my 3 changed files in) that it was a concurrent engine-developer
session's uncommitted in-flight state, not my change: the isolated worktree passed engine/web
tests, typecheck, lint (0 errors, 1 pre-existing warning), `check`, and build cleanly. Also found
`scripts/sync-data/test/diff.test.ts` failing with a `SyntaxError` on a `// @ts-expect-error`
comment — reproduced this SAME failure in the isolated worktree at the last COMMITTED `HEAD`
(`be6912c`) with zero uncommitted engine changes present, so it is a pre-existing, committed-state
break in `scripts/` (outside this task's `packages/web/src`-only scope) — not something I
introduced or should fix; flag if `scripts/` is ever in scope.
