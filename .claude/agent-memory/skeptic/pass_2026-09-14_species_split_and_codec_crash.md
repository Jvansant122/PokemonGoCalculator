---
name: pass-2026-09-14-species-split-and-codec-crash
description: Skeptic pass after the speciesCore/speciesMoves split, Best Buddy roster UI, raid freshness note, and 5-codec hardening — species/move data fidelity confirmed clean, but found a real crash-on-malformed-link bug the hardening pass missed
metadata:
  type: project
---

Pass date 2026-09-14, after ~20 commits including the species-registry reshape
(`registry.ts` now builds from `speciesCore.json` + `speciesMoves.json` instead
of `species.json`, with 308 move objects shared BY REFERENCE across 1,750
species), the Power-Up Optimizer's multi-raid Best Buddy table, the
`RaidFreshnessNote` component, an ARIA tabs overhaul, and a "five hardened web
codecs" pass (`scenarioDecodeHardening.test.ts`) covering Species Report/IV
Breakpoints/Attack-Defense/Power-Up Optimizer/Roster.

## Confirmed bug: 4 of 6 tab codecs crash (not degrade) on a top-level-field-absent share link

**Root cause, precisely located**: the "five hardened" decode functions
(`decodeXScenarioWithDiagnostics` in each `*Scenario.ts`) correctly degrade a
malformed/wrong-shape payload to a scenario object with individual bad fields
dropped to `undefined`, never throwing — that layer works as designed and I
could not break it. The engine's own `parseScenarioFromUrl`/
`decodeScenarioWithDiagnostics` (used by Comparator and Team Raid, per
`scenarioDecodeHardening.test.ts`'s own comment: "mirrors packages/engine's
test/scenario.test.ts... for the five WEB-owned codecs `957999d`'s
degrade-not-throw treatment didn't originally reach") does the same at the
decode layer.

**But** each view's own `scenarioToAssumptions`/`teamScenarioToAssumptions`
merge function (the step AFTER decode, turning a `Scenario` into the
`Assumptions` the UI actually renders) dereferences several fields without a
`??`/optional-chain guard for "the whole field is absent," even though every
OTHER field in the same function is correctly guarded:

- `packages/web/src/ComparatorView.tsx` (~line 166): `s.candidates[0]` —
  throws if `s.candidates` itself is `undefined` (the `?? DEFAULT` right after
  never runs; the crash happens on the `[0]` access before it). Also
  `s.ivs.attack` (~line 188, no guard at all) and `dodge: s.dodgeModel`
  (~line 191, no `??`).
- `packages/web/src/TeamRaidView.tsx` (~line 235): `s.slots.map(...)` — throws
  if `s.slots` is absent (contrast `powerUpOptimizerScenario.ts`'s own
  `(s.slots ?? []).map(...)`, which has the fix). Also `s.ivs.attack` and
  `s.dodgeModel`, same as above.
- `packages/web/src/SpeciesReportView.tsx` (~line 157): `s.ivs.attack` (no
  guard) and `dodge: s.dodgeModel` (no `??`).
- `packages/web/src/powerUpOptimizerScenario.ts` (`scenarioToAssumptions`,
  ~line 485): `dodge: s.dodgeModel` — every sibling field in this exact
  function has a `?? DEFAULT_ASSUMPTIONS.xxx` guard; this one line doesn't.
  Doesn't throw here, but produces `assumptions.dodge = undefined`, which
  then crashes downstream in `PowerUpOptimizerAssumptionPanel.tsx:59`
  reading `.kind` on it.

**IV Breakpoints and Attack/Defense Breakpoints do NOT have this bug** — both
guard every field with `??` (e.g. `IvBreakpointsView.tsx:100`:
`dodge: s.dodgeModel ?? DEFAULT_ASSUMPTIONS.dodge`), and both degraded cleanly
in testing (empty/default state, no crash). This is the reference-correct
pattern the other four should match.

**Effect when triggered**: `TabErrorBoundary` catches it and shows a "This tab
failed to render" fallback with a reset button and the reproducing link — not
a blank crash, but explicitly NOT the "degrade per-field, usable page" outcome
the hardening work was meant to deliver, and not what `IV
Breakpoints`/`Attack-Defense` actually do for the identical input.

**Repro** (same base64 payload `{"foo":"bar","nested":{"a":1}}` — a
structurally-valid JSON object whose top level just doesn't have any of the
scenario's own keys, e.g. a genuinely corrupted/truncated paste that still
happens to decode as *some* JSON object):
- `http://localhost:5173/?view=comparator&s=eyJmb28iOiJiYXIiLCJuZXN0ZWQiOnsiYSI6MX19`
- `http://localhost:5173/?view=team-raid&ts=eyJmb28iOiJiYXIiLCJuZXN0ZWQiOnsiYSI6MX19`
- `http://localhost:5173/?view=species-report&sr=eyJmb28iOiJiYXIiLCJuZXN0ZWQiOnsiYSI6MX19`
- `http://localhost:5173/?view=power-up-optimizer&pu=eyJmb28iOiJiYXIiLCJuZXN0ZWQiOnsiYSI6MX19`

All four should be re-checked after a fix by loading these exact links and
confirming a normal default-state page, no error boundary, no console error.

**Not a bug**: plain garbage (`?s=garbage`, non-base64, valid-base64-non-JSON,
non-object-top-level JSON like `[1,2,3]`) degrades gracefully everywhere,
including these same four tabs — only the "valid JSON object, expected keys
missing" case triggers this.

## Species/move data-split reshape: no fidelity issues found

Hand-compared `data/normalized/species.json` against the derived
`speciesCore.json`+`speciesMoves.json` pair for Mewtwo (10 charged moves incl.
FRUSTRATION/RETURN), `abra-shadow` (2 fast/5 charged), `charizard-mega-y` (5
fast/6 charged incl. BLAST_BURN) — move id lists, order, and the dictionary
entries' power/energy/duration all matched exactly. Confirmed in the live UI
too (Mewtwo's charged-move dropdown lists all 10 in the same order as
species.json). `fillSpeciesMoves`'s shared-by-reference move objects are
copied (`{...move, power}`) not mutated at the one live call site
(`megaLevel.ts`'s `chargedMoveAtMegaLevel`) — confirmed by reading the code,
consistent with `registry.ts`'s own doc-comment warning. Did not find a UI
path where a shared move's displayed power/duration differs between two
species.

`isHypothetical` badge: 0 matches for `"isHypothetical": true` in
`speciesCore.json` — consistent with "no synced species is hypothetical
today," no false-positive badge found.

## Other checklist items — all clean

- **Best Buddy roster UI** (Power-Up Optimizer multi-raid): flagging a roster
  entry Best Buddy on the Roster tab correctly removes it from the "Best Buddy
  candidates" table on next sweep (went from 3 rows to 0 rows after flagging
  the remaining 3 of 4 roster entries); the all-flagged empty state reads
  "Nothing to recommend — every Pokémon fielded on at least one boss's
  baseline team is already flagged Best Buddy on the Roster tab" — not a
  broken/blank table. No cost/efficiency columns present, as specified.
- **Raid freshness note**: `_meta.json` has `source: "scrapedduck"`,
  `fetchedAt: "2026-09-14T..."`; UI shows "Raid data as of 2026-09-14... last
  actually fetched" — the `source === "scrapedduck"` branch, matching.
- **ARIA tabs**: tested with real `ArrowRight`/`Home`/`End` key events (not
  reading markup) — roving tabindex updates correctly (only the selected tab
  has `tabIndex=0`, others `-1`), `aria-selected` moves with focus,
  `aria-controls`/tabpanel `id` linkage confirmed
  (`tab-roster`→`tabpanel-roster`), skip link `href` updates to the active
  tab's panel id. No issues found.
- **Per-tab lazy chunks**: deep-linking `?view=power-up-optimizer` and
  `?view=attack-defense-breakpoints` fresh both show the CORRECT tab
  highlighted immediately with a loading/blank body (never a Comparator
  flash) while the chunk loads.
- **1.3 mega/primal boost**: confirmed still `DEFAULT_MEGA_BOOST_MULTIPLIER =
  1.3` in `packages/engine/src/uptime.ts` (not touched by this pass's data
  reshape; `OFF_TYPE_MEGA_BOOST_MULTIPLIER = 1.1` is a real, separate,
  intentional constant for off-type teammates, not a regression).
- **Comparator round-trip**: built a link with Shadow+Best Buddy on candidate
  A only, Windy weather, Best Friend friendship; opened fresh in a new tab;
  every value restored exactly (this is the standing recurring bug class —
  worth re-testing every pass, still clean here).

## Tooling notes

- `screenshot` frequently times out ("did not finish rendering in time")
  right after a `navigate` to a lazy-loaded tab chunk — this is NOT a hang or
  crash, just the chunk still loading; retry the screenshot once or twice
  before concluding anything is broken. Don't confuse this with the
  pane-hidden hazard from prior passes (different symptom, same "don't
  over-read a tooling timeout as an app bug" lesson).
- `read_console_messages` accumulates across navigations in the same tab —
  after several navigations the error log gets long and repeats old errors;
  navigate to a neutral URL first (or note the timestamp/context) before
  trusting "no new errors" from a read after several jumps.
- Hand-crafting a `{"foo":"bar","nested":{"a":1}}` → `btoa` → `?s=...` link is
  a fast, reliable way to test "valid JSON, wrong shape" specifically (distinct
  from "invalid base64" or "valid base64, not JSON," both of which most tabs
  already handled before this pass) — worth keeping as a standard check
  alongside the plain-garbage one.
