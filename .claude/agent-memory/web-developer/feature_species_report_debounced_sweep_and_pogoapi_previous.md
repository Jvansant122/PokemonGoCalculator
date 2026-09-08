---
name: feature-species-report-debounced-sweep-and-pogoapi-previous
description: Debounced Species Report's per-keystroke 200-run-per-boss sweep (needed once the past-raid roster grew ~15 to ~500 via a pogoapi historical backfill), added the new "pogoapi-previous" raid-history source with inverted tier-resolution logic, and a third past-raid badge
metadata:
  type: project
---

Built 2026-09-07, same session data-sync landed the ~500-entry `pogoapi-previous` backfill this
task was written against (confirmed landed mid-session by reading `data/normalized/raidHistory.json`
directly — 501 total entries: 470 pogoapi-previous, 15 researched-tier, 16 live-feed). Files
touched: `packages/web/src/useDebouncedValue.ts` (new), `registry.ts`, `SpeciesReportView.tsx`,
`styles.css`. Zero engine/data/scripts edits, zero new `Scenario` fields (the debounce is pure
render-timing, not a user-facing setting — `check-scenario-roundtrip` still reports exactly 14
Species Report fields, unchanged).

**The debounce design that actually mattered: debounce a NARROW derived object, not the whole
`assumptions` state, or the sort-toggle "must stay instant" requirement breaks.** First instinct
was "just debounce all of `assumptions`" — simpler, but wrong: `sortedRows` already reads
`assumptions.sortMode` directly (never touches the sweep), yet if the debounced copy were the
whole state object, ANY field change (including sortMode) changes that object's reference, so a
naive `assumptions !== debouncedAssumptions` pending check would flash "recomputing…" for a sort
click that never actually re-triggers anything — exactly the bug class CLAUDE.md's "don't debounce
things that are cheap and expect instant feedback" line warns about. Fix: built `sweepInputs` as
its own `useMemo` over every field EXCEPT `sortMode`, with each field listed individually in the
dependency array (not `[assumptions]` as one dependency) — this means `sweepInputs`' object
identity only changes when one of the *listed* fields' VALUE actually changes; a sortMode-only
update leaves the reference untouched. Debounce `sweepInputs`, not `assumptions`, and pending
detection is a plain `sweepInputs !== debouncedSweepInputs` — free and correct because
`useDebouncedValue` stores the literal value it was handed (no cloning), so the two become the
SAME reference the instant the timer fires.

**Whole-object debounce (not per-field) was still the right call for the fields that DO feed the
sweep, and is what avoids a subtler correctness bug.** Species selection resets
`fastMoveId`/`chargedMoveId` to null in the same `setAssumptions` call (existing convention). If
species and its moves were debounced on independent per-field timers, a torn read is possible —
picking species X could be seen by the sweep just as its OLD moves reset finished catching up but
before X itself did, or vice versa, potentially handing `runSpeciesReverseLookup` a moveId that
doesn't exist on the paired species. Debouncing one atomic object (constructed fresh each
`sweepInputs` recompute, echoed by ONE `setTimeout` in `useDebouncedValue`) guarantees the sweep
only ever sees a fully-consistent, single point-in-time snapshot — species and its moves always
arrive together. Two DIFFERENT resolved-species memos exist for this reason:
`species` (live, `assumptions.speciesId` — feeds the move dropdowns/boost badge, must update the
instant a new species is picked) and `sweepSpecies` (debounced, `debouncedSweepInputs.speciesId` —
feeds `runSpeciesReverseLookup` only). Don't collapse these into one; a future "why does the
moveset dropdown lag 300ms after picking a species" bug is exactly what keeping them separate
prevents.

**Rejected alternative, documented in `useDebouncedValue.ts` itself, not just here**: a Web Worker
so the main thread never blocks even during the final (post-debounce) computation. That's the
actually-scalable fix as this roster keeps growing past ~500, but moving `SpeciesRegistry`/the
engine call into a worker (structured-clone cost or a serializable-inputs-only rewrite, message
passing, a second build target) is a materially bigger, riskier change than this task's scope —
flagged explicitly per this project's "state what you did and why for a rejected alternative"
convention, not silently built around. React's own concurrent primitives
(`useTransition`/`useDeferredValue`) were also considered and rejected for a documented reason:
JS is run-to-completion, so once a `useMemo` body starts executing a ~1.1-1.4s synchronous
computation, React cannot interrupt it partway through regardless of how the update was scheduled
— they only help schedule cheap renders AROUND an expensive one, they don't make the expensive one
itself interruptible. A plain `setTimeout` debounce is therefore not "the naive option that a
better one was available instead of" — it's the correct fix for the actual failure mode (N
keystrokes -> N freezes) even though it doesn't eliminate the single final freeze.

**Measured, not assumed, that the freeze is real at the actual current scale**: wrote a throwaway
`.mts` (per [[verification_without_browser_tool]]) calling `runSpeciesReverseLookup` directly
against the FULL real target list (16 active + 485 past = 501, no tier filter) — 1124ms synchronous,
consistent with the task's own measured table (696 targets -> 1383ms). Confirms this isn't a
hypothetical future problem the debounce pre-empts; it's live in the current committed data.

**Task 3's tier-resolution inversion, and proving it actually diverges (not just structurally
different code paths that happen to agree today)**: `pastRaidBossOptions()` gained
`resolvePastRaidTier(entry)` — for `source === "pogoapi-previous"`, trust `entry.tier` directly
(cast through `isKnownRaidTier` as a defensive fallback to the old `defaultRaidTierForSpecies`
path only if pogoapi's raw string is somehow unrecognized); for `"live-feed"`/`"researched-tier"`,
unchanged (`defaultRaidTierForSpecies`, the cross-tab-agreement behavior from
[[feature_species_report_past_raids_and_tier_filter]]). Wrote a second scratch script asserting
this isn't vacuous: **203 of 470 real pogoapi-previous rows actually diverge** from what
`defaultRaidTierForSpecies` would say today (e.g. Abra: pogoapi's archive says "1-Star Raids", the
engine's current default for Abra resolves to "3-Star Raids") — so the inverted branch is doing
real, load-bearing work on the real dataset, not just theoretically-different code that happens to
always agree.

**A real gotcha this session that would have silently broken on the very next toggle click**:
the results heading (`Ranked against N raid bosses — X active, Y past/inactive`) originally read
`assumptions.includePastRaids` (live) even though `targets.length`/`activeTargetCount`/
`pastTargetCount` next to it are all derived from the DEBOUNCED `targets` memo. If a user unchecks
"include past raids" and the debounce hasn't caught up yet, the heading would have flipped to the
"active-only" phrasing (branching on the LIVE flag) while `targets.length` still reflected the OLD,
past-inclusive count (branching on the DEBOUNCED flag) — a heading and the number right next to it
disagreeing about what they're describing, the exact "silently stale-looking-authoritative" failure
this task explicitly warns against, just in a spot I wouldn't have thought to check without
tracing every consumer of `assumptions.includePastRaids` after introducing the debounce. Fixed by
switching that one specific read to `debouncedSweepInputs.includePastRaids`. **Lesson: after adding
a debounce, grep every remaining live-state read that sits next to (or inside the same sentence as)
a debounced-derived number — the two need to describe the same snapshot, not just each individually
be "correct" in isolation.** `noTiersSelected`'s empty-state gate was deliberately left on the LIVE
`assumptions.includedTiers` instead (unchecking the last box should hide the table immediately, not
300ms later) — that one asymmetry is intentional, not an oversight; documented inline so it isn't
"fixed" into consistency with the heading bug above.

**`pogoapi-previous` rows carry no real chronology, and the existing `lastSeenAt`-desc sort would
have silently mishandled that** — data-sync stamps them all with the sync run's own timestamp
(confirmed: every pogoapi-previous row in the real data has identical `firstSeenAt`/`lastSeenAt`),
which is a technical placeholder, not a real "last observed" date. Sorting by it directly would
either tie all 470 rows together (stable-sorting to their original, essentially-arbitrary JSON
order) or, worse, interleave them among the genuinely-dated live-feed/researched-tier rows as if
their placeholder timestamp were comparable. Fixed with a two-tier comparator: real-dated rows
(`source !== "pogoapi-previous"`) sort first among themselves by `lastSeenAt` desc (unchanged
prior behavior), then every dateless archive row after them, alphabetically by raid name for a
stable, readable order. Verified against the real data: dated rows are indices 0-14, first archive
row is index 15, and the 470 archive rows are already exactly alphabetically sorted.

**Third badge, not a second color of an existing one**: `.badge-past-archive` (green, solid
border) — distinct hue from `.badge-past` (slate, solid) and `.badge-past-researched` (slate,
dashed) since `pogoapi-previous` is a genuinely different provenance claim (a real historical
encounter this pipeline never itself observed, sourced from pogoapi, no date), not a weaker/dimmer
version of either existing claim. Still explicitly NOT `.badge-hypothetical` (reserved for
"this species' data is speculative," never true for these rows) — same reasoning as the original
`.badge-past-researched` decision, restated once more for the third variant since it's the kind of
thing a future session could get tempted to conflate again.

**Verification this session**: `npx tsc --noEmit` clean; `npm run check-scenario-roundtrip` still
reports exactly 14 Species Report fields (proves the debounce introduced zero new/missing scenario
surface); `npm run test:engine` 21 files/174 tests green (zero engine edits); `npm run build
--workspace=packages/web` succeeded (pre-existing chunk-size warning only). Two throwaway `.mts`
scripts (deleted after) proved: (1) all `pastRaidBossOptions()` invariants — zero active/past
overlap, zero pogoapi-previous rows disagreeing with a recognized `recordedTier`, zero live-
feed/researched-tier rows disagreeing with `defaultRaidTierForSpecies`, the 203/470 real divergence
count above, and the sort-order split; (2) the 501-target full-sweep timing (1124ms). Also served
the production build via `vite preview`, curled root/JS/CSS for 200s (note: `/PokemonGoCalculator/`
paths 200'd too but were SPA-fallback HTML, not the real asset — the base path is `/` for local
builds per `vite.config.ts`, only `/PokemonGoCalculator/` in the GitHub Pages CI build; fetch the
ROOT-relative asset paths from the HTML's own `<script src>`/`<link href>`, not a guessed prefixed
path), `node --check`ed the bundle, and grepped it for the new literal strings ("past (archive)",
"recomputing", "sourced historical archive", "EX Raids are", `.badge-past-archive`,
`.badge-pending`, "pogoapi-previous") to confirm they shipped. Additionally hit the ALREADY-RUNNING
dev server on port 5173 (this session had one, unlike prior ones) and confirmed all three touched
modules (`SpeciesReportView.tsx`, `registry.ts`, `useDebouncedValue.ts`) transform through Vite's
esbuild pipeline with 200s — a real parse/syntax check beyond `tsc`, though still not a rendered
browser. **Did not click through the actual typing-stays-responsive / pending-indicator UX in a
live browser** — same Read/Write/Edit/Bash/Grep/Glob-only tool grant as every prior session, no
browser tool available despite the dev server being up. If a future session gets a browser tool,
this is the first place to point it: type multiple digits into Level with "include past raids" on
and confirm no visible freeze, and confirm the "recomputing…" badge + dimmed table appear during
the ~300ms-plus-sweep-time window after the last keystroke.
