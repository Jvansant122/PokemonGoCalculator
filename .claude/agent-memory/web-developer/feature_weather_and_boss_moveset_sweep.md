---
name: feature-weather-and-boss-moveset-sweep-ui
description: Wiring the weather Scenario field through the full add-scenario-assumption checklist, and building BossMovesetSweep.tsx for compareAcrossBossChargedMoves — which real fixtures/species actually exercise the 2+-charged-move path
metadata:
  type: project
---

Implemented 2026-09-05, the web half of engine-developer's
`feature_weather_and_boss_moveset_sweep.md` (engine side already done and
tested — this session touched packages/web only).

**Weather**: full `add-scenario-assumption` checklist completed — `Assumptions.weather`
(`AssumptionPanel.tsx`), `DEFAULT_ASSUMPTIONS.weather = "none"`,
`assumptionsToScenario`/`scenarioToAssumptions` (with `s.weather ?? "none"` on
decode), a `<select>` control (8 options, human-readable labels naming which
types each condition boosts), and threaded into both
`runSustainedComparison` (`App.tsx`) and `computeSensitivity`'s `runSustained`
helper (`sensitivity.ts`) so existing sensitivity checks stop silently ignoring
the configured weather. See [[gap-weather-not-reexported]] for the real
blocker hit doing this (`WeatherCondition`/`WEATHER_BOOSTED_TYPES` aren't
re-exported from the engine's index.ts) and the type-derivation workaround used
instead of touching packages/engine.

**Boss moveset sweep**: new `BossMovesetSweep.tsx`, rendered from a new
`bossMovesetSweep` memo in `App.tsx` that calls `compareAcrossBossChargedMoves`
— gated on `species.boss.chargedMoves.length >= 2` (memo returns `null`
otherwise), so a single-charged-move boss renders nothing, not a pointless
one-row table. Winner-per-row uses the same "own total damage + attributable
team damage over a shared fight-length window" math as `sensitivity.ts`'s
`winnerOf` (own damage alone would contradict the project's core "survivability
counted as team DPS" thesis) — this is a real duplicate of that formula
(`convertUptimeToTeamDamage` called with `fightDurationSeconds =
Math.max(a.meanSecondsSurvived, b.meanSecondsSurvived)`), not a re-import,
since `sensitivity.ts`'s `winnerOf` takes `SensitivityCandidate`-shaped inputs
private to that file rather than a reusable exported helper — a future
refactor could extract a shared `computeOwnPlusTeam`/`winnerOf` used by both
`sensitivity.ts` and `BossMovesetSweep.tsx` if a third call site ever needs the
same math.

**Which selectable species actually exercise the 2+-charged-move gate**: BOTH
of this project's own hypothetical boss fixtures (`PRIMAL_KYOGRE`,
`MEGA_SKARMORY`, defined in `packages/engine/src/fixtures/scenarioA.ts`) have
exactly ONE charged move each — so the sweep table never renders against the
pinned default Scenario A/B setups, which is correct behavior (nothing to
sweep), not a bug. To see the sweep live, pick a REAL synced species as the
target instead — checked `data/normalized/species.json` directly (1079
species, 1025 of them have 2+ charged moves; e.g. `venusaur` has 5) — any
non-hypothetical target picked via the raid-target search box will trigger it
essentially every time.

**Verification this session**: no browser-preview tool available (confirmed
against the actual tool grant, matching [[verification-without-browser-tool]]'s
warning that the hook's "Browser pane" mention is generic boilerplate). Ran
the full ladder: `tsc --noEmit` clean, `vite build` succeeded (only the
pre-existing chunk-size warning), `npm run test:engine` 14 files/82 tests green
(confirms zero accidental engine edits), `vite preview` served + curled root
and both built asset paths for 200s, `node --check` on the downloaded JS
bundle for syntax validity, and grepped the built bundle for several
distinctive new strings (`"Sunny/Clear"`, `"Boss charged move"`, `"depends on
which charged move this"`, `"wins regardless of which charged move"`) as
evidence the new code actually shipped in the production bundle — this proves
shipping, not runtime correctness. For the actual round-trip proof, used the
scratch-script technique ([[verification-without-browser-tool]]): copied a
throwaway `.mts` file into `packages/engine/src/` (relative import required,
per that memory's Node ESM note), built a full `Scenario` object with
`weather: "sunny"`, ran it through the real `buildScenarioUrl`/
`parseScenarioFromUrl`, confirmed `decoded.weather === "sunny"`, then deleted
the scratch file and confirmed via `git status` that packages/engine still
only shows engine-developer's own pre-existing uncommitted changes (nothing
from this session).
