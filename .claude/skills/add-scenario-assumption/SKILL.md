---
name: add-scenario-assumption
description: Checklist for adding a new user-facing assumption/setting to any tab of the Pokémon GO Scenario Comparator's web UI (a new toggle, slider, number input, or dropdown — on the Comparator, Team Raid Simulator, Species Report, IV Breakpoints, or Attack/Defense Breakpoints tab). Use this whenever the user asks to add a new setting, control, toggle, slider, or assumption to any of those tabs — this project has a documented recurring bug where a new field gets wired into the simulation but not into that tab's shareable Scenario type, so a shared link silently reverts it to a default instead of restoring what was shared. Don't skip straight to just adding a UI control.
---

# Add a scenario assumption

CLAUDE.md's "Standing decisions" section flags this by name: **this exact bug has happened more
than once** in this project (first with `teammateTypeMatches`, later with
`bossChargedMoveFrequencySeconds`). The failure mode is quiet — the app still works, the new
setting still affects results in the current session, and nothing errors. It only breaks when
someone loads a *shared* scenario URL, at which point the new field just silently reverts to
whatever default you picked, and whoever shared the link gets a different result than they meant
to share. That's why this is a checklist, not a single edit: the bug is specifically about
forgetting one of several places a new field needs to exist in parallel.

## Why there are so many places

`Scenario` (the URL-encodable type) and `Assumptions` (the UI's live state type) are deliberately
separate — `Scenario` is minimal, `Assumptions` can carry web-only derived convenience fields.
Keeping them in sync is a manual contract, not something the type system enforces for you, which
is exactly why it's slipped before.

## Step 0: which tab?

There are **five** tabs, each with its own Scenario type, its own query param, and its own copy of
the round-trip. The checklist below is the same shape for all of them — only the filenames change.
Find your row before touching anything:

| Tab | Scenario type | Assumptions + round-trip live in |
| :--- | :--- | :--- |
| Comparator (`s`) | `packages/engine/src/scenario.ts` | `AssumptionPanel.tsx` (interface) + `ComparatorView.tsx` |
| Team Raid Simulator (`ts`) | `packages/engine/src/teamScenario.ts` | `TeamAssumptionPanel.tsx` + `TeamRaidView.tsx` |
| Species Report (`sr`) | `packages/web/src/speciesReportScenario.ts` | `SpeciesReportView.tsx` |
| IV Breakpoints (`ivc`) | `packages/web/src/ivBreakpointsScenario.ts` | `IvBreakpointsAssumptionPanel.tsx` + `IvBreakpointsView.tsx` |
| Attack/Defense Breakpoints (`adb`) | `packages/web/src/attackDefenseBreakpointsScenario.ts` | `AttackDefenseBreakpointsView.tsx` |

Two asymmetries that matter:

- **Only the first two Scenario types live in the engine.** The other three are web-only, so a
  field added to one of those is not an engine change at all — don't go looking for it in
  `packages/engine`.
- **The round-trip functions are per-view, not in `App.tsx`.** `App.tsx` only owns the `view=`
  tab switcher. Every tab has its own local `assumptionsToScenario`/`scenarioToAssumptions`
  /`DEFAULT_ASSUMPTIONS` inside its own `*View.tsx` (the Team Raid tab names its own
  `assumptionsToTeamScenario`). Editing `App.tsx` for this is almost always a sign you're in the
  wrong file.

## Checklist, in order

1. **The Scenario type** for your tab (see the table above) — add the field to the interface. This
   is the one that actually gets encoded into the shareable link, so it's the field this whole
   checklist exists to protect. Give it a doc comment explaining what it controls, matching the
   style of the fields already there.

2. **The `Assumptions` interface** for your tab — add the same field (name and type).

3. **Both directions of the round-trip, in your tab's `*View.tsx`**:
   - `assumptionsToScenario`: include the new field when building the `Scenario` to encode.
   - `scenarioToAssumptions`: read it back out — and use `s.newField ?? DEFAULT_ASSUMPTIONS.newField`
     (not a bare `s.newField`), so a scenario URL encoded *before* this field existed doesn't
     surface `undefined` into a controlled React input. This nullish-coalescing guard is cheap
     insurance and is already the pattern every other optional-feeling field in this function
     uses — don't skip it just because the field feels mandatory now.

4. **`DEFAULT_ASSUMPTIONS`** (same `*View.tsx`) — give it a sensible default matching today's
   behavior, so existing scenarios (and a fresh page load with no URL param) are unaffected.

5. **An actual UI control** in your tab's assumption panel — a field in the `assumption-grid`, following
   the existing pattern (`<label>` + input/select, calling `set("fieldName", value)`). If the
   setting only makes sense given another setting's state (e.g. only shown when a related toggle
   is on, or only relevant in one situation), gate its visibility/enabled-state the way existing
   conditional fields in that file already do — don't leave it always visible if it can't do
   anything in some states.

6. **Wire it into whatever computes the result** — if this assumption should actually affect the
   numbers (not just be a display-only setting), thread it into your tab's engine call:
   `runSustainedComparison` (Comparator), `runTeamRaid` (Team Raid), `runSpeciesReverseLookup`
   (Species Report), `compareIvSpreads` (IV Breakpoints), or the damage-grid functions in
   `breakpoints.ts` (Attack/Defense Breakpoints). If it's a pure engine parameter, check whether
   that function's own inputs interface needs the field too, and whether it needs to flow further
   down into `simulate.ts`'s `StepwiseAttacker`/`StepwiseBoss`. Not every UI setting reaches this
   deep (some are purely for the chart/display layer) — but if you skip this step for a setting
   that *should* affect the sim, you'll have a control that visibly does nothing, which is its own
   kind of the same underlying bug (a setting that looks wired up but isn't).

7. **A round-trip test** asserting the new field survives encode/decode with a **non-default**
   value. A test that only checks the default value round-trips wouldn't have caught either of the
   two real times this bug happened — the point is specifically to prove a *changed* value
   survives.
   - Comparator and Team Raid: add it to `packages/engine/test/scenario.test.ts` or
     `teamScenario.test.ts`, matching the existing pattern (e.g. "round-trips a non-default
     `matchingTeammateCount` rather than silently reverting to the full party").
   - **The other three tabs have no scenario tests at all today** — `speciesReportScenario.ts`,
     `ivBreakpointsScenario.ts` and `attackDefenseBreakpointsScenario.ts` are web-only and
     untested, and `packages/web` has no vitest setup. That is a real hole in exactly the bug
     class this skill exists to prevent. Don't let it silently excuse skipping step 7: at minimum,
     manually verify the round-trip by building a share link with a non-default value, opening it
     in a fresh tab, and confirming the control comes back set. Say so explicitly in your report
     rather than implying a test covered it.

## Finish

Run `npm run check-scenario-roundtrip` from the repo root **first** — it's the mechanical version
of step 3, extracting every field of each tab's `Assumptions` interface and asserting the name
appears in both round-trip directions across all five tabs. It exits non-zero and names the
offending field if you missed one. It's a name-level smoke test, not a type check: it proves a
field is *mentioned* in both functions, not that it's mapped correctly — so it does not replace
step 7's test or the manual share-link check.

Then run `npm run test:engine` from the repo root. All existing tests plus your new one should pass.
If you have the `verify-and-ship` skill available and the user wants to commit this, use it for
the rest of the pipeline (type-check, build, deploy) rather than improvising a shorter check.
