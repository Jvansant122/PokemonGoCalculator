---
name: feature-energy-gated-interval-cadence
description: adding a third boss cadence value (energy-gated-interval) to the shared bossCadence.tsx re-export/select/hint, when the engine field lands first
metadata:
  type: project
---

Implemented Step 2 (web) of a 3-step plan (`groovy-stirring-pearl.md`) after engine-developer's
Step 1 landed `BossChargedMoveCadence = "fixed-interval" | "energy-driven" | "energy-gated-interval"`
as a real named export from `packages/engine/src/simulate.ts`.

**What changed:** `packages/web/src/bossCadence.tsx`'s local `export type BossChargedMoveCadence`
became a re-export of the engine's type (`import type { BossChargedMoveCadence } from
"@pogo-analyzer/engine"; export type { BossChargedMoveCadence };` — a bare
`export type { X } from "..."` does NOT bring `X` into local scope for use elsewhere in the same
file, so the two-line form was needed once other declarations in the file reference the type
name). Added the third `<option>` and one appended paragraph to `BOSS_CADENCE_HINT` (not a second
`<details>`/`<p>` — the plan allowed either, appending kept the existing sourced text intact and
was simpler). One clause added each to ComparatorView.tsx's and TeamRaidView.tsx's "Known caveats"
prose so neither implies energy-driven is the only alternative.

**Deliberately NOT touched, per the plan's own reasoning (verified, not just trusted):**
`BOSS_FREQUENCY_INAPPLICABLE_HINT` and every panel's `=== "energy-driven"` disable check — the
mean-frequency field is ACTIVE (reinterpreted as "mean delay after eligibility", not "mean
seconds between casts") under the new mode, so nothing needed disabling. `sensitivity.ts:425-436`'s
mean-interval sweep check also only special-cases `"energy-driven"` — confirmed by reading, no
edit needed, the sweep stays meaningful under the new mode.

**No new Scenario field** — the union widened but the field itself (`bossChargedMoveCadence`) was
already there since the first (energy-driven) cadence addition, so `add-scenario-assumption`
wasn't triggered and codecs are JSON pass-throughs. Test coverage: added one round-trip `it()` each
to the Comparator and TeamScenario `describe` blocks in `scenarioRoundtrip.test.ts` (clone
`nonDefault` with `bossChargedMoveCadence: "energy-gated-interval"`, same URL round-trip
assertions) rather than editing the existing energy-driven cases — both values now get explicit
coverage.

**Verification level this session:** no live browser tool was granted (Read/Write/Edit/Bash/Grep/
Glob only, despite a PostToolUse hint suggesting a `preview_start` browser tool might exist — it
wasn't in this session's actual tool list, so don't assume the hint means it's usable). Did:
`npm run test:web` (125 passed, +2 vs before), `npm run typecheck` (clean, all 3 tsconfigs),
`npm run lint` (clean on every file this task touched; the 2 errors that DID show up were in
`packages/engine/test/energyGatedIntervalBossCadence.test.ts`, Step 1's own uncommitted work in a
package this role never edits — reported, not fixed), `npm run check-scenario-roundtrip` (all 101
fields across 6 tabs), `npm run build --workspace=packages/web` (succeeds, same chunk-size
warning as always), `vite preview` + curl (200, HTML loads). Additionally built two real share
URLs (Comparator + Team) with `bossChargedMoveCadence: "energy-gated-interval"` via a scratch
script importing `assumptionsToScenario`/`buildScenarioUrl` directly, then fed them through
`npm run run-scenario --` (the same CLI `scripts/run-scenario.ts` and `run/run.smoke.test.ts`
use) — got real, non-crashing headline numbers back, proving the new value reaches the actual
simulator through the real UI codec path, not just that it round-trips syntactically.

**Gotcha reconfirmed:** a scratch script placed in the OS temp scratchpad directory can't resolve
bare specifiers like `@pogo-analyzer/engine` via `tsx` — module resolution roots off the script's
own location, not cwd. Had to write the throwaway script inside the repo root (deleted after) for
`npx tsx` to resolve workspace packages. See also `feature_run_module_extraction_and_cli.md` and
`feature_iv_sensitivity_checks.md` for the related "strip-types import ceiling" history — this is
a distinct resolution-root issue, not that one.

**Concurrent session confirmed, not touched:** `git status` mid-task showed
`packages/web/src/PowerUpOptimizerView.tsx` and a `roster-optimizer`/CSV-import feature branch of
files as modified/untracked — a different, concurrently-running session's work (matches this
project's stated pattern of parallel agent sessions in one working tree). Diffed my own edits
(`git diff --stat` on just the 4 files I touched) to confirm scope stayed exactly the plan's file
list before reporting done.
