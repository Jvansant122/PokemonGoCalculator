---
name: add-scenario-assumption
description: Checklist for adding a new user-facing assumption/setting to the Pokémon GO Scenario Comparator's web UI (a new toggle, slider, number input, or dropdown in the assumptions panel). Use this whenever the user asks to add a new setting, control, toggle, slider, or assumption to the comparator's UI — this project has a documented recurring bug where a new field gets wired into the simulation but not into the shareable Scenario type, so a shared link silently reverts it to a default instead of restoring what was shared. Don't skip straight to just adding a UI control.
---

# Add a scenario assumption

CLAUDE.md's own "Scenarios" section flags this by name: **this exact bug has happened more than
once** in this project (first with `teammateTypeMatches`, later with
`bossChargedMoveFrequencySeconds`). The failure mode is quiet — the app still works, the new
setting still affects results in the current session, and nothing errors. It only breaks when
someone loads a *shared* scenario URL, at which point the new field just silently reverts to
whatever default you picked, and whoever shared the link gets a different result than they meant
to share. That's why this is a checklist, not a single edit: the bug is specifically about
forgetting one of several places a new field needs to exist in parallel.

## Why there are so many places

`Scenario` (the URL-encodable type) and `Assumptions` (the UI's live state type) are deliberately
separate — `Scenario` is engine-owned and minimal, `Assumptions` can carry web-only derived
convenience fields. Keeping them in sync is a manual contract, not something the type system
enforces for you, which is exactly why it's slipped before.

## Checklist, in order

1. **`packages/engine/src/scenario.ts`** — add the field to the `Scenario` interface. This is the
   one that actually gets base64url-encoded into the shareable link, so it's the field this whole
   checklist exists to protect. Give it a doc comment explaining what it controls, matching the
   style of the fields already there.

2. **`packages/web/src/AssumptionPanel.tsx`** — add the same field (name and type) to the
   `Assumptions` interface.

3. **`packages/web/src/App.tsx`, both directions of the round-trip**:
   - `assumptionsToScenario`: include the new field when building the `Scenario` to encode.
   - `scenarioToAssumptions`: read it back out — and use `s.newField ?? DEFAULT_ASSUMPTIONS.newField`
     (not a bare `s.newField`), so a scenario URL encoded *before* this field existed doesn't
     surface `undefined` into a controlled React input. This nullish-coalescing guard is cheap
     insurance and is already the pattern every other optional-feeling field in this function
     uses — don't skip it just because the field feels mandatory now.

4. **`DEFAULT_ASSUMPTIONS`** (also in `App.tsx`) — give it a sensible default matching today's
   behavior, so existing scenarios (and a fresh page load with no URL param) are unaffected.

5. **An actual UI control** in `AssumptionPanel.tsx` — a field in the `assumption-grid`, following
   the existing pattern (`<label>` + input/select, calling `set("fieldName", value)`). If the
   setting only makes sense given another setting's state (e.g. only shown when a related toggle
   is on, or only relevant in one situation), gate its visibility/enabled-state the way existing
   conditional fields in that file already do — don't leave it always visible if it can't do
   anything in some states.

6. **Wire it into the simulation** — if this assumption should actually affect the computed
   result (not just be a display-only setting), thread it into the `runSustainedComparison({...})`
   call in `App.tsx`. If it's a pure engine parameter, check whether `packages/engine/src/
   comparison.ts`'s `SustainedComparisonInputs` needs the new field too, and whether it needs to
   flow further down into `simulate.ts`'s `StepwiseAttacker`/`StepwiseBoss`. Not every UI setting
   reaches this deep (some are purely for the chart/display layer) — but if you skip this step for
   a setting that *should* affect the sim, you'll have a control that visibly does nothing, which
   is its own kind of the same underlying bug (a setting that looks wired up but isn't).

7. **A round-trip test** in `packages/engine/test/scenario.test.ts` — assert the new field
   survives `encodeScenario`/`decodeScenario` with a **non-default** value, matching the existing
   pattern (e.g. "round-trips a non-default matchingTeammateCount rather than silently reverting
   to the full party"). A test that only checks the default value round-trips wouldn't have
   caught either of the two real times this bug happened — the point is specifically to prove a
   *changed* value survives.

## Finish

Run `npm run test:engine` from the repo root. All existing tests plus your new one should pass.
If you have the `verify-and-ship` skill available and the user wants to commit this, use it for
the rest of the pipeline (type-check, build, deploy) rather than improvising a shorter check.
