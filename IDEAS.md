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

### 5. Best Buddy as a cost-less Power-Up Optimizer candidate

Best Buddy's +1 effective level (`defaultCpBoostAdditionalLevel`) is modelled in the engine
(`megaLevel.ts`'s `effectiveLevelForBestBuddy`) and is a live control on the **Comparator**
(per-candidate) and **Team Raid** (per-slot) as of 2026-09-10. It is deliberately **not** in the
Power-Up Optimizer, where it would be a different thing: not a setting but a *candidate* — a free
+1 level competing against paid half-levels in the ranked table and the budget plan.

That is the interesting version, because it costs no stardust and no candy at all, so it cannot be
ranked on either of the tab's two axes. It needs its own presentation ("free, if you walk it"),
not a row with a divide-by-zero efficiency score.

⚠️ Best Buddy is a **per-Pokémon, one-at-a-time** status in the real game — a roster cannot hold
six of them simultaneously. A plan recommending Best Buddy for several slots at once would be
unachievable, which is the trap to design around.

### 15. Shadow forms exist only for species that have been shadow *raid bosses*

108 shadow entries today, and exactly one Alolan one (Shadow Sandslash). Shadow Alolan Sandshrew —
the case the user raised on 2026-09-09 — is a Team GO Rocket **grunt** shadow, so nothing in the
synthesis chain (raidHistory, Pokebattler `_SHADOW_LEGACY`, Bulbapedia's Shadow Raid page) can
ever produce it. That is arguably correct for a boss list and wrong for the *attacker* picker and
the Poke Genie import, where a user's grunt-caught shadow has no entry to match.

**Blocked on a scope call from the user, not on evidence or effort.** `CLAUDE.md`'s standing
decision deliberately anchors shadows on recorded evidence rather than on the live feed, so
widening synthesis to grunt shadows needs its own evidence anchor and is a scope change to make
deliberately. Ask before building.

### 17b. Surface Shadow Raid enrage timings in the UI

The mechanic itself shipped 2026-09-10 (`shadow.ts`, threaded through `simulate.ts`), and
correctly added no `Scenario` field — enrage is a computed fact inside the simulation, not a
setting. But `enragedAtSeconds` / `subduedAtSeconds` / `enragedAtRaidSeconds` /
`subduedAtRaidSeconds` are read by **no tab**, verified 2026-09-10.

This is the smallest remaining instance of the recurring orphan pattern: the engine computes it,
the fields exist, nothing renders it. Worth doing precisely because it is cheap — a shadow raid's
difficulty is concentrated in the enrage phase, and a clear time that hides *when* the boss
enraged is a number without its explanation.

### 23. Own-charged-move-cast cost on the Team Raid tab

The Comparator surfaces this (shipped 2026-09-10, badged as the unsourced placeholder it is), but
`TeamRaidSlotResult` carries **no per-fight equivalent field** — flagged by `web-developer` while
building the Comparator half. Needs an `engine-developer` change first; it is not a UI-only task.

Still gated on the same caveat: the underlying per-cast dodge cost rests on an unsourced
assumption (`MECHANICS.md`'s OPEN QUESTION entry), and surfacing a number is not sourcing it.

### 24. Frustration: an informational "can't fix this yet" label

`PLAN_tm_move_change_optimizer.md` asked for this, and it is the one part of that plan NOT
shipped (2026-09-11). The engine excludes Frustration and Return from TM candidates
**unconditionally** — correct and deliberate, because no live "is a Taken Over event on right now"
check may ever exist (it would make a share link's answer depend on when it is opened). But the
exclusion is currently **silent at the move level**: a shadow holding Frustration still generates
second-charged-move candidates, and nothing anywhere says its existing charged move is stuck.

What's wanted is a **static** label on such an entry — "only removable during a Taken Over event"
— never a live event check. Small, purely informational, and it closes the plan's last clause.

Note the entry-level exclusion list (`moveChangeEligibilityReason` in `rosterMoveChange.ts`)
currently covers only a defaulted moveset and Smeargle, so this needs its own path rather than
another reason string there.

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

## Rejected, deliberately, so they don't get re-proposed

- **An event-worth-attending calculator** — needs calendar data this tool doesn't ingest. A
  different product.
- **Anything multi-trainer**, including mega staggering across a raid lobby. See `CLAUDE.md`'s
  standing decision, which distinguishes this from the single-trainer lineup builder that *was*
  approved. Most likely to be re-proposed during ideation; flag it rather than building toward it.
- **Mega Energy as an investment currency** for Super Max progression — it would rest on two
  stacked `[unverified]` numbers (the CP bump and the "+10%/tier" curve), repeating in miniature
  the fabricated-stats failure this project was already burned by. `LINKS.md` #1 is what would
  unblock the curve.
- **Regular-TM ranking as a single score** — the reroll is random over a pool whose size varies
  per species, and the distribution has never been confirmed uniform (`LINKS.md` #3). If ever
  built, it must show a [worst, expected, best] band, never one blended number.

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
| 17 | Shadow Raid enrage | Engine 2026-09-10. **UI half still open — see #17b above.** |
| 18 | The boss-moveset sweep on the Team Raid Simulator | 2026-09-10, as a headline callout keyed on whether the *verdict* varies, not a copy of the Comparator's table. Scoped to Team Raid only; on the ~13-boss multi-raid sweep the cost multiplies for a smaller payoff. |
| 19 | Party-size ranking-flip breakpoint | 2026-09-10, reusing the engine's `findCrossoverPartySize`, which already existed, was tested, and had **zero call sites**. |
| 20 | Own-charged-move-cast vulnerability cost | Comparator 2026-09-10, badged as the unsourced placeholder it is. **Team Raid half still open — see #23 above.** |
| 21 | Dodge-execution-error sensitivity band | 2026-09-10. A band across 50-100% accuracy, never one blended number. |
| 22 | The first-party 1.0s swap cost | 2026-09-10. Replaced the shipped 0.5s; the Team Raid default's clear time lengthening is the fix working, not a regression. |
