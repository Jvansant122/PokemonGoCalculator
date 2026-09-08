---
name: feature-power-up-optimizer-noise-floor
description: Wiring the Power-Up Optimizer's 20-seed noise floor (deltaExceedsNoise/noiseFloorTeamDps/iterations) into the ranked table, recommendation, and caveats after the engine landed it mid-session
metadata:
  type: project
---

Built 2026-09-08, same day as [[feature_power_up_optimizer_tab]]. The root cause this fixed: at
the tab's original 3 paired seeds, 78 of 202 default-roster candidates showed a negative Δ team
DPS purely from seed-to-seed jitter (baseline alone varied ±0.25 DPS across a single seed change)
— the ranked table was reading as noise, not signal. User-requested fix was two-pronged: raise
seed count, and add a noise floor so a delta inside it renders as "no measurable change" instead
of a signed number that implies false precision.

**The engine contract landed IN PARALLEL, mid-task, in two visible stages — polling for the
final shape mattered, not just the first grep hit.** `PowerUpCandidate.deltaExceedsNoise` and
`PowerUpOptimizerResult.iterations`/`noiseFloorTeamDps` appeared in the TYPE declarations (`grep
-q "noiseFloorTeamDps"` succeeded) roughly one poll cycle before the function BODY actually
computed and returned them — for a window the file would have failed `tsc` if built (interfaces
declared fields the implementation didn't yet set). Grepping only for the type declaration and
declaring victory would have raced a half-landed engine change. Fixed by making the poll condition
check for the actual `return { ..., iterations, ... }` statement content, not just the interface
member — and by re-reading the full function body once the loop reported success, not trusting
the loop's own boolean. This is the same "verify against the real file, not the memory of what
should be there" principle as the top-level agent instructions, applied to a moving target within
a single session.

**Sort semantics: three ordered groups, not a single comparator key.** Per the task's exact spec:
(1) `deltaExceedsNoise && deltaTeamDps > 0`, sorted by the chosen efficiency descending (nulls
still sink within this group — unchanged rule from before); (2) `!deltaExceedsNoise`, sorted by
`cost.stardust` ascending (cheapest first — "cost" read as stardust specifically, since it's the
one resource present on every step, unlike candy/XL which can be zero); (3)
`deltaExceedsNoise && deltaTeamDps < 0`, sorted "most negative last" which is DESCENDING by
`deltaTeamDps` value (comparator `b.deltaTeamDps - a.deltaTeamDps`) — worth double-checking the
sign here, since "most negative last" reads ambiguously as either direction until you fix a
concrete example (-0.1, -0.5, -1.0 should render in that order, which is numeric descending).
Implemented as a `group()` helper returning 0/1/2 then a nested comparator, not three separate
`.filter().sort()` calls concatenated — avoids rebuilding three arrays every render.

**`OPTIMIZER_ITERATIONS = 20` lives in `run/runPowerUpOptimizer.ts`, not as a `PowerUpOptimizerAssumptions`
field or `Scenario` field — deliberately, per the task's own framing.** A shared link should encode
WHAT was compared (roster, boss, dodge model, etc.), not how many seeds the tool happened to
average that particular run over; every viewer of a link should get a comparably-precise answer,
not one keyed to whoever built the link's chosen seed count. Confirmed via `check-scenario-roundtrip`
staying at exactly 17 fields for this tab (no new field added) — if a future request asks to
expose seed count as a user knob, that changes this call and needs the full
`add-scenario-assumption` checklist, but this task explicitly ruled it out.

**Perf at 20 seeds confirmed empirically, not just estimated from the 3-seed number linearly.**
Both new/existing `run.smoke.test.ts` cases for this tab ran in ~800ms each (full default
202-candidate sweep) — consistent with the task's own ~1.5s estimate (217ms measured at 3 seeds x
20/3), comfortably inside the 400ms debounce settling budget and the 30s test timeout. Didn't
need to raise any test timeout.

**Verification this session**: no browser tool available (Read/Write/Edit/Bash/Grep/Glob only,
same as every prior session in this project — see [[verification_without_browser_tool]]). Full
`npm run verify` from repo root green: engine 25 files/249 tests, web 11 files/67 tests (including
two new Power-Up Optimizer smoke assertions: `noiseFloorTeamDps > 0` and neither
`bestAffordableByDelta` nor `bestAffordableByStardustEfficiency` has `deltaExceedsNoise: false`),
scripts 9 files/132 tests, lint 0 errors/6 warnings (unchanged pre-existing count, none of mine),
`check-scenario-roundtrip` still 97 fields/6 tabs (17 for this tab, unchanged — no new Scenario
field), `check-raid-history-sources`/`check-mega-gates`/`check-docs-drift` all green, production
build succeeded (`vite build`, pre-existing >500kB chunk warning only). Also served the real
`dist/` via `vite preview`, curled root HTML (200) to find the actual hashed asset paths (note:
`vite preview`'s dev server does NOT apply the GitHub Pages `base` path the way the real deploy
does — asset URLs came back as `/assets/...` not `/PokemonGoCalculator/assets/...`, a
`site-builder`-owned config detail, not a bug I introduced), curled the JS/CSS bundles (200s),
`node --check`ed the bundle (syntactically valid), and grepped it for shipped literal strings
("Noise floor", "noise floor", "delays the roster", "≈0") — all found. Did NOT click through the
live-typing UX in a rendered browser (re-sorting into the new three-group order as a delta value
crosses the noise floor while typing) — same real gap as every prior tab-build session; flagging
per convention.
