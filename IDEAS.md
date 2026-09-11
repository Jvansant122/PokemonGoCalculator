# Future ideas

Not-yet-scheduled feature ideas, kept separate from `HANDOFF.md` (in-progress session state)
and `CLAUDE.md` (standing decisions). Barebones step lists only — expand into a real plan
before starting implementation. An idea promoted to a `PLAN_*.md` is a plan, not an idea:
leave the pointer here, but the plan file owns the detail from then on, and gets deleted once
the feature ships (see `CLAUDE.md`'s "For session continuity").

**Numbering is stable and permanent.** Items are never renumbered when one ships, because agent
memory, commit messages and `MECHANICS.md` all cite them by number (`IDEAS #13`). A shipped item
moves to the "Shipped" table at the bottom keeping its number, and the gap it leaves stays.

⚠️ **A stale entry here causes real wasted work.** On 2026-09-10 this file still said the
multi-raid sweep ran 3 paired seeds; it had been raised to 20 in an earlier session and nobody
updated the line, so an agent was briefed to "raise it from 3" and spent its budget discovering
the premise was false. Mark an item shipped in the same pass that ships it.

## Open

### 5. Best Buddy as a cost-less candidate — SINGLE-RAID SHIPPED, ROSTER MODE OPEN

**Single-raid mode shipped 2026-09-11.** `PowerUpOptimizerResult.bestBuddyCandidates` (one per
fielded slot, cost/efficiency fields **absent from the type**, not null — a zero-cost candidate
divides by zero on both of the tab's axes) and `PowerUpBudgetPlan.bestBuddyRecommendation`
(`| null`, never an array, so the real one-Best-Buddy-per-trainer limit is structural). Both have
UI. A pre-existing bug was found and fixed in passing: `toTeamRaidSlots` silently dropped
`isBestBuddy`, the same shape as an earlier `megaLevel` gap — latent only, since no UI set it.

**Roster/multi-raid mode is NOT built**, scoped out deliberately by `engine-developer`:
`RosterEntry` has no `isBestBuddy` field, and pricing it correctly needs the same
aggregate-across-bosses machinery `RosterPowerUpCandidate` uses. That is a materially bigger
change, not a copy of the single-raid path. The tab tells a multi-raid user this is single-raid
only rather than rendering an empty section.

⚠️ **Measured caveat worth knowing before investing more here.** On the default scenario every
Best Buddy candidate came back *inside* the noise floor (±0.73 team DPS at 20 seeds; best observed
gain +0.49). That is an honest result, not a wiring failure — a single +1 effective level is a
small effect, and it shrinks further at level 50. The feature reports "≈0 (within noise)" rather
than a fake signed number, which is correct, but it means the roster-mode build may buy very
little. Measure before scheduling it.

⚠️ Best Buddy is a **per-Pokémon, one-at-a-time** status in the real game — a roster cannot hold
six of them simultaneously. Any future joint-plan work must keep that constraint structural.

### 24. Frustration notice — BUILT 2026-09-11, but structurally UNREACHABLE with real data

Engine (`tmMove.ts`'s `frustrationLockNotice`, `RosterMoveChangeResult.frustrationNotices`) and UI
both shipped, both tested, and the UI renders correctly when handed a Frustration-holding entry.
**No real user workflow can produce one.**

Verified 2026-09-11 against the committed data: `FRUSTRATION` and `RETURN` exist in GAME_MASTER's
move list, but **zero of 1750 species** carry either in `chargedMoves` — including all 520 shadow
entries. The real game assigns Frustration *dynamically* to a freshly-caught unpurified Shadow; it
is never part of a species' static movepool, which is the only thing this pipeline reads. Both
routes into an entry's `chargedMoveId` (the Poke Genie CSV matcher and the Roster tab's
`MoveSelect`) can only resolve a move that is actually in `species.chargedMoves`, so neither can
ever yield one.

**This is a data-layer question, and there is a strong candidate answer already in hand.** The
`shadow` block captured during the #15 widening carries first-party `shadowChargeMove:
"FRUSTRATION"` / `purifiedChargeMove: "RETURN"` per species — i.e. GAME_MASTER itself states that
an unpurified Shadow holds Frustration. Options, needing a deliberate call:

1. Add Frustration/Return to shadow species' movepools so the CSV matcher can resolve them.
   ⚠️ Blast radius: they become selectable in every move picker and simulatable everywhere. Their
   real stats are recorded (Frustration 10 power / 2000 ms), so a simulation would be *correct*,
   just showing a deliberately terrible move. `tmMove.ts` already refuses to TM them.
2. Annotate at import/hand-entry instead ("this Shadow may still hold Frustration"), leaving
   movepools untouched. Weaker, but zero blast radius.
3. Leave it. The code is harmless and already correct if the data ever changes.

✅ **CONFIRMED 2026-09-11 — this is a live, already-visible defect, not a hypothesis.** An earlier
version of this entry called the consequence "suspected, not yet confirmed" and said to check a
real export first. That check is unnecessary: the committed real Poke Genie export
(`packages/web/src/import/test/pokeGenieSample.csv`, row 20) already carries a **Purified** Alolan
Raticate whose `Charge Move` column reads literally `Return`. Our matcher cannot resolve it, so the
row falls back to the species' first charged move (`CRUNCH`), sets `movesetIsDefaulted`, and reports
`Return` in `unmatchedMoveNames` — earning the **"unrecognised"** badge, which by its own definition
means "our data gap, not the player's problem". This is pinned by two already-passing tests in
`pokeGenieMatch.test.ts` (~lines 243 and 383), so it has been true and visible since the import
shipped.

The Frustration/Shadow half runs the identical code path and will behave identically; no shadow row
exists in the sample export to demonstrate it directly, but nothing about the mechanism differs.
**So the decision below no longer has a confirmation step in front of it** — pick an option. Note
that option 1 would fix the Return case too (a Purified Pokémon's real charged move IS Return), and
that a defaulted moveset silently changes which move the whole simulation runs, so this is a
correctness issue on that row, not only a cosmetic badge.

## Unmodelled real mechanics

Real, recorded game mechanics this engine does **not** model. Each lives in `MECHANICS.md` with
sourcing and a "not modelled" note; this is the scheduling view. None is a bug.

**Five items were REMOVED from this list on 2026-09-10** on the user's instruction — *"if it cant
be modeled then remove it"*. They are not forgotten, only unscheduled: each remains in
`MECHANICS.md` as a dated record, so an anomalous result gets recognised instead of
re-investigated from scratch. Do not re-add them here without the specific evidence named below.

| Removed | Why it cannot be built | What would unblock it |
| :--- | :--- | :--- |
| Energy-driven boss cadence by default | The denominator of the boss's 50% charged-move roll has no source; ours is a reasoned inference. Re-attempted across four research rounds, most recently 2026-09-10. | A source establishing the denominator, ideally sanity-checked against a real raid log. See `LINKS.md` #4. |
| Dodge damage scaling with remaining HP | One Silph Road observation, flagged by its own authors as needing confirmation, with **no formula**. reddit.com and thesilphroad.com are both hard-blocked to this tooling — a ceiling, not a research gap. | A formula from any reachable source. See `LINKS.md` #2. |
| Super Mega Raids | Structurally group content: a fixed 7-10 shields with one break per trainer. Modelling it properly is multi-trainer, which is a standing-decision exclusion. | Nothing — this is a scope boundary, not missing evidence. The tier stays caveated. |
| The 0.5s combat cycle | Nothing is mis-timed: 0.5 is exactly representable on our finer 0.1s tick. There is no error to fix. | A demonstrated case where the finer tick produces a wrong result. |
| Asymmetric move delay | `MECHANICS.md`'s "Move delay is applied at different ends" entry has **no reliability tag and no traceable source** — unique among every other entry in that file, which follows a strict "cite, don't assert" rule. `engine-developer` checked before implementing, per that task's own instruction, and declined; the entry is now flagged `[UNCITED]` rather than presented as settled. A fidelity change here would move the fine timing of every dodge/breakpoint interaction, which needs to be right, not just "more faithful in principle." | A real source meeting this file's own bar, ideally with the rigor of the adjacent (resolved) damage-window entry. |

**The 0.7s dodge window is RESOLVED — nothing to build** (2026-09-10). It is a different quantity
from the first-party `dodgeDurationMs: 500` this engine models: 500 ms is the **invulnerability
window once a dodge executes**, ~700 ms is the **human reaction window** to input one. This
engine's dodge model is perfect-play and has no reaction window to attach it to. The adjacent
per-move `damageWindowStartMs`/`EndMs` idea was separately chased and **rejected on the merits** —
since the Sept 2024 rework, raid damage lands on regular 0.5s intervals and no longer observes
those timers, so `vulnerableWindowSeconds = durationSeconds` is correct, not a placeholder. Do not
reopen either without a contradicting source.

Standing caveat: this sourcing is ~2 years old and Niantic re-tunes raid internals without notice.
Re-verify before building on any of it.

## Rejected

Moved to **`REJECTED_IDEAS.md`** (2026-09-11), which owns this lane now. Every entry there means
"do not build this", and the file explains why each was declined.

Do not re-add a rejected item here. The distinction the two files keep apart: an item **blocked**
on evidence stays in this file (a source arriving makes it live again), while an item **rejected**
on the merits is not rescued by evidence. The "Unmodelled real mechanics" table above is blocked,
not rejected.

## Shipped

Kept with their original numbers so existing citations keep resolving. The implementation is
described in `HANDOFF.md` and git history, and any *mechanic* it established is in `MECHANICS.md`
— this table is only an index, and should not grow explanatory detail.

| # | Idea | Outcome |
| :--- | :--- | :--- |
| 1 | Login + roster persistence | **Not shipped — removed 2026-09-10.** Superseded by the Roster tab's self-contained save code; no backend, no accounts, and none coming. |
| 2 | Multi-step plans | `planPowerUpBudget` (single-raid) + `planRosterBudget` (multi-raid). Kept deliberately separate from the ranked table, which prices each candidate *as if it were the only purchase* — two different questions, never merged. |
| 3 | "Add a 7th" hypothetical-catch candidates | 2026-09-10. Its own array, never folded into `slots`, and structurally unable to reach the budget allocator — a fresh catch has no ledger cost. |
| 4 | Per-species cost overrides | 2026-09-10. The engine interprets each into its own `PowerUpCostTable`; Eternatus L30→50 goes from 182 to 6,320 candy. The raw records had shipped a day earlier with nothing reading them — see `MECHANICS.md`'s "Per-species cost overrides" for that lesson. |
| 6 | More iterations / a Web Worker | Worker shipped 2026-09-09. Iterations **measured and deliberately left at 20** (2026-09-10): 20→100 costs ~553ms→~2643ms to move a marginal candidate's stdev 0.107→0.026, which the existing noise floor already absorbs. |
| 9 | "Evolve, then power up" as one priced candidate | Engine 2026-09-10, including gated branches kept in a separate `gatedEvolutions` array so `evolutionEndpoints` stays the candy-only walker. |
| 10 | Second charged move as a budget-candidate type | Engine 2026-09-10 (`tmMove.ts`, `rosterMoveChange.ts`). ⚠️ Purified is **×0.8** here, not the ×0.9 the power-up table uses. |
| 11 | A "best available moveset" toggle | 2026-09-10, `runRosterPlanner.ts`'s `useBestAvailableMoveset`, defaulting **off** — correct for "what should I power up", wrong for "what should I invest in". |
| 12 | Re-selecting a different six after a wipe | Engine hook 2026-09-10; web heuristic + toggle the same day. The engine deliberately implements no selection strategy — it has no I/O and does not own a roster pool. |
| 13 | Real per-boss progress for the multi-raid sweep | 2026-09-10. Per-stage sentences from engine-reported completed work; **never a fabricated combined percentage**. |
| 14 | `TeamRaidInputs.bossMaxHpOverride` | 2026-09-10, wired to a real recorded `eraHp` for past bosses (verified live: a recorded Abra encounter at 600 HP, not today's 3,600). |
| 16 | Two tabs modelled "show advanced assumptions" two ways | 2026-09-10. `TeamScenario` carries the real required field; the web-side local bolt-on is gone. |
| 17 | Shadow Raid enrage | Engine 2026-09-10, UI 2026-09-11 (#17b). Comparator shows the per-run clock, Team Raid the raid-global one — two different clocks, deliberately not interchangeable. Surfacing it exposed a real engine bug: `enragePhase` initialized to `"normal"` regardless of `damageDealtBeforeFight`, so every team-raid slot after the first re-reported a bogus enrage at its own tick 0 (14 of 14 slots non-null; one real). Fixed, and a pinned test that had been enshrining the bug corrected from `0.1` to `null`. |
| 23 | Own-charged-move-cast cost on Team Raid | 2026-09-11. `TeamRaidSlotResult` gained the per-fight fields the Comparator already had; summed across the encounter. Still badged as the unsourced placeholder it is — appearing on a second tab does not make it better sourced. |
| 18 | The boss-moveset sweep on the Team Raid Simulator | 2026-09-10, as a headline callout keyed on whether the *verdict* varies, not a copy of the Comparator's table. Scoped to Team Raid only; on the ~13-boss multi-raid sweep the cost multiplies for a smaller payoff. **Widened 2026-09-11** from charged-moves-only to the full fast × charged cartesian product, on both tabs — a real instance rolls BOTH moves, and the fast move drives chip damage and the boss's energy/cadence. Measured: varying only the fast move moved one candidate 207 → 283. Team Raid had its own hand-rolled loop whose inputs builder took no fast move, so widening the loop alone would have been a silent no-op. |
| 19 | Party-size ranking-flip breakpoint | 2026-09-10, reusing the engine's `findCrossoverPartySize`, which already existed, was tested, and had **zero call sites**. |
| 20 | Own-charged-move-cast vulnerability cost | Comparator 2026-09-10, badged as the unsourced placeholder it is. **Team Raid half still open — see #23 above.** |
| 21 | Dodge-execution-error sensitivity band | 2026-09-10. A band across 50-100% accuracy, never one blended number. |
| 22 | The first-party 1.0s swap cost | 2026-09-10. Replaced the shipped 0.5s; the Team Raid default's clear time lengthening is the fix working, not a regression. |
| 15 | Shadow forms exist only for species that have been shadow *raid bosses* | 2026-09-11. Widened, not blocked — GAME_MASTER's own per-template `shadow` block is a first-party anchor (stronger than a raid archive) that raidHistory/Pokebattler/Bulbapedia structurally can't see, since a grunt-only shadow (Shadow Alolan Sandshrew) never raids. See `MECHANICS.md`'s "Which species can be Shadow at all" and `CLAUDE.md`'s shadow-synthesis standing decision. |
