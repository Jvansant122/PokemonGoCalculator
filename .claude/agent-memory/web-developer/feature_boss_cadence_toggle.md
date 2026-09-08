---
name: feature_boss_cadence_toggle
description: Wiring bossChargedMoveCadence (fixed-interval vs energy-driven) into the 3 simulating tabs — the extension-type pattern applies even after the engine field lands, and a live parallel-agent engine edit produced a transient unrelated tsc error mid-task
metadata:
  type: project
---

2026-09-08: added a "Boss charged-move cadence model" toggle (fixed-interval
default / energy-driven experimental) to the three tabs that actually
simulate a boss over time — Comparator, Team Raid, Species Report. IV
Breakpoints and Attack/Defense Breakpoints correctly excluded (no simulator
call site at all — per-hit/per-level math only).

**The extension-type pattern is still correct even once the engine field
exists.** I assumed `Scenario`/`TeamScenario` (engine-owned types) would need
the field added by the parallel engine-developer agent, same as
`SustainedComparisonInputs`/`TeamRaidInputs`/`SpeciesReportInputs`. They
didn't — the engine agent added the field ONLY to the three `*Inputs`
interfaces (the pinned contract), not to `Scenario`/`TeamScenario` themselves.
So the existing `ComparatorScenario extends Scenario`/`TeamScenarioWithShadow`
local-extension trick (already used for `candidateShadow`/`isShadow`,
justified by `encodeScenario`/`decodeScenario` being pure
`JSON.stringify`/`parse` pass-throughs with no field allow-list) was still the
right call for the Comparator and Team Raid tabs, not a workaround to later
delete. `speciesReportScenario.ts` needed no such trick since it already lives
entirely in `packages/web`. Confirmed empirically with a scratch script
(`buildScenarioUrl`/`parseScenarioFromUrl` round-tripping a value not declared
on the base `Scenario` type) rather than assumed.

**A shared prose module was the right call here, against this project's usual
"duplicate small self-contained constants across tabs" precedent
(`WEATHER_LABELS`/`WEATHER_OPTIONS`).** The cadence explanation is a hand-typed
factual claim about sourcing/magnitude (which parts are independently
corroborated vs. single-sourced vs. this project's own unvalidated
measurement) — copying that paragraph three times risks exactly the kind of
silent drift `MECHANICS.md` exists to prevent if only one copy ever gets
corrected. Made `bossCadence.tsx` (a real shared component +
constants), imported by all three panels, unlike a label lookup table with
nothing substantive to get wrong.

**Live parallel-agent engine edits can produce a transient, unrelated tsc
failure mid-task — don't assume it's yours.** `npx tsc --noEmit` briefly
failed on `packages/engine/src/teamRaid.ts` for a missing
`bossChargedHitsTaken` property, in a file I have never touched and am not
permitted to touch. `git status` on `packages/engine` showed the
engine-developer agent's own in-flight edit; re-running tsc a few minutes
later (after their edit completed) passed clean with zero changes from me.
Lesson: when a `packages/web`-only agent hits a `packages/engine` compile
error, check `git status`/diff on the engine files first — it may be a
concurrent session's transient state, not a real blocker, and definitely not
something to "fix" by touching `packages/engine`.

**Verifying an engine-call wiring change without a browser tool**: beyond the
usual build/typecheck/roundtrip-script ladder (see
[[verification_without_browser_tool]]), for this task I additionally wrote a
throwaway root-level `.mjs` script (via `tsx`, deleted after) that imported
`SpeciesRegistry`/`runSustainedComparison` straight from
`packages/engine/src/index.ts` and `data/normalized/species.json`, called it
twice with `bossChargedMoveCadence: "fixed-interval"` vs `"energy-driven"`
using the SAME shape ComparatorView.tsx's actual call site uses, and diffed
mean survival. This is strictly stronger evidence than trusting tsc alone
that the wiring reaches the engine and changes real numbers (confirmed: real
Kartana/Rayquaza vs. Mega Latios dropped 48%/25% survival under
energy-driven) — worth doing whenever a call-site wiring change is the
actual risk, not just a type/scenario-shape change. `SpeciesRegistry`'s
constructor takes no args; species must be `.register()`-ed in a loop, not
passed to the constructor (that's how `packages/web/src/registry.ts` builds
it) — my first attempt at this script guessed wrong and threw "Unknown
species id."

Also confirmed via `curl` against the already-running dev server (port 5173)
that every touched file serves 200 through Vite's transform pipeline (a
compile error would 500 with an overlay) — a reasonable substitute for a
click-through when no browser tool is available, though it doesn't confirm
the control's on-screen behavior, only that nothing crashes.
