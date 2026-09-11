# Future ideas

Not-yet-scheduled feature ideas, kept separate from `HANDOFF.md` (in-progress session state)
and `CLAUDE.md` (standing decisions). Barebones step lists only — expand into a real plan
before starting implementation. An idea promoted to a `PLAN_*.md` is a plan, not an idea:
leave the pointer here, but the plan file owns the detail from then on, and gets deleted once
the feature ships (see `CLAUDE.md`'s "For session continuity").

## Power-Up Optimizer — v1 SHIPPED 2026-09-08 (no login); what remains

_Researched by `pogo-researcher` 2026-09-07 (see that agent's memory,
`.claude/agent-memory/pogo-researcher/fact_powerup_cost_data_source.md` and
`proposal_powerup_optimizer_flesh_out.md`, for the original citations). The thesis it
established is now the sixth tab — see `CLAUDE.md`'s repo layout, `MECHANICS.md`'s
"Power-up (level-up) costs", and `HANDOFF.md`'s 2026-09-08 entry for what was built._

What v1 does: a 6-slot roster where every slot carries its OWN level/IVs, candy and XL on
hand, and Shadow/Purified/Lucky cost flags, plus one stardust budget. Every single-slot
power-up to every half-level up to 50 is re-simulated as a full Team Raid (paired seeds), and
ranked by **team-DPS gained per 1000 stardust and per candy as separate numbers** — resources
are not fungible for a real player, so they are never blended into one score. Each slot's
headline is the stardust/candy to its next floored per-hit damage breakpoint against the
chosen boss (`powerUpDamageLadder`), because a power-up that crosses no breakpoint buys
nothing. The cost table comes from GAME_MASTER's own `POKEMON_UPGRADE_SETTINGS` +
`LUCKY_POKEMON_SETTINGS` templates (pogoapi's endpoint turned out to be unnecessary),
interpreted only by the engine's `powerUpCostTableFromGameMaster`.

**Scope decision, settled 2026-09-10: there is no login and there will not be one.** The
Firebase/Firestore plan was deleted at the user's instruction. Cross-device transfer is a
self-contained copyable save code on the **Roster tab** (7th tab, shipped 2026-09-10), which now
owns the roster outright — hand-entry, CSV import, editing, save/load. This app stays a static
site with no backend and no accounts.

**Not a Teambuilding-Analyzer conflict**: one trainer's own roster, same single-trainer framing
as the Team Raid Simulator. Nothing here staggers megas across trainers.

Remaining ideas, in rough value order (none scheduled):

1. ~~**Login + roster persistence**~~ — **REMOVED 2026-09-10.** Superseded by the Roster tab's
   save code; no backend, no accounts. See above.
2. ~~**Multi-step plans**~~ — **DONE.** `planPowerUpBudget` (single-raid) and `planRosterBudget`
   (multi-raid) are exactly this: repeatedly take the best affordable candidate, re-baseline,
   repeat. Kept deliberately separate from the ranked table, which prices each candidate *as if
   it were the only purchase* — the two answer different questions and must not be merged.
3. **"Add a 7th" candidates.** Compare powering up an owned slot against replacing it with a
   hypothetical new catch at level 20/25 (raid catch levels) — the original idea's "5 + a
   hypothetical 6th" framing. Needs a roster-swap candidate type alongside the level-up one.
4. **Per-species cost overrides.** GAME_MASTER carries an Eternatus-only 30× candy override
   (`POKEMON_UPGRADE_OVERRIDE_SETTINGS_V0890_POKEMON_ETERNATUS`); v1 ignores it, so Eternatus
   candy costs are understated 30×. Small data-sync + engine change once a second such
   override appears or someone actually optimizes an Eternatus.
5. **Best Buddy +1 level** (`defaultCpBoostAdditionalLevel`) as a free, cost-less candidate.
6. **More iterations / a Web Worker.** 3 paired seeds keep the tab responsive but small deltas
   are still noisy; the Species Report's rejected-for-now worker idea applies here too.

## Unmodelled real mechanics

Real, recorded game mechanics this engine does **not** model. Each lives in `MECHANICS.md` with
sourcing and a "not modelled" note; this is the scheduling view. None is a bug.

**Four items were REMOVED from this list on 2026-09-10** on the user's instruction — *"if it cant
be modeled then remove it"*. They are not forgotten, only unscheduled: each remains in
`MECHANICS.md` as a dated record, so an anomalous result gets recognised instead of
re-investigated from scratch. Do not re-add them here without the specific evidence named below.

| Removed | Why it cannot be built | What would unblock it |
| :--- | :--- | :--- |
| Energy-driven boss cadence by default | The denominator of the boss's 50% charged-move roll has no source; ours is a reasoned inference. Re-attempted across four research rounds, most recently 2026-09-10. | A source establishing the denominator, ideally sanity-checked against a real raid log. |
| Dodge damage scaling with remaining HP | One Silph Road observation, flagged by its own authors as needing confirmation, with **no formula**. reddit.com and thesilphroad.com are both hard-blocked to this tooling — a ceiling, not a research gap. | A formula from any reachable source. |
| Super Mega Raids | Structurally group content: a fixed 7-10 shields with one break per trainer. Modelling it properly is multi-trainer, which is a standing-decision exclusion. | Nothing — this is a scope boundary, not missing evidence. The tier stays caveated. |
| The 0.5s combat cycle | Nothing is mis-timed: 0.5 is exactly representable on our finer 0.1s tick. There is no error to fix. | A demonstrated case where the finer tick produces a wrong result. |

Ordered by how much they'd change results, not by effort.

1. **Asymmetric move delay.** Fast moves apply their 1s/1.5s delay at the END of the animation;
   charged moves at the BEGINNING. So the fast move following a boss's charged move arrives
   quickly. All move durations are currently treated uniformly. This shifts the fine structure of
   when damage lands, which matters most for dodge timing.

2. **The 0.7s dodge window — RESOLVED 2026-09-10, nothing to build.** It is a different quantity
   from the first-party `dodgeDurationMs: 500` this engine models: 500 ms is the **invulnerability
   window once a dodge executes**, ~700 ms is the **human reaction window** to input one. This
   engine's dodge model is perfect-play and has no reaction window to attach it to. The adjacent
   per-move `damageWindowStartMs`/`EndMs` idea was separately chased and **rejected on the
   merits** — since the Sept 2024 rework raid damage lands on regular 0.5s intervals and no longer
   observes those timers, so `vulnerableWindowSeconds = durationSeconds` is correct, not a
   placeholder. Do not reopen either without a contradicting source.

3. **The friendship attack bonus (3/5/7/10/12%).** A real raid multiplier, confirmed first-party,
   currently inert in `damage.ts` behind a `bestBuddy` field that is never set and a code comment
   that has the raid/PvP scope backwards. Single-trainer-scoped like weather — **not** a team-boost
   mechanic. Fix the wrong comment regardless of whether the feature ships.

Standing caveat: this sourcing is ~2 years old and Niantic re-tunes raid internals without notice.
Re-verify before building on any of it.

---

## Deferred from the multi-raid roster optimizer (2026-09-09)

Each of these was scoped, deliberately not built, and is written down so it isn't rediscovered
as a bug. Nothing here is committed work.

9. **"Evolve, then power up to L" as a single priced candidate.** The roster planner currently
   *excludes* an unevolved entry and says "evolve first (into X)" — correct advice, but it can't
   rank a cheap unevolved Pokémon that would be excellent once evolved. Pricing it needs
   per-species evolution candy costs; GAME_MASTER already carries them per branch
   (`candyCost`/`candyCostPurified`) but data-sync doesn't normalize them yet. See MECHANICS.md,
   "Evolution: candy-only".

10. **Second charged move unlock as a budget-candidate type.** It draws on the *same* stardust
    and candy the planner allocates and is often a better team-DPS-per-stardust buy than several
    half-levels, so a plan that prices only power-ups can recommend the wrong purchase. Costs and
    the Purified **×0.8** trap (not ×0.9) are recorded in MECHANICS.md.

11. **A "best available moveset" toggle.** 60% of a real Poke Genie export has no recorded
    charged move, so those entries simulate on `chargedMoves[0]` and are under-ranked even when a
    cheap TM would fix it. Correct for "what should I power up", wrong for "what should I invest
    in" — a toggle, not a default change.

12. **Re-selecting a different six after a wipe.** `runTeamRaid` models the wipe/revive cost but
    always re-fields the same roster; a real trainer with 164 Pokémon returns to the lobby and
    picks a fresh six, with no documented cap on repeats. Newly meaningful only at pool scale.
    **This is not the ruled-out Teambuilding Analyzer** — that exclusion is about *multi-trainer*
    mega staggering across a lobby; this is one trainer sequentially re-selecting from their own
    roster, the same framing the Team Raid Simulator already uses. Read this before dismissing it.

13. **Real per-boss progress for the multi-raid sweep.** The worker reports coarse
    running/done/failed plus elapsed time; genuine progress needs an `onProgress` hook inside
    `packages/engine/src/rosterPlanner.ts` (an `engine-developer` change). Deliberately not faked
    with a percentage that doesn't track real work.

14. **`TeamRaidInputs` has no `bossMaxHpOverride`**, unlike `SustainedComparisonInputs`. So an
    archived boss carrying a real recorded `eraHp` is cleared against today's tier HP inside
    `runTeamRaid`'s own clear-timer detection. Harmless while the multi-raid sweep defaults to
    currently-active bosses; it bites as soon as past bosses are routinely swept.

15. **Shadow forms exist only for species that have been shadow *raid bosses*.** 108 shadow
    entries today, and exactly one Alolan one (Shadow Sandslash). Shadow Alolan Sandshrew — the
    case the user raised on 2026-09-09 — is a Team GO Rocket **grunt** shadow, so nothing in the
    synthesis chain (raidHistory, Pokebattler `_SHADOW_LEGACY`, Bulbapedia's Shadow Raid page)
    can ever produce it. That is arguably correct for a boss list and wrong for the *attacker*
    picker and the Poke Genie import, where a user's grunt-caught shadow has no entry to match.
    Widening the synthesis to grunt shadows needs its own evidence anchor — CLAUDE.md's standing
    decision deliberately anchors shadows on recorded evidence, not on the live feed alone, so
    this is a scope change to make deliberately rather than a bug to patch.

16. **Two tabs now model "show advanced assumptions" two different ways.** The Comparator's
    `showDetailedAssumptions` is a real field on the engine's `Scenario` (added 2026-09-10); Team
    Raid's identically-named field is a `packages/web`-only bolt-on on `TeamScenarioWithShadow`,
    because `TeamScenario` in the engine never got one — its own comment says folding it in
    properly was left as `engine-developer`'s call. Neither is broken and both round-trip, so this
    is tidying, not a bug. Reconcile in one direction deliberately rather than letting a third tab
    pick a third pattern.

17. **DONE (2026-09-10).** Shadow Raid enrage is now modelled — see MECHANICS.md's "Shadow raids"
    section ("Enrage: implemented 2026-09-10") and `packages/engine/src/shadow.ts`'s
    `shadowEnragePhaseForHpFraction`/`shadowEnragedStats`, threaded through `simulate.ts`'s
    `StepwiseBoss.enrage`. No `Scenario` field added, as planned — it's a computed fact inside the
    simulation. Any UI surfacing of the new `enragedAtSeconds`/`subduedAtSeconds`/
    `enragedAtRaidSeconds`/`subduedAtRaidSeconds` fields is still open (`web-developer`'s call).

18. **The boss-moveset sweep never reaches the Team Raid Simulator.**
    `compareAcrossBossChargedMoves` exists but is wired only into the Comparator
    (`BossMovesetSweep.tsx`); `runTeamRaid.ts` and `runPowerUpOptimizer.ts` each resolve exactly
    one fixed `bossChargedMoveId`. So "does my roster clear this boss" is silently conditional on
    which charged move the boss rolled — a hidden conditional conclusion, on the highest-stakes
    tab. Engine primitive already exists; needs its own presentation rather than a copy of the
    Comparator's, since Team Raid's result shape (clear/no-clear + revive count) differs from
    paired cards. **Scope to Team Raid only** — on the multi-raid sweep the cost multiplies over
    ~13 bosses × 200 sims for a smaller payoff.

19. **Party-size ranking-flip breakpoint on the Comparator.** `rankingFlip.ts` sweeps *time* to
    find a crossing at a fixed party size; nothing sweeps *party size itself*, though `partySize`
    is a plain scenario field. The user did precisely this by hand before the tool existed
    ("for FOUR teammates specifically… group size of 5"). Same crossing-detection shape, new
    axis, no new modelling. `pogo-player`'s top pick, and `hardcore-spender`'s too.

20. **Surface the own-charged-move-cast vulnerability cost as its own line.** The engine already
    computes it (`HOLD_CHARGED_MOVE_DODGE_ATTEMPTS × DODGE_COST_SECONDS`) but folds it into the
    aggregate survivability number. The user named this gap unprompted in 2026-09-04 and excluded
    it from their own hand-calc. **Only worth building if labelled as the unsourced placeholder it
    is** — MECHANICS.md still has it as an open question, and this user distrusts numbers whose
    error-bias direction they can't judge.

21. **Dodge-execution-error sensitivity** — a swept "what if I miss N% of my dodges". The dodge
    setting chooses *which* attacks to attempt and models no miss chance at all. Precedent: the
    same user chose a nonzero wipe-and-rejoin default explicitly "to allow user error".

22. **APPROVED 2026-09-10 — use the first-party 1.0s swap cost.** The user chose the sourced
    value over the previously-shipped 0.5s. Engine default is currently `0`, web defaults `0.5`;
    both become **1.0**. Expect the Team Raid default's clear time to lengthen (~12-13 swaps on
    the shipped default roster, so roughly +6s against a 19.6s margin) — that is the fix working,
    not a regression. Re-measure and re-record the default's numbers in `TeamRaidView.tsx`.

    Background — **both original blockers are gone.** `swapDurationMs: 1000` is now `[first-party]`
    (`BATTLE_SETTINGS`, 2026-09-09), so the stated reason for defaulting `swapCostSeconds` to 0
    ("no official value known") is simply false. The *second* objection — that turning it on
    re-baselines every existing shared link — also no longer applies, since backward link
    compatibility was dropped 2026-09-10. Both blockers are gone; this is now a decision, not
    research. It matters beyond fidelity: real per-swap friction changes the tradeoff between a
    few strong Pokémon (fewer faints, fewer swaps) and many mediocre ones.

**Rejected, deliberately, so they don't get re-proposed:** an event-worth-attending calculator
(needs calendar data this tool doesn't ingest — different product); anything multi-trainer;
and **Mega Energy as an investment currency** for Super Max progression — it would rest on two
stacked `[unverified]` numbers (the CP bump and the "+10%/tier" curve), which repeats in miniature
the fabricated-stats failure this project was already burned by.
