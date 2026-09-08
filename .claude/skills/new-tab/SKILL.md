---
name: new-tab
description: Checklist for adding a new top-level tab (view) to the web app — a seventh tab-switched view with its own shareable Scenario type and URL query param. Use whenever the user asks for a new tab, view, mode, or "page" in the comparator, before any component is written. A tab has eleven parallel touch points (App.tsx, codec, view, run/ function, round-trip checker, CLI, three test files, docs); missing one is the recurring drift this repo's docs checker exists to catch.
---

# Add a tab

Every tab is a sibling, not an extension: its own `AppTab` value, its own `*Scenario` type and
codec, its own query param, its own view, its own pure `run<Tab>` function. Don't unify them
(the existing six are deliberately separate; `code-simplifier` is told not to propose merging
them). Read one recent tab end-to-end first — the Power-Up Optimizer (`pu`) is the newest and
cleanest model.

## Checklist, in order

**Web (`web-developer`):**

1. `packages/web/src/App.tsx` — add the value to the `AppTab` union, the `initialTab()` mapping,
   the tab button in `.tab-switcher`, and the param to the doc comment that lists
   `` `s` for Scenario, ... `` (that comment is regex-parsed by `check-docs-drift`).
2. `packages/web/src/<tab>Scenario.ts` — the codec: the `*Scenario` interface, encode/parse to a
   base64url string, and a **new, unused** query param. Check `SCENARIO_PARAM_BY_TAB` in
   `scripts/run-scenario.ts` for the taken ones (`s` / `ts` / `sr` / `ivc` / `adb` / `pu`).
3. `packages/web/src/<Tab>View.tsx` (+ `<Tab>AssumptionPanel.tsx` if the panel is big) —
   `Assumptions`, `DEFAULT_ASSUMPTIONS`, `assumptionsToScenario` / `scenarioToAssumptions`,
   with `?? default` on every decoded field. Assumptions render alongside the result, never
   collapsed.
4. `packages/web/src/run/run<Tab>.ts` — the React-free `run<Tab>Scenario(assumptions, ...)`
   that does the whole computation. The view calls it through `useMemo` and nothing else; the
   CLI and the smoke test call the same function, so CLI == UI by construction.

**Checkers and CLI:**

5. `scripts/check-scenario-roundtrip.mjs` — a row in `TABS` (panel file, `Assumptions` name,
   view file, both round-trip function names).
6. `scripts/run-scenario.ts` — an entry in `SCENARIO_PARAM_BY_TAB` and a `case` that decodes
   with the codec and prints the tab's headline numbers.

**Tests:**

7. `packages/web/src/scenarioRoundtrip.test.ts` — a `describe` with both cases the others have:
   a fully populated **non-default** scenario round-trips, and a minimal old-link-shaped one
   decodes to defaults.
8. `packages/web/src/run/run.smoke.test.ts` — one smoke over the default scenario (no NaN /
   undefined headline numbers).
9. `packages/web/e2e/tabs.spec.ts` — the tab renders and its share link restores (Playwright;
   run with `npm run test:e2e` after `npm run build --workspace=packages/web`).

**Docs (each is checked by `npm run check-docs-drift`):**

10. CLAUDE.md's `packages/web` bullet — bump the bold count word ("**Seven** tab-switched
    views"), add the tab's one-sentence description, and add the param to the
    `URL query param (...)` list.
11. The `add-scenario-assumption` skill's Step-0 table (the `| Name (param) | ... |` row format
    is parsed) and `web-developer`'s tab table.

## Finish

`npm run verify` (tests, typecheck, lint, all checkers, production build), then
`npm run test:e2e` once the Playwright suite exists. Any setting on the new tab that isn't in
its `Scenario` is the shared-link bug class — the `add-scenario-assumption` skill applies to
every field from day one, not just to later additions.
