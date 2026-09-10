---
name: feature_team_scenario_per_slot_override
description: TeamScenarioSlot.level/.ivs optional per-slot overrides added to teamScenario.ts (2026-09-10) — shape, independence choice, why check-scenario-roundtrip's 115 didn't move, and the encoded-size measurement
metadata:
  type: project
---

Added optional `level?: number` and `ivs?: IVSpread` to `TeamScenarioSlot`
(`packages/engine/src/teamScenario.ts`). Motivated by a measured, reproduced
divergence: the "send post-plan roster to Team Raid Simulator" export (built
concurrently by web-developer) had to average per-slot Power-Up Optimizer
levels into `TeamScenario`'s one shared `level`, which understated a
powered-up roster's real clear time by ~40% on a real case (post-plan levels
36.5/30/40/38/37.5/25 averaged to 34.5; true per-slot sim cleared in 89.8s,
averaged sim took 125.7s).

**Independent, not paired** — `level` and `ivs` override separately, same as
the underlying `TeamRaidSlotInput.level`/`.ivs` (which already existed,
already consumed by `runTeamRaid`, built earlier for the Power-Up Optimizer's
mixed-level rosters — this change closes the gap only in the
round-trippable `TeamScenario` shape, not in the simulator). Chose
independent because pairing them would force a caller correcting only a
hand-copied level to also restate IVs it may not know, for no mechanical
reason — and the engine layer underneath already treats them independently,
so a paired restriction here would be an invented, inconsistent restriction.

**Why `npm run check-scenario-roundtrip`'s count (115) didn't change**: that
script only scans TOP-LEVEL fields of each tab's `Assumptions` interface
(`TeamAssumptions.slots: TeamSlotAssumption[]` is already one field; it can't
see fields nested inside array-element types — this is explicitly listed as
a "deliberate limitation" in the script's own header comment, not a gap I
introduced). Adding fields inside `TeamScenarioSlot`/`TeamSlotAssumption`
never moves this number regardless of how many nested fields exist. Don't
be surprised if a future nested-field addition anywhere (any `XSlot`/array-
element type) also leaves this number unchanged — that's correct, not a
missed wiring.

**Encoded-size measurement** (scratch script, not guessed): a realistic
6-slot `TeamScenario` with 2 filled slots baseline encodes to ~1323 base64url
chars; the SAME scenario with every one of 6 slots given its own
`level`+`ivs` override encodes to ~1802 chars — a ~479-char (~36%) increase,
still comfortably under the conservative ~2048-char URL safety margin this
project already treats as a soft ceiling. Concluded this is NOT a "keep it
out of the URL" case like the Power-Up Optimizer's ~16KB roster pool — two
orders of magnitude smaller. Full numbers in `teamScenario.test.ts`'s
neighboring PR/commit if re-deriving.

**Existing-link safety**: `JSON.stringify` omits `undefined` fields
entirely, so an existing encoded `TeamScenario` (no `level`/`ivs` on any
slot) round-trips byte-for-byte identically — verified with an explicit
regression test asserting `not.toHaveProperty("level"/"ivs")` on decode, not
just `toEqual` (which would pass even if I'd accidentally serialized
`undefined` as `null`).

**Threading through `runTeamRaid` without touching packages/web**: I could
not add a `TeamScenario -> TeamRaidInputs` converter inside `packages/engine`
because that conversion needs `speciesId -> SpeciesDefinition` resolution via
a registry, which is web-owned I/O. Instead, wrote an engine-only test
(`teamScenario.test.ts`'s "resolves into TeamRaidSlotInput" describe block)
that applies the exact `slot.level ?? scenario.level` fallback rule a real
caller (web's `runTeamRaidScenario`) would apply, then feeds the result into
`runTeamRaid` directly, and asserts the override changes the actual outcome
(shared-level roster times out; the identical slot resolved at its own
override clears). This proves the override reaches the simulator's own stat
computation without needing to touch or duplicate web's conversion code.
Boss HP for that fixture (2100) was tuned via a real scratch script sweep
(`npx tsx` against `runTeamRaid` directly), not hand arithmetic — see
`verification_without_browser_tool.md` technique in web-developer's memory
for the general pattern; same discipline applies here.

Full suite after: `npm run verify` (444 engine + all web/scripts tests) and
`npm run test:e2e` (18 specs, unchanged) both green — confirms the
concurrent web-side "Send to Team Raid Simulator" work already exists and
was unaffected by this purely-additive engine change.
