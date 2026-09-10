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

**Scope decision, restated:** the user chose to prototype WITHOUT login first (2026-09-08),
reversing the 2026-09-07 "login before the optimizer" sequencing. The roster round-trips
through the `pu` query param like every other tab. Real persistence is still
[`PLAN_login_and_roster_persistence.md`](PLAN_login_and_roster_persistence.md) — unchanged,
still pending, and now purely additive on top of a working tab ("remember my roster" rather
than "share a link").

**Not a Teambuilding-Analyzer conflict**: one trainer's own roster, same single-trainer framing
as the Team Raid Simulator. Nothing here staggers megas across trainers.

Remaining ideas, in rough value order (none scheduled):

1. **Login + roster persistence** — the plan above. Signed-out must stay fully functional.
2. **Multi-step plans.** v1 ranks single-slot power-ups only. A greedy "spend this whole budget"
   plan (repeatedly take the best affordable candidate, re-baseline, repeat) is the obvious
   next step and needs no new engine primitive — `optimizePowerUps` already returns the
   re-baselined summary per candidate.
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

Each of these is a real, recorded game mechanic this engine does **not** model. They live in
`MECHANICS.md` with sourcing and a "not modelled" note; this is the scheduling view of the same
list. None is a bug — each is a deliberate, dated gap.

Ordered by how much they'd change results, not by effort.

1. **Turn the energy-driven boss cadence on by default.** Already built and shipped behind a
   toggle (`bossChargedMoveCadence`), off by default. Flipping it costs nothing to implement —
   the blocker is evidential, not technical. What would need to be true first: the denominator of
   the boss's 50% charged-move roll established from a source (ours is a reasoned inference), and
   ideally the ~15-34% survival impact sanity-checked against a real raid log. See
   `MECHANICS.md`'s "OPEN QUESTION" section. Do not flip it just because it is more faithful in
   principle — that silently re-baselines every number and every previously-shared link.

2. **Asymmetric move delay.** Fast moves apply their 1s/1.5s delay at the END of the animation;
   charged moves apply it at the BEGINNING. So the fast move following a boss's charged move
   arrives quickly. Currently all move durations are treated uniformly. This shifts the fine
   structure of when damage lands, which matters most for dodge timing.

3. **The 0.7s dodge window** — and a per-move damage-window idea that was investigated and
   **closed**. Dodge damage (0.25) and its 0.5s cost are both confirmed first-party now; the
   ~0.7s window itself is still unmodelled and unsourced. The tempting adjacent idea — extracting
   the per-move `damageWindowStartMs`/`damageWindowEndMs` fields that 399 of 403 GAME_MASTER move
   templates carry — was chased down on 2026-09-09 and **rejected on the merits**: since the Sept
   2024 rework, raid damage lands on regular 0.5s intervals and no longer observes those timers.
   The engine setting `vulnerableWindowSeconds = durationSeconds` is therefore correct, not a
   placeholder. See `MECHANICS.md`'s Dodging entry. Do not reopen without a contradicting source.

4. **Dodge damage may scale with remaining HP.** Silph Road observed a player surviving 8 dodged
   Paybacks where 4-5 was expected. They flag it as needing confirmation and have no formula.
   **Do not implement until confirmed** — it is recorded so anomalous survivability reports are
   recognised rather than re-investigated from scratch.

5. **The 0.5s combat cycle.** Since the Sept 2024 rework the real game runs on 0.5s cycles; our
   simulator uses a finer 0.1s tick. Nothing is mis-timed (0.5 is representable at 0.1), but the
   engine permits event boundaries the real game would snap. No known error from this today.

6. **A real 1.0s Pokémon swap cost.** `BATTLE_SETTINGS.swapDurationMs = 1000`, first-party
   (2026-09-09). `teamRaid.ts` defaults `swapCostSeconds` to `0` because no official value was
   known to exist; one does now. Changing the default re-baselines every shared Team Raid link,
   so it needs a deliberate call. Still open: whether it applies to faint-triggered auto-swaps,
   manual swaps, or both.

7. **The friendship attack bonus (3/5/7/10/12%).** A real raid multiplier, confirmed first-party,
   currently inert in `damage.ts` behind a `bestBuddy` field that is never set and a code comment
   that has the raid/PvP scope backwards. Wiring it up means a new `Scenario` assumption
   (`add-scenario-assumption`), and it is single-trainer-scoped like weather — not a team-boost
   mechanic. Fix the wrong comment regardless of whether the feature is built.

8. **Super Mega Raids may not belong in a single-trainer tool at all.** A fixed 7-10 shields per
   boss, one break per trainer, and a reported 8-10 trainer minimum make this tier structurally
   group content: every other `RaidTier` can in principle be soloed given enough time, this one
   cannot. (Note the client does *not* mark it in-person-only — `RAID_LEVEL_4/5_MEGA_ENHANCED` are
   absent from `unsupportedRemoteRaidLevels`, so Super Mega Raids do support remote play. It is
   the shield rule that forces a crowd, not the lobby rules.) The honest options are excluding or
   caveating the tier, not modelling the shield phase — and the engine currently applies one flat
   multiplier for the whole fight, so it simulates the tier as materially easier than it really
   is. A product call, not a bug fix.

Standing caveat for all of the above: the sourcing is ~2 years old and Niantic re-tunes raid
internals without notice. Re-verify before building on any of it.

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
