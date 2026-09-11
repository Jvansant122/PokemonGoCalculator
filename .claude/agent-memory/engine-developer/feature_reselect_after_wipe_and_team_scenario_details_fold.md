---
name: feature-reselect-after-wipe-and-team-scenario-details-fold
description: teamRaid.ts's reselectAfterWipe hook (IDEAS #12) and TeamScenario.showDetailedAssumptions fold (IDEAS #16), both 2026-09-10, plus the concurrent-lane signature-pinning collateral they caused in a file I don't own
metadata:
  type: project
---

Built as Lane C of three concurrent engine lanes (Lane A: powerUp.ts/rosterPlanner.ts, Lane B:
simulate.ts) in one worktree, 2026-09-10. Both features scoped to `teamRaid.ts`/`teamScenario.ts`
only, per explicit file-ownership boundaries for the session.

## IDEAS #12 — reselectAfterWipe

Added `TeamRaidInputs.reselectAfterWipe?: TeamRaidReselector` (`(context: TeamRaidReselectContext)
=> TeamRaidSlotInput[]`), called once per completed wipe (after `reviveCostSeconds` is paid, before
the next cycle's first slot). Context reports `cycleIndex`/`wipeCount`/`previousSlots`/
`bossDamageDealt`/`bossMaxHp`/`raidClockSeconds`/`raidTimerSeconds`. The returned roster is
re-validated with the same `validateRoster` the initial `slots` gets (throws on empty or >1 `isMega`).
Omitted, behavior is byte-identical to before — `currentSlots` just never changes across cycles.

**Deliberately no selection heuristic in the engine.** This module has no I/O and doesn't own a
roster pool (`packages/web`'s `rosterPool.ts` does, ~200 entries — the point of the feature only
shows up at that scale). The engine's job ends at exposing the hook; `web-developer` writes the
actual "best remaining 6" strategy as a plain closure over its own pool.

**Identity problem this surfaced**: `TeamRaidSlotResult.slotIndex` used to be a reliable
cross-cycle identity (same array every cycle → "slot 2" always meant the same configured Pokémon).
Once a DIFFERENT roster can be fielded per cycle, that breaks. Fixed by adding
`TeamRaidSlotInput.slotId?: string` (caller-supplied, e.g. a roster-pool entry id) and
`TeamRaidSlotResult.slotId: string` (falls back to `String(slotIndex)` when unset — byte-identical
dedup behavior for every caller not using the hook). `TeamRaidResult.slotsUsed` now counts distinct
`slotId`, not `slotIndex`. **Caveat proven by an actual test**: if a caller uses
`reselectAfterWipe` but never sets `slotId`, two fights at the same array position in different
cycles alias to the SAME `slotId` (both "0") even if they're different species — `slotsUsed`
undercounts in that case. This is documented as the tradeoff of skipping `slotId`, not a bug.

**Verified with a throwaway `npx tsx` scratch script before pinning any test number** (per this
package's own discipline) — real numbers: a boss (150/100/100 HP) that a 2×`FRAGILE` roster can
never clear within a 40s timer (times out after 6 wipes, 24 total damage dealt) clears in exactly
1 wipe + 1 reselected `HARD_HITTER` fight (4 + 96 = 100) once `reselectAfterWipe` swaps rosters.
Context fields (`bossDamageDealt: 4`, `raidClockSeconds: 7` = 2×1s FRAGILE fights + 5s revive,
`cycleIndex: 1`, `wipeCount: 1`) all confirmed against the real run, not derived by hand.

**Windows/tsx gotcha hit while building the scratch script**: an absolute Windows path
(`C:/Users/...`) as an import specifier throws `ERR_UNSUPPORTED_ESM_URL_SCHEME` under `tsx` on
Node 24 — must be a relative import from the script's own location (or a `file://` URL), not a
bare drive-letter path. Wasted two failed attempts before switching to a relative import from a
script placed at the repo root.

## IDEAS #16 — TeamScenario.showDetailedAssumptions

Folded the concept from `packages/web`'s `TeamScenarioWithShadow`-only bolt-on (flagged as an open
gap in [[feature_scenario_show_detailed_assumptions]]) onto the real engine `TeamScenario`:
`showDetailedAssumptions: boolean`, REQUIRED (matching `Scenario`'s own established convention),
plain `false` default on both directions — explicitly NOT the Comparator sibling's inverted
"absent decodes true" pattern, per CLAUDE.md's 2026-09-10 standing decision that backward link
compatibility no longer needs preserving and that inverted-default trick should not be
reintroduced elsewhere. There was also no previously-shipped link with this field on the ENGINE
type at all (it only ever existed as a web bolt-on), so there was no history to preserve either way
— a completely clean case for the plain default, unlike the Comparator's own field.

**Web follow-up needed** (not done here, out of my file ownership): `TeamRaidView.tsx`'s
`TeamScenarioWithShadow extends Omit<TeamScenario, "slots">` currently redeclares its own local
`showDetailedAssumptions?: boolean` — that local field should be deleted so it inherits the real,
required one. `assumptionsToTeamScenario`/`teamScenarioToAssumptions` keep working structurally
(assigning/reading a `boolean`) but should stop treating it as optional; keeping a defensive
`?? false` fallback in the decode direction is still correct (recommended, even) since
`decodeTeamScenario` does zero runtime validation regardless of the compile-time-required type —
same precedent as the Comparator's own `s.showDetailedAssumptions ?? DEFAULT_ASSUMPTIONS...`.

## Concurrent-lane collateral — a real, not-mine test breakage from a legitimate field addition

Adding `TeamRaidSlotResult.slotId` broke a **field-list signature-pinning test in
`rosterPlanner.test.ts`** (Lane A's file, not mine) — it asserts the exact key list of
`TeamRaidSlotResult`/`SustainedCandidateResult` that `rosterPlanner.ts` is allowed to consume, by
design (`§3.5`), so ANY new field on a type it pins requires updating that pin. I did not edit
`rosterPlanner.test.ts` (out of my ownership) — flagged it explicitly in the session's final
report instead. There was ALSO a genuinely pre-existing failure in the same describe block
(`meanHoldChargedMoveDodgeCostSeconds`, from Lane B's `simulate.ts` work, confirmed present before
I touched anything) — worth distinguishing "pre-existing, not mine" from "caused by my own
legitimate change, but the fix lives in a file I don't own" when reporting; they read identically
in a bare test-failure count otherwise.

**Also found via `typecheck:engine-test`, not just `test:engine`**: `powerUp.test.ts` (Lane A's
file) hand-constructs a `TeamRaidSlotResult[]` object literal that now fails to typecheck (missing
`slotId`) — vitest alone doesn't catch this (see the project's own `typecheck:engine-test` history
in [[dead_code_audit_2026_09_06]]-adjacent context: a stale mock slipped through vitest once for
the same reason). Running `npx tsc -p packages/engine/tsconfig.test.json --noEmit` separately
surfaced this cleanly, scoped to exactly the files that reference the changed type — a useful
triage step whenever a field is added to a widely-consumed type: type-check errors point at every
consumer OUTSIDE my file ownership are exactly the "not mine, but report clearly" list.
