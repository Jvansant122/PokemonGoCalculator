---
name: feature_gated_evolutions_and_roster_move_change_sweep
description: Closed 4 "engine capability, no UI" gaps from commit 983ca15 — registry.ts gated-evolution resolution, surfacing viaEvolution/gatedEvolutions in the roster UI, the multi-raid move-change sweep (runRosterMoveChangeCandidates), and knownChargedMoveIds hand-entry wiring. Found a real, unfixed engine bug along the way.
metadata:
  type: project
---

Built 2026-09-11. Closed four engine surfaces packages/engine had already shipped with zero
`packages/web` caller — same recurring bug class CLAUDE.md calls out (per-slot levels once,
Eternatus cost override once, now this).

## 1. registry.ts gated-evolution resolution (item 1, did FIRST as instructed)

`SpeciesDefinition.evolutions`/`.gatedEvolutions` were BOTH permanently `undefined` for every
real species before this — not just `gatedEvolutions` as the task briefing assumed.
`data/normalized/species.json`'s `evolutionCandyCosts` (550 species / 577 branches, 467
candy-only / **110 gated** — confirmed exact via a direct species.json scan, matches the task's
"roughly 110" estimate precisely) was never resolved into object references at all. Added
`resolveEvolutions()` to `registry.ts`, run once in `buildRegistry()` AFTER every species is
registered (mutates the already-registered objects in place — `SpeciesRegistry.register` stores
the exact reference, confirmed via gamemaster.ts). Real, load-bearing consequence: this
retroactively activated IDEAS.md #9 ("evolve, then power up") in `rosterPlanner.ts`, which had
been fully built and tested against a mocked/fixture `evolutions` field but never actually fired
in production — a **pre-existing `run.smoke.test.ts` test's own assertion flipped** (Houndour used
to always land in `neverCompetitive`; now it's promoted into `candidates`/`benchedButPromising`
via a real `viaEvolution` candidate, since Houndour→Houndoom is genuinely candy-only). Updated
that assertion rather than treating it as a regression — this is the intended, deliberate
unlock, not a bug.

## 2. Surfacing gated evolutions (item 2)

Neither `RosterNeverCompetitiveEntry.evolutionRecommendation`/`.gatedEvolutions` nor
`RosterPowerUpCandidate.viaEvolution` were rendered anywhere in `PowerUpOptimizerView.tsx` before
this — confirmed via grep, zero matches. Added `EvolutionOptionsCell`/`GatedEvolutionList` (shared
by `ExcludedEntriesTable`'s new "Evolution options" column and `MultiRaidCandidateRow`'s new
"via evolution from X" note) rendering the engine's own `GatedEvolutionNotice.requirementSummary`
verbatim per branch — e.g. "Espeon — needs to be your buddy for 10km, daytime only, a
field/special research quest, 25 candy". Verified live via Playwright with a hand-added Eevee.

**Gap found, not fixed (AFFECTS engine-developer)**: `requirementSummary`'s `requiresItem`/
`requiresLureItem` branches render the RAW GAME_MASTER constant verbatim ("needs
ITEM_SUN_STONE"), unlike every other gate type in the same sentence (buddy/day-night/quest all
render in plain English) — `describeEvolutionRequirement` (rosterPlanner.ts) does `needs
${g.requiresItem}` with no humanization. `GatedEvolutionNotice` only exposes the PRE-COMPOSED
string, not the raw per-field booleans, so web can't cleanly extract-and-humanize just the item
token without a fragile regex over an already-joined comma sentence. Real item ids seen in the
data: `ITEM_SUN_STONE`/`ITEM_KINGS_ROCK`/`ITEM_METAL_COAT`/`ITEM_GEN4_EVOLUTION_STONE`/
`ITEM_DRAGON_SCALE`/`ITEM_UP_GRADE`/`ITEM_GEN5_EVOLUTION_STONE` (all confidently mappable to real
PoGo item names) plus some uncertain ones (`ITEM_BEANS`, `ITEM_OTHER_EVOLUTION_STONE_MAPLE_A/B/C`)
I deliberately did NOT guess names for. Left as a follow-up rather than shipping a fragile
web-side string-surgery hack or an engine change outside my lane.

## 3+4. Multi-raid move-change sweep + eliteFastTmOnHand/eliteChargedTmOnHand

`runRosterMoveChangeCandidates` (rosterMoveChange.ts) had zero web callers. Built
`run/runRosterMoveChange.ts` (resolution/computation split, mirrors `runRosterPlanner.ts`'s own
convention exactly), a THIRD `rosterPlanner.worker.ts` request type (`moveChange` ->
`moveChangeResult`, no `onProgress` — the engine call takes none), and
`runRosterMoveChangeOffMainThread` in the worker client. New
`MultiRaidMoveChangeSection`/`RosterSecondChargedMoveTable`/`RosterEliteTmSection` in
`PowerUpOptimizerView.tsx`, gated on the main sweep's own ALREADY-COMPUTED `baselinePerBoss`
(can't run before that sweep has; the button is disabled + explained until it has).

**`eliteFastTmOnHand`/`eliteChargedTmOnHand` already existed** (round-tripping, built in an
earlier single-raid-only TM session) — the task briefing assumed they didn't. My job was wiring
them into this SECOND consumer, not re-adding fields (`check-scenario-roundtrip` stayed at 152,
correctly — no new fields were added, an EXISTING pair gained a second real consumer). Also
widened `PowerUpOptimizerAssumptionPanel.tsx`'s 4 TM fields out from a `mode === "single-raid"`
gate (they were completely invisible in multi-raid mode before this).

**Real bug I introduced and caught via live Playwright before shipping**: my first pass read
`eliteFastTmOnHand`/`eliteChargedTmOnHand` off `multiRaidInputs` (the memo that ALSO drives the
main sweep's `isMultiRaidStale`) — typing a TM count silently marked the completed main sweep
stale and DISABLED the move-change button entirely (`canRunMoveChange` requires
`!isMultiRaidStale`). Caught by attempting the actual before/after click sequence the task
demanded, not by reading the diff. Fix: `resolveRosterMoveChangeInputs` takes the two TM counts
as EXPLICIT parameters, read straight off the live `assumptions` object at the call site, never
folded into `multiRaidInputs`'s own value/dependency array. `moveChangeRun`'s own staleness
snapshot tracks them as two separate fields alongside `inputs`/`pool`/`baselineRef`.

**Live proof, not just unit tests** (packages/web/__scratch_verify_tm.mjs, deleted after — real
Chromium via Playwright against `vite preview` on the production build): hand-added Eevee via the
Roster tab (real gated-evolution note above), hand-added Dragonite with the new
"Knows a second charged move" checkbox (no default-moveset badge), ran the main sweep, ran the
move-change sweep — heading read "Elite Fast TM candidates — unknown Elite Fast TM count,
affordability not shown" with 0/128 candidates affordable; typed `5` into both Elite TM fields,
re-ran, heading became "your 5 Elite Fast TMs" with **128/128 affordable**; set both back to `0`,
re-ran, **0/128 affordable** again. Zero console errors throughout.

## Real, unfixed engine bug found (AFFECTS engine-developer, NOT patched — outside my lane)

`rosterMoveChange.ts`'s BENCHED-candidate real-eval path (`candidateSlots` substitution around
line 642) does not respect the "at most one Mega/Primal slot per team" invariant `runTeamRaid`
enforces elsewhere. Reproduced live with the real `pokeGenieSample.csv` fixture (which genuinely
has two different mega-capable rows, Mega Delphox and Mega Blaziken — a completely ordinary real
roster shape, not a contrived edge case): when Blaziken is already fielded on a boss's baseline
team and Blaziken is NOT the fielded team's weakest slot, the benched-Delphox substitution
targets the weakest OTHER slot, producing a team with BOTH Delphox and Blaziken flagged
`isMega: true`. `runTeamRaid` throws `"At most one team-raid slot may be flagged isMega... Got
2"`, which the move-change sweep surfaces as a graceful (no crash, no console error) "Could not
compute this sweep: ..." error banner — but the whole sweep fails for ANY roster with 2+
different mega-capable species where this substitution pattern occurs, which is common on a real
164-entry export. Confirmed this is BENCHED-path-specific (fielded-slot candidates never hit
it, since they only ever swap ONE existing slot's move, never its `isMega` flag). Did not attempt
a fix — `packages/engine` is out of my lane per this task's explicit instruction, and this needs
`engine-developer`'s own judgment on whether the fix belongs in the substitution logic itself
(skip/exclude a benched candidate whose `canMega` would collide with an already-fielded mega
elsewhere on the same team) or a `maxSecondsPerSlot`-style validation upstream. My own live
verification worked around it by using a small hand-built non-mega CSV subset instead of the full
sample.

## knownChargedMoveIds hand-entry + CSV wiring

New optional field on web's `RosterEntry` (import/pokeGenieMatch.ts), threaded through
`StoredRosterEntry`/dehydrate/hydrate (rosterPool.ts, `undefined` on an old stored pool is
already the correct "unknown" meaning — no `?? []` fallback needed, unlike the four
moveset-badge fields) and `toEngineRosterPool` (run/runRosterPlanner.ts).

**CSV import** (`buildRosterEntry`, pokeGenieMatch.ts): resolves `Charge Move 2` against the
species' own moveset the SAME way `Charge Move`/`Quick Move` already do (`resolveMoveByName`).
Key distinction from the primary-moveset "blank means not captured" rule this whole area is
built around: a BLANK `Charge Move 2` column is a DIFFERENT, more reliable signal — Poke Genie
genuinely records "no second move" as blank (most Pokémon never get one), so blank resolves to
`[chargedMoveId]` (one KNOWN move), not "unknown." A non-blank name that doesn't match the
species' moveset stays `undefined` (our data gap, never guessed).

**Hand-entry** (`RosterEntryForm.tsx`/`rosterEntryDraft.ts`): new `knowsSecondChargedMove`
checkbox + a second `MoveSelect` (its options list excludes whichever move the primary picker
currently resolves to, so the two pickers can never collide) — gated on
`species.chargedMoves.length >= 2` (forced off in `normalizeRosterEntryDraft` otherwise, same
pattern as the existing Shadow/Purified/canMega normalization). A hand-entered entry's charged
count is ALWAYS a real, confirmed fact per this file's own "always clean" convention — never
`undefined`.

## Verification

`npm run verify` fully green (test/typecheck/lint/check/build — 323 web tests, up from 308; lint
stayed at the pre-existing 1-warning baseline, added zero new ones, fixed a `react-hooks/
exhaustive-deps` warning I introduced along the way by depending on `run` rather than a fresh
`run?.data?.excluded ?? []`). `npm run test:e2e`: all 27 existing specs still pass against the
new build unmodified (didn't add a new spec this pass — the live verification was a throwaway
Playwright script per [[pattern_worktree_isolation_for_concurrent_session_verify]]'s sibling
technique, not a committed one; flagged as a gap if this area gets touched again).
`check-scenario-roundtrip`: still 152 fields (correctly unchanged — no new Scenario fields, an
existing pair gained a second consumer). Confirmed via `git status --porcelain packages/engine`
that zero engine files were touched throughout, including while diagnosing the mega bug (used a
throwaway vitest scratch file calling only the existing public API, never touched
rosterMoveChange.ts itself).
