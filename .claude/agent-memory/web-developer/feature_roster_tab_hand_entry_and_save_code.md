---
name: feature_roster_tab_hand_entry_and_save_code
description: Seventh tab (Roster) — hand-entry/editing, moved CSV import, gzip save code. Real duplicate-table bug found+fixed, e2e picker gotchas, and the scripts/-blocked check-scenario-roundtrip.mjs gap.
metadata:
  type: project
---

Built 2026-09-10 per `PLAN_roster_tab.md` (now shippable/deletable). Seventh tab, `view=roster`,
param `rt`. Owns the roster outright: hand-entry/editing (`RosterEntryForm.tsx`, reusing
`SpeciesPicker`/`MoveSelect`/`NumberField`), the pre-existing CSV import (`RosterImportPanel.tsx`,
moved here from Power-Up Optimizer, which now just shows a read-only roster-count status line),
and a self-contained gzip save code (`rosterSaveCode.ts`).

## Scope decision: no per-entry candy field

The plan's hand-entry field list says "candy and XL candy on hand" mirroring `RosterEntry`, but
the ACTUAL `RosterEntry` (`import/pokeGenieMatch.ts`) and the engine's `RosterEntry`
(`rosterPlanner.ts`) both carry no per-entry candy field at all — candy is either per-slot on the
single-raid Power-Up Optimizer's own `PowerUpSlotAssumption` (`candyOnHand`/`xlCandyOnHand`,
unrelated to the roster pool) or account-wide-per-family on `PowerUpOptimizerAssumptions.candyByFamilyId`
(multi-raid mode, a Scenario field on a DIFFERENT tab). `RosterPool.candyBySpeciesId` exists but is
scaffolded/unused by any engine call. I did not invent a new candy field on `RosterEntry` for this
— that would be an engine-shape change requiring `engine-developer`, not something to reimplement
in the web layer. Flagged in my final report; not built.

## Save code format

`pogo-roster-v<N>:<base64url(gzip(compact JSON))>` via the platform's `CompressionStream`/
`DecompressionStream` (no dependency added — available in Node 24's vitest env and every evergreen
browser this project targets). Measured on a realistic synthetic 164-entry pool (the repo's own
`pokeGenieSample.csv` fixture only has 23 rows): 81,471 bytes raw compact JSON -> 8,313-character
code, ~89.8% smaller than raw JSON / ~92.3% smaller than a naive uncompressed base64 blob. On the
real 23-row fixture: 11,672 bytes -> 1,886 chars (83.8% smaller).

`decodeRosterSaveCode` layers three checks (version prefix -> base64 -> gunzip) before reusing
`deserializeRosterPoolFromJson` for the actual shape check, so a truncated/edited code always fails
with a specific message, never a partial load — confirmed both in vitest (`rosterSaveCode.test.ts`)
and live via Playwright (pasting a 50%-truncated real code). `mergeRosterPools` (added to
`rosterPool.ts`) handles the "add" load mode: re-keys a colliding `entryId` with a `-dup`/`-dup2`/...
suffix rather than silently overwriting, tested for both a single collision and loading the same
code twice.

## Hand-entry "always clean" convention

`draftToRosterEntry` (`rosterEntryDraft.ts`) unconditionally sets
`movesetIsDefaulted`/`fastMoveIsDefaulted`/`chargedMoveIsDefaulted: false` and
`ivsAreApproximate`/`levelIsApproximate: false` regardless of which fields the user actually
touched — saving ANY edit (even one that doesn't touch the moveset) clears a previously-imported
row's default-moveset badge. This was a deliberate simplification matching the plan's own
framing ("the user just typed it") rather than trying to track per-field dirtiness.

## Real bug found + fixed: duplicate roster table with inconsistent wording

I initially kept `RosterImportPanel.tsx`'s own bottom roster table (the one it had before this
tab existed) alongside `RosterView.tsx`'s new one, reasoning it was "low risk, gated behind a
collapsed `<details>`." This was wrong on two counts, caught by a LIVE Playwright run (not just
reading the diff): both tables use the same `.time-series-table` class, so (a) any locator scoped
to that class became ambiguous once the CSV-import panel was expanded, and (b) worse, the OLD
table's `entryFlags()` helper collapses `movesetIsDefaulted` into the single generic string
"default moveset" regardless of WHICH move was defaulted, while the NEW table's
`movesetDefaultBadge()` (rosterMovesetBadge.ts) correctly distinguishes "default charged move" /
"default fast move" / "moveset not recognized" — so the same Palkia row showed two DIFFERENT,
disagreeing badge texts depending on which table you looked at. Deleted `RosterImportPanel`'s own
table and its now-unused `entryFlags` helper/`SpeciesBadges` import entirely; `RosterView`'s table
is strictly a superset (adds edit/delete). Lesson: "duplicated but collapsed" is not actually
low-risk when the two copies can disagree — a live click-through caught this where reading the
diff would not have.

## E2E picker gotchas (useful for any future spec touching SpeciesPicker/MoveSelect)

- **`SpeciesPicker`'s search is substring, not prefix/exact** — typing "tyranitar" also matches
  "Mega Tyranitar" (and any other species whose name contains it), and a positional `.first()`
  pick is non-deterministic about which one wins. Disambiguate with
  `page.locator('#id-listbox').getByRole("option", { name: exactLabel, exact: true })`, not a
  positional index.
- **`SpeciesPicker` options have a nested `<button>` inside each `<li role="option">`; `MoveSelect`
  options do NOT** — a `MoveSelect` option's `<li>` itself carries the `onClick`. Clicking
  `li.locator("button")` on a MoveSelect dropdown finds nothing; click the `<li>` directly.

## The one thing left undone: `scripts/check-scenario-roundtrip.mjs`

Told explicitly not to touch `packages/engine` or `scripts/` this session (a concurrent session was
mid-edit there — confirmed via `git status` showing `packages/engine/src/tmMove.ts` etc. already
dirty before I started). The `new-tab` skill's checklist item 5 (`scripts/check-scenario-roundtrip.mjs`
TABS row) and item 6 (`scripts/run-scenario.ts` CLI case) are consequently NOT done — this is the
one remaining `check-docs-drift` failure (`App.tsx has 7 tabs but scripts/check-scenario-roundtrip.mjs
has 6 TABS rows`), everything else in `npm run verify` is green. I fixed everything ELSE
`check-docs-drift` flagged that lived outside those two paths (CLAUDE.md's tab count/description,
the `add-scenario-assumption` skill's Step-0 table/param list) rather than treating the whole
checker as off-limits. Left `HANDOFF.md`/`PLAN_roster_tab.md` untouched too, since `HANDOFF.md` was
ALSO already dirty from the concurrent session — editing a file two sessions are mid-writing
felt like the same class of risk as editing `scripts/`, even though it wasn't explicitly named.
A follow-up session (once `scripts/` is free) needs to: add a Roster row to
`check-scenario-roundtrip.mjs`'s `TABS`, add a `"roster"` case to `run-scenario.ts` (reporting the
roster summary; the roster pool itself is structurally unreachable from the CLI, same "not
available to this CLI" pattern as Power-Up Optimizer's multi-raid mode), delete
`PLAN_roster_tab.md`, and record the outcome in `HANDOFF.md`.

## Verification actually performed

Real Chromium via Playwright (`npx playwright test`, against the built `dist`, `vite preview`) —
not just reading the diff or curling. All 4 new `e2e/roster.spec.ts` cases pass (hand-add with
badge-free confirmation + reaches Power-Up Optimizer/Lineup Builder identically; editing an
imported blank-moveset entry clears its badge; save-code round-trip + a truncated-code legible
failure; share-link restores the display setting only, never the roster). Full e2e suite (26
specs, up from 21) green; `npm run test:web` (284 tests), `npm run lint` (0 errors, the one
pre-existing `SpeciesPicker` warning unchanged), and `npm run verify`'s every OTHER step green.
