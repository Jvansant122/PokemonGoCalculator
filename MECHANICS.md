# Real Pokémon GO mechanics

A durable record of how the real game behaves, so this project's engine can be
checked against reality instead of against its own assumptions.

**Read this alongside the code, not instead of it.** Every entry says what the
game does, where that came from, and — the part that matters — **what this
engine currently does about it**. A mechanic we deliberately don't model is
recorded here as such, so the gap stays a known, dated decision rather than
something rediscovered later as a bug.

## How to use this file

- **Cite, don't assert.** Every figure needs a source and a date. This project
  deleted four hand-authored fixtures over invented data; an unsourced constant
  here is that same failure in documentation form.
- **Reliability tags** follow the convention the code comments already use:
  `[first-party]` (Niantic), `[community-consensus]` (multiple independent
  community sources agreeing), `[unverified]` (single source, or contested).
- **Mechanics change.** Niantic reworks raid internals without notice, so every
  entry is dated. An old date is not automatically wrong, but it *is* a reason
  to re-verify before building something new on it.

---

## Combat formulas

### Damage

`floor(0.5 * power * (attack / defense) * STAB * typeEffectiveness * weather * friendship * megaBoost) + 1`

**Engine: implemented** (`damage.ts`). Verified 2026-09-08.

### Effective stats

`HP = floor((baseStamina + IV) * CPM)`. Attack and Defense are **not** floored
in the real game — they are used unrounded in the damage formula.

**Engine: diverges.** `stats.ts` floors all three. Measured 2026-09-08: ±1
damage on ~1% of matchups, not systematically biased (flooring defense raises
damage, flooring attack lowers it). Accepted as a known precision limit (user
decision, 2026-09-08) — see `AUDIT_2026-09-08.md` finding 3.

### Modifiers

STAB 1.2 · weather 1.2 · mega/primal boost 1.3 · shadow attack 1.2, shadow
defense 5/6 · dodge reduces damage to 0.25 · energy gained from damage taken =
0.5 per HP. **Engine: all implemented and verified 2026-09-08.**

The mega/primal `1.3` is load-bearing — a real conclusion in this project flips
at `1.1`. Never treat it as a tuning knob.

### Weather: the 1.2x is combat, the "+5 levels" is NOT

`WEATHER_BONUS_SETTINGS` (GAME_MASTER, 2026-09-09, `[first-party]`) settles a
conflation the community makes constantly, by carrying the two effects as two
unrelated fields:

| Field | Value | What it governs |
| :--- | ---: | :--- |
| `attackBonusMultiplier` | 1.2 | **combat damage** |
| `cpBaseLevelBonus` | 5 | wild encounter level (+5) |
| `guaranteedIndividualValues` | 4 | wild weather-boosted IV floor |
| `raidEncounterCpBaseLevelBonus` | 5 | raid catch level: 20 → **25** |
| `raidEncounterGuaranteedIndividualValues` | 10 | raid catch IV floor **10/10/10** |
| `stardustBonusMultiplier` | 1.25 | catch stardust |

**The "+5 effective levels" never touches a battle.** It raises the level of
the Pokémon you *encounter and catch*, and nothing else — there is no in-battle
stat change for either side. A Pokémon you already own cannot change level
mid-fight, and a raid boss's battle stats come from
`floor((base + 15) * tierMultiplier)` with a fixed per-tier multiplier and a
fixed HP pool, in which no level term appears at all. Corroborated 2026-09-09
against Bulbapedia's `Weather_(GO)` raw wikitext, whose "five power up levels
higher" sentence is describing the caught Pokémon.

Weather **is** symmetric in combat: a raid boss whose move type matches the
weather gets the same 1.2x on its attacks against the player.
`[community-consensus]`, pokemongohub.net, 2026-09-09.

**Engine: implemented and symmetric — and one code comment overstates the
gap.** `comparison.ts`, `teamRaid.ts`, `speciesReport.ts` and `powerUp.ts` each
call `isWeatherBoosted(...)` for the boss's moves as well as the candidate's,
so both sides are boosted correctly. But `weather.ts` carries a "KNOWN
SIMPLIFICATION" comment describing the "+5 effective levels" as deferred future
work. There is nothing deferred: the mechanic does not exist in combat. That
comment should be corrected to say so, or a future reader will "fix" a
non-problem.

The raid-catch numbers above (level 20/25, 10/10/10 floor) are recorded here
because `IDEAS.md`'s "add a hypothetical 7th roster slot" idea assumes them.

### The friendship attack bonus is a RAID/GYM mechanic, not PvP

Read straight from GAME_MASTER's `FRIENDSHIP_LEVEL_0..5` templates
(`attackBonusPercentage`, fetched 2026-09-09). `[first-party]`:

| Level | Name | Multiplier |
| :--- | :--- | ---: |
| 0 | (none) | 1.00 |
| 1 | Good Friend | 1.03 |
| 2 | Great Friend | 1.05 |
| 3 | Ultra Friend | 1.07 |
| 4 | Best Friend | 1.10 |
| 5 | Forever Friend | 1.12 |

Scope, `[community-consensus]` (Bulbapedia `Friends_(GO)`, 2026-09-09): the
bonus applies **in Gym and Raid Battles**, requires a friend actually
co-participating in that battle, takes only the single highest tier present
(no stacking or averaging across multiple friends), and is therefore **zero
when soloing** — which `FRIENDSHIP_LEVEL_0`'s own 1.0 confirms.

Forever Friend is recent content (rolled out 2025-12-08 → 2025-12-11); its 12%
rested on a single wiki table until the GAME_MASTER read above confirmed it.
A 2019 Pokébattler claim of 15%/11% values is **closed as not-current** — a
2020 datamine and today's dump both show the 3/5/7/10 ladder.

**Engine: not modelled, and the code comment is backwards.**
`damage.ts` has `FRIENDSHIP_BEST_BUDDY_MULTIPLIER = 1.1` commented as "trainer
battles only; raids/gyms do not apply this" — the exact reverse of the sourced
scope, and the constant collapses a 5-tier ladder into one value. Nothing
shipped is wrong today: the `bestBuddy` field is never set `true` at any call
site and has no `Scenario` field, so the term is inert. Two separate issues to
fix together — the wrong comment, and the field name colliding with the
unrelated **Best Buddy CP Boost** (a `+1 level` stat boost while a Pokémon is
your active buddy, also unmodelled). Do not conflate them.

### CPM, and the levels above 50 in the data

`PLAYER_LEVEL_SETTINGS.playerLevel.cpMultiplier` is an **80-entry** array
(GAME_MASTER, 2026-09-09, `[first-party]`). Spot values: L20 `0.5974`,
L25 `0.667934`, L30 `0.7317`, L40 `0.7903`, L50 `0.8403`.

**The array does not stop at 50.** It continues `0.8453 / 0.8503 / 0.8553 /
0.8603 / 0.8653` for levels 51-55, then holds `0.8653` flat through level 80.
This is *not* evidence that the Pokémon power-up cap moved — it remains 50.
The 80-entry length tracks the **Trainer** level cap (raised to 80 in Oct
2025), and the >50 CPM entries are unreachable headroom. Recorded because
reading the raw array is an easy way to wrongly conclude the cap changed, and
this project has a standing position against adding levels past 50.

**Engine: correct and deliberately truncated.** `cpm.ts` stops at
`50: 0.8403` and cites this same template. Keep it that way.

### RESOLVED: raid-boss multipliers are authored constants, not CPMs

Worth recording because the near-miss pattern is genuinely misleading and this
question got raised, chased and closed inside one session (2026-09-09).

The per-tier `attackDefenseMultiplier` looks like it could be the CPM of a
fixed boss level — and at tier 1 it matches *exactly*:

| Tier | Engine value | CPM candidate | |
| :--- | ---: | :--- | :--- |
| 1-Star | 0.5974 | CPM(L20) = 0.5974 | exact |
| 3-Star | 0.73 | CPM(L30) = 0.7317 | off by 0.23% |
| 5-Star / Mega / Primal | 0.79 | CPM(L40) = 0.7903 | off by 0.04% |

**They are not CPMs.** Two independent lines of evidence:

1. `biowpn/GoBattleSim-Engine`'s committed `setting/GBS.json` hard-codes its
   raid tier CPMs as `0.7300000190734863` and `0.7900000214576721`. Those
   trailing digits are the float32-upcast signature of the literal decimals
   **0.73** and **0.79** — `0.7317`/`0.7903` would upcast to visibly different
   tails. An independent author with the full CPM table in hand chose these as
   their own constants. `[community-consensus]`
2. Searching the full 19.5MB GAME_MASTER (2026-09-09): the string `0.5974`
   occurs **exactly once**, as the level-20 entry of the CPM array, and no
   multiplier field anywhere carries `0.73` or `0.79`. **There is no raid-boss
   stat-scaling field in client data at all** — like the boss AI, boss stat
   scaling is server-side. So there is nothing to reconcile the tier table
   against, in either direction. `[first-party]` (as a negative result)

The tier-1 coincidence is best explained by 20/30/40 being the CPM table's
"clean" 4-decimal anchors, with an early constant set equal to one of them at
its commonly-known precision. That last part is inference, not sourced.

**Engine: correct as-is, do not "fix" it.** `raidBoss.ts`'s 0.5974 / 0.73 /
0.79 are the better-evidenced values. Switching them to CPM values would be a
regression dressed as a precision improvement — which matters here because this
engine floors per-hit damage, so a spurious sub-1% change can cross a
breakpoint and move a discrete result.

### Type effectiveness

GO uses its own multipliers, **not** the core series' 2× / 0.5× / 0×:

| Matchup | GO | Core series |
| :--- | :--- | :--- |
| Super effective | `1.6` | 2 |
| Not very effective | `0.625` | 0.5 |
| "Immune" (see below) | `0.390625` | 0 |

**There are no true immunities in GO.** A matchup the core series zeroes out
(Normal vs Ghost, Ground vs Flying, Psychic vs Dark) instead deals `0.390625`,
which is exactly `0.625²` — i.e. GO models an immunity as a double resistance.
Every move always deals at least 1 damage to everything.

**Dual typing stacks multiplicatively**, so the reachable values compound:
Ice vs Dragon/Flying is `1.6 × 1.6 = 2.56`, and a resistance plus a weakness
partially cancel. Because an "immunity" is itself already a double resistance,
a triple resistance *is* reachable on a dual-typed defender — Normal vs
Ghost/Steel is `0.390625 × 0.625 = 0.244140625`. Nothing special-cases this;
it falls out of multiplying through.

These values date to the **December 2018** type-effectiveness rework that
shipped alongside PvP, which replaced the earlier `1.4` / `0.714` pair and
widened the gap between type-advantaged and neutral damage. Sources: Pokémon GO
Hub's writeup of the December 2018 change (old vs new multipliers), corroborated
by Pokémon Database and pokemons.io type charts. Retrieved 2026-09-08.

**Upgraded to `[first-party]` on 2026-09-09**: GAME_MASTER carries one
`POKEMON_TYPE_<TYPE>` template per attacking type, each with an
`attackScalar` array of 18 values — the type chart itself. Fire's row reads
`[1, 1, 1, 1, 1, 0.625, 1.6, 1, 1.6, 0.625, 0.625, 1.6, 1, 1, 1.6, 0.625, 1, 1]`,
confirming `1.6` and `0.625` directly from client data rather than by
community agreement.

**Engine: implemented** (`typeChart.ts`). Verified 2026-09-08: the chart's
constants match the table above, `typeEffectiveness()` reduces over the
defender's types multiplicatively, and all 19 `calculateDamage` call sites
supply it — in both directions (attacker→boss and boss→attacker) and separately
for fast and charged moves, since a Pokémon's two moves are often different
types.

One caveat, recorded because it is the kind of thing that rots: `DamageInputs`
makes `typeEffectiveness` **optional, defaulting to 1** (`damage.ts`). Every
current call site passes it, so nothing is wrong today — but a future call site
that forgets it computes neutral damage silently rather than failing to compile.

---

## Raid boss behaviour

Source for this whole section unless stated otherwise: the Silph Road research
team's follow-up analysis of Niantic's September 2024 raid rework
(r/TheSilphRoad post `1fckfja`, ~late September 2024), supplied by the user
2026-09-08. `[community-consensus]` — an organised research team publishing
repeated in-game testing, but not first-party.

**This is roughly two years old.** It remains the best available account of the
post-2024 raid system and nothing found since contradicts it, but treat any
specific dial as possibly re-tuned. The *mechanisms* are far more durable than
the *numbers*.

### Raid tiers, and the game's own internal names for them

The client's `RAID_LEVEL_*` identifiers (GAME_MASTER, 2026-09-09) don't map
one-to-one onto the player-facing tier names this engine's `RaidTier` union
uses. Recorded because guessing from the identifier name gets two of them
wrong:

| Internal identifier | Real tier |
| :--- | :--- |
| `RAID_LEVEL_MEGA` / `RAID_LEVEL_MEGA_5` | Mega Raids / Legendary Mega Raids |
| `RAID_LEVEL_PRIMAL` | Primal Raids |
| `RAID_LEVEL_1/3/5_SHADOW` | Shadow Raids (reuse the base tier's stats) |
| `RAID_LEVEL_ULTRA_BEAST` | a 5-star raid; a spawn/catch flag, not a stat tier |
| `RAID_LEVEL_EXTENDED_EGG` | **Elite Raid** |
| `RAID_LEVEL_4/5_MEGA_ENHANCED` | **Super Mega Raids** |
| `RAID_LEVEL_COORDINATED_1/_2` | **Unity Raids** |
| `RAID_LEVEL_4` | dead legacy — Tier 4 was merged into Tier 3 in Aug 2020 |

The last three are the traps. `COORDINATED` is **Unity**, not Super Mega —
corroborated by Unity Raid's own datamined resource strings sharing the
`coordinated_` prefix. Super Mega is `MEGA_ENHANCED`, and notably is **absent**
from `unsupportedRemoteRaidLevels` — Super Mega Raids *do* support remote play,
unlike Elite and Unity, which are both on that list. So the crowd a Super Mega
Raid needs comes from its shield rule, not from any lobby restriction.
`[community-consensus]`, datamine-corroborated, 2026-09-09.

**Engine: the union is complete for what it models.** Shadow and Ultra Beast
correctly reuse base-tier stats rather than needing their own rows. Elite Raid
remains absent (a known, dated gap). "Super Mega Raids" is one engine row where
the game has two identically-statted ones — a naming gap, not a numeric one.
Unity Raids are deliberately excluded as a structurally different battle system,
same call as Max Battles.

### Raid battle timers

180s for Tier 1-3, **300s** for everything from Mega Raid upward — 5-star,
Elite, Primal, Legendary Mega, Super Mega. `[community-consensus]`, Bulbapedia
raw wikitext, 2026-09-09 (the same table that supplies the per-tier HP and the
0.79 multiplier this engine already uses).

**The Elite Raid timer is settled at 300s** and should not be re-opened. Two
earlier research passes recorded it as unsourced; both were conflating the
battle timer with the 30/45-minute *gym availability window* after the egg
hatches, which is a genuinely different number.

**Engine: not modelled as a hard limit.** There is no per-tier battle-timer
constant; the Team Raid Simulator takes a countdown as an input instead. That
is a deliberate design choice, not a gap — but a tier-defaulted timer would be
a reasonable convenience.

### BATTLE_SETTINGS — the raid combat constants, first-party

Every constant below was read directly out of the **live GAME_MASTER**
(`BATTLE_SETTINGS` template, PokeMiners mirror
`game_masters/master/latest/latest.json`, fetched **2026-09-09**). This is the
same file `scripts/sync-data.ts` already downloads every run — these are not
community estimates, and where an entry below cites a community source for one
of these numbers, this block supersedes it. `[first-party]` (client data).

| Field | Value | Bears on |
| :--- | ---: | :--- |
| `energyDeltaPerHealthLost` | 0.5 | attacker energy from damage taken |
| `bossEnergyRegenerationPerHealthLost` | 0.5 | boss energy from damage taken |
| `maximumEnergy` | 100 | energy cap, both sides |
| `dodgeDamageReductionPercent` | 0.75 | dodge multiplier (0.25 damage taken) |
| `dodgeDurationMs` | 500 | dodge time cost |
| `swapDurationMs` | 1000 | Pokémon swap delay |
| `enemyAttackInterval` | 1.5 | see caution below |
| `retargetSeconds` | 0.5 | AI retarget interval |
| `sameTypeAttackBonusMultiplier` | 1.2 | STAB |
| `shadowPokemonAttackBonusMultiplier` | 1.2 | shadow attack |
| `shadowPokemonDefenseBonusMultiplier` | 0.8333333 | shadow defense (5/6) |
| `maximumAttackersPerBattle` | 20 | lobby size |

Two cautions on reading this block:

- **`BATTLE_SETTINGS` is raids/gyms; `COMBAT_SETTINGS` is PvP.** The latter is
  a separate template carrying `turnDurationSeconds: 0.5`, `chargeScoreBase`,
  the minigame fields and `quickSwapCooldownDurationSeconds`. Do not cite a
  `COMBAT_SETTINGS` number for a raid claim — several community write-ups do,
  and the "0.5s combat cycle" entry below may be one of them.
- **`enemyAttackInterval: 1.5` now has a probable meaning** — see "The boss
  pauses between attacks" below. Short version: it is most likely the low bound
  of a randomised 1.5-2.5s pause the AI takes *between* attacks, on top of each
  move's own duration. That reading is inferred, not stated by any source.
- `retargetSeconds: 0.5` has **no corroboration from any source**. Do not
  build on a guess about it.

`RAID_CLIENT_SETTINGS` in the same dump additionally gives
`remoteDamageModifier: 1` — the remote-raid damage penalty is gone, now
confirmed first-party rather than via a community report — plus
`maxPlayersPerLobby: 20` and `maxRemotePlayersPerLobby: 10`.

**Engine: mostly implemented, and now confirmed rather than assumed.**
`BOSS_ENERGY_PER_DAMAGE_TAKEN`, `ENERGY_PER_DAMAGE_TAKEN`, `MAX_ENERGY`,
`DODGE_DAMAGE_MULTIPLIER`, `DODGE_COST_SECONDS` and the shadow/STAB
multipliers all match these values exactly. Several were previously carried as
`[community-consensus]`; they are first-party now. `swapDurationMs` is the
exception — see below.

### Swapping Pokémon costs a real, first-party 1.0s

`swapDurationMs: 1000` in `BATTLE_SETTINGS` (fetched 2026-09-09).
`[first-party]`. Earlier research this project ran searched community articles
for this figure and found none that quantified it; the game's own settings do.

Still open: whether it applies to a faint-triggered auto-swap, a manual
mid-raid swap, or both. That decides whether it belongs in the Team Raid
Simulator's per-faint accounting or only on a manual-swap path.

**Engine: diverges.** `teamRaid.ts` defaults `swapCostSeconds` to `0` on the
documented grounds that no official value existed. That premise is now false.
Changing the default re-baselines every shared Team Raid link, so it is a
product call rather than a silent fix.

### The 0.5 second cycle

Since the September 2024 rework, raid combat runs on a 0.5s cycle. Niantic
publicly confirmed sweeping timing changes, noting they "may affect the timing
of some Pokémon moves".

**Engine: finer than the game.** `simulate.ts` uses a 0.1s tick
(`DEFAULT_TICK_SECONDS`). 0.5s events are exactly representable at 0.1s, so
nothing is mis-timed, but the engine permits event boundaries the real game
would snap to 0.5s. Not currently a known source of error.

### Boss energy comes mostly from damage taken

`BossEnergyRegenerationPerHealthLost = 0.5` per HP lost. Briefly set to `0.02`
in September 2024, then reverted to `0.5` — the long-standing value. Bosses
therefore gain most of their energy from **being attacked**, not from their own
fast moves.

**Confirmed first-party 2026-09-09** by direct GAME_MASTER read. The
`BATTLE_SETTINGS` block carries **two separate fields**:
`energyDeltaPerHealthLost: 0.5` (attacker side) and
`bossEnergyRegenerationPerHealthLost: 0.5` (boss side). They hold the same
value today but are independently tunable — so this engine using one constant
for both sides is correct *by coincidence of the current data*, not by
structure. Re-check both after any raid rework.

**Independently corroborated 2026-09-08**, and this is the one figure here that
does not rest on the Silph Road chain. Bulbapedia's `Energy_(GO)` page (direct
`action=raw` fetch) states: "Pokémon can store a maximum of 100 energy in
battle... In Gym and Raid Battles, 0.5 energy is also gained for every HP that
is lost." Note it is phrased generally — the same rate applies to the attacker
and the boss, so it is the same constant this engine already uses for the
attacker (`ENERGY_PER_DAMAGE_TAKEN`). The 100 energy cap is confirmed there too
(`MAX_ENERGY`).

The **50% charged-move probability below remains single-sourced** (Silph Road
only) and is the weaker of the two constants.

The consequence sits directly on this project's thesis: in the real game a
**higher-DPS attacker makes the boss fire charged moves faster**. A model that
misses that feedback loop systematically under-penalises glass cannons on
survivability — a genuine ranking-flip axis, not a refinement.

**Engine: implemented, opt-in** (`simulate.ts`, `bossEnergyFromDamageTaken` /
`BOSS_ENERGY_PER_DAMAGE_TAKEN` in energy.ts). The default `fixed-interval`
cadence still derives readiness from the boss's own fast moves only
(`bossChargedMoveReadySeconds`) plus a user-set mean interval, so it keeps the
gap; the `energy-driven` and `energy-gated-interval` cadences both feed the boss
0.5 energy per HP lost. Both stay off by default (updated 2026-09-08 — this
entry previously read "NOT MODELLED", which was true before energy-driven
shipped).

### The charged-move decision is a 50% roll, made instantly

When a boss has enough energy it has a **50% chance** to use its charged move
(reverted from a brief 100% "spam" period). Crucially, bosses now decide
**instantly** rather than planning one turn ahead as the pre-2024 system did.

**Engine: implemented, opt-in** (`simulate.ts`,
`BOSS_CHARGED_MOVE_USE_PROBABILITY`, the `energy-driven` cadence — see the open
question below for what triggers each roll). The default `fixed-interval`
cadence still uses a mean interval with ±40% jitter, a statistical stand-in for
this energy-plus-probability process rather than a reproduction of it; the
`energy-gated-interval` cadence uses the energy half but replaces the 50% roll
with one jittered delay (updated 2026-09-08 — previously read "NOT MODELLED").

### OPEN QUESTION: what gates firing once energy is already sufficient?

A boss does not fire the instant it can afford to. Energy caps at 100
(`MAX_ENERGY`), and a boss sitting at the cap still does not automatically
cast — so something gates *when* it fires, separately from *whether* it can.

The Silph Road post gives the 50% figure but **not its denominator**. 50% per
0.5s cycle, per fast move, or per some other opportunity are very different
models with very different effective fire rates. That denominator is the single
most important unknown in this section.

**This is not academic — it produced a real bug (2026-09-08).** Our first
energy-driven implementation re-rolled only when boss energy *changed*. Because
energy caps, a boss pinned at 100 whose roll failed never got another
opportunity: measured 101 of 200 seeded 60s runs where the boss never fired at
all while at full energy throughout. Whatever the real decision cadence is, that
is what the roll must be driven by — an energy-change trigger is definitively
wrong.

**Researched 2026-09-08: the denominator is not documented anywhere fetchable.**
Bulbapedia covers the energy formula but not the decision trigger; Dexerto and
Pokémon GO Hub restate the 50% history with no trigger detail; GamePress's
article is dead; Sportskeeda returns 405; Silph Road's own site has an expired
certificate. Everything traces to the single Silph Road post.

**Do not assume "50% per 0.5s cycle."** The 0.5s cycle and the 50% probability
are separately sourced — the cycle from Niantic's own timing statement, the
probability from Silph Road's testing — and nothing connects them. Pairing them
because both numbers happen to be 0.5 would invent a relationship no source
states. This was flagged explicitly as a trap, and it is one I was about to walk
into.

**Engine's working assumption:** the roll happens at each boss *move-completion
boundary* (fast or charged). This is a reasoned inference reconciling two
sourced facts — "decides instantly" plus the observed three-consecutive-Hydro-
Pumps-with-no-fast-moves-between — and is the only candidate consistent with
both. A fast-move-only trigger cannot produce back-to-back casts. It also
introduces no invented time constant and structurally cannot deadlock.

`[speculative — reasoned inference]`, **not a cited mechanic**. If a source ever
establishes the real denominator, this is the first thing to correct.

**Corroborated by another simulator, 2026-09-08** (`pogo-researcher`, direct
read of the open-source GoBattleSim-Engine, `biowpn/GoBattleSim-Engine`,
`src/Strategy.cpp` `defender_on_clear` dispatched from `src/Battle.cpp`
`on_clear`): that engine re-evaluates the raid boss's charged move on **every
completed action** (fast, charged or dodge), gates it on **energy ≥ the move's
cost** (not on the 100 cap), and on firing **subtracts the cost** rather than
zeroing energy. `[unverified — one simulator's modelling choice, not an in-game
observation]`; it raises confidence in the move-boundary trigger without making
it first-party. Pokebattler publishes nothing on its boss AI; PvPoke has no raid
logic; no source anywhere records how long a boss waits once eligible.

**Engine: matches, as of 2026-09-08.** `energy-driven` used to zero the boss's
energy on fire (simulate.ts, `attemptBossChargedMoveDecision`) where
GoBattleSim subtracts the cost — for a 50-energy move fired from 100 that was
the difference between an immediate re-roll and a full refill. User decision
2026-09-08: changed to subtract the cost (`bossEnergy -= chargedMove.energyCost`),
matching GoBattleSim and this project's own `energy-gated-interval` model,
which already subtracted — the two models' on-fire behavior is no longer a
divergence. This re-baselines every `energy-driven` result and shared link
that had a boss firing more than once in a run; see HANDOFF.md for the
decision record.

### The boss AI is not in GAME_MASTER at all — a dated negative result

Searched the full 19.5MB dump on 2026-09-09 for any boss/NPC combat-AI or
difficulty template: `COMBAT_NPC*`, `*_AI_*`, `*DIFFICULTY*`. **None exists.**
The only NPC templates are `CHARACTER_EVENT_NPC_*` (story characters, not
combat). `BATTLE_SETTINGS` carries the combat *constants* but no decision
logic.

Why this matters: the 50% charged-move probability and its denominator — the
open question above, and the stated blocker on turning energy-driven cadence on
by default (`IDEAS.md` item 1) — **cannot be resolved from client data.** The
boss's decision logic runs server-side. Any answer will have to come from
observational testing or a first-party statement, not from a better datamine.
Recorded so nobody spends another session looking for it in the dump.

### The boss pauses 1.5-2.5s between attacks

Bulbapedia's `Gym (GO)` raw wikitext, fetched 2026-09-09, verbatim:

> In both Gym and Raid Battles, the AI Pokémon behaves in the following
> pattern: Does not dodge attacks / Pauses for 1.5 to 2.5 seconds between
> attacks / Has a 50% chance of casting a Charged Attack...

`[community-consensus]`. Three things worth separating here:

1. **The pause is a real, sourced mechanic**, and its low bound (1.5s) matches
   `BATTLE_SETTINGS.enemyAttackInterval: 1.5` exactly. That the field name and
   the documented behaviour agree numerically is good evidence they are the
   same thing — though **no source actually says so**, so the mapping is
   INFERRED.
2. **This is the closest thing to a source the 50% charged-move roll has**, and
   it sits alongside the pause in the same sentence. It still does not give the
   roll's *denominator* — how often the 50% is evaluated — which remains the
   open question above.
3. **It creates tension with an earlier conclusion recorded here.** This file
   previously reasoned that clamping the boss's charged-move floor to
   `durationSeconds` alone (no padding) was more correct than padding it. If
   the AI really does pause 1.5-2.5s *between* attacks, the true gap between
   boss moves is wider than that floor. Not enough to overturn the earlier
   call — the pause's applicability to fast→charged vs charged→charged
   transitions is unknown — but enough that the floor should not be treated as
   settled.

**Engine: not modelled as a distinct pause.** The three cadence models express
boss timing differently and none of them adds a between-move AI pause on top of
move duration. Whether one should is a real open design question, not a bug.

### Critical hits do not exist in the raid damage formula

Move templates carry `criticalChance: 0.05` on charged moves, which invites the
conclusion that this engine is missing a crit term. It is not. Two
independently-authored, current Pokémon GO Hub damage-formula articles both
give the formula with **no crit term at all**
(`floor(0.5 × power × atk/def × STAB × effectiveness) + 1`).
`[community-consensus]`, 2026-09-09. The field appears to be dead data — crits
were announced for GO years ago and never shipped.

`staminaLossScalar` (present on every move, e.g. Flamethrower `0.09`) is
**unexplained**. No live source describes it; a plausible-sounding attribution
to gym motivation decay was found and rejected as almost certainly fabricated
(motivation decay is CP/time-based, not per-move). Recorded as genuinely
unknown so it is not confidently misused.

**Engine: correct to ignore both** (`damage.ts` has no crit multiplier and no
stamina term).

### The wait between "can fire" and "does fire" — engine model only

No source records the distribution of that wait (see above). The engine's
third cadence model, `energy-gated-interval` (2026-09-08, user-specified),
combines the two sourced halves it does have: the boss gains energy exactly as
`energy-driven` does (own fast moves plus 0.5 per HP lost), and the instant it
reaches its charged move's cost it rolls **one** delay from the tab's
"mean frequency" setting with the fixed-interval model's ±40% jitter, firing
when that elapses (never mid-cast; leftover energy ≥ cost re-arms at once, which
is how it reproduces back-to-back casts). Under this model the frequency field
means *mean delay after becoming eligible*, not *mean seconds between casts*.

`[speculative — modelling assumption]`: the delay's shape and its mean are this
project's own choice, not an observed mechanic. **Engine: implemented**
(`simulate.ts`, `StepwiseBoss.chargedMoveCadence = "energy-gated-interval"`),
off by default.

### Back-to-back charged moves are possible

Because energy accrues from damage taken *during* a cast, a boss can gain
enough energy mid-animation to fire again immediately. Observed: Kyogre landing
five Surfs at ~2.5s intervals, and three Hydro Pumps consecutively with no fast
moves between.

**Engine: matches.** This is the sourced justification for the charged-move
cadence floor added 2026-09-08 — the minimum interval is the move's own
duration, with no fast-move cycle guaranteed on top. Padding the floor beyond
the duration would move *away* from real behaviour.

### Move delay is applied at different ends

Fast moves apply their 1s or 1.5s delay at the **end** of the animation;
charged moves apply it at the **beginning**. So the fast move following a
charged move arrives quickly — for Kyogre, a Waterfall warning flashes
immediately as the charged move lands, hitting ~1s later.

**Engine: NOT MODELLED.** Move durations are treated uniformly.

---

## Dodging

Dodge negates 75% of incoming damage (multiplier `0.25`), costs ~0.5s, and the
yellow-flash window is ~0.7s. `[community-consensus]`, corroborated 2026-09-08
against pokemongohub's dodging-mechanics writeup.

**Engine: 0.25 and 0.5s implemented** (`breakpoints.ts`). The 0.7s window is
**not modelled**.

The 0.25 multiplier and the 500ms cost are **confirmed first-party** as of
2026-09-09 — `dodgeDamageReductionPercent: 0.75` and `dodgeDurationMs: 500`
in `BATTLE_SETTINGS`. See that entry above. The ~0.7s window is *not* one of
the fields in that block and remains unsourced.

Per-move windup-to-flash delay does vary by move — and **this is now sourced
data, not a community chart.** Correcting a claim this file previously made:
it said "pogoapi exposes no per-move windup field, so this is not derivable
from our current data sources." That was true of pogoapi and false of
GAME_MASTER. **399 of 403** move templates in the dump
`scripts/sync-data.ts` already downloads carry `damageWindowStartMs` and
`damageWindowEndMs` (fetched 2026-09-09, `[first-party]`):

| Move | `durationMs` | damage window |
| :--- | ---: | :--- |
| `MUD_SHOT_FAST` | 500 | 250–450 |
| `BRAVE_BIRD` | 2000 | 1000–1600 |
| `FLAMETHROWER` | 2000 | 1300–1500 |
| `EARTHQUAKE` | 3500 | 2600–3400 |
| `FIRE_BLAST` | 4000 | 2900–3700 |
| `SOLAR_BEAM` | 5000 | 2800–4800 |

These match the community chart exactly, which retroactively validates it.

**Do NOT wire these fields into the engine — resolved 2026-09-09.**
`ChargedMove.vulnerableWindowSeconds` (`gamemaster.ts`) is set equal to
`durationSeconds`. That looked like a placeholder for data we download and
discard; per the above it is actually **the better-supported model**, and the
five-field extraction in `fetchCache.ts` is not a gap. Leave it alone.

**The semantics are resolved, and they reverse the obvious conclusion.**
An earlier reading of Pokémon GO Hub's 2024-09-01 rework article quoted a
clause about *energy* only, leaving open whether damage still keys off the
window. The full sentence settles it: "**Damage is dealt at regular 0.5 second
intervals**, moves generate and consume full energy as soon as they are
activated, rather than observing the 'damage window start' and 'damage window
end' timers." `[community-consensus]`

So **damage** is decoupled from the per-move window too, not just energy. The
fields are real, current and still shipped in the data — but since the Sept
2024 rework they no longer govern when damage lands in raids. Extracting them
would be modelling a mechanic the game stopped observing.

A later (2024-12-16) Hub article on dodging still says "damage window"; that
reads as informal shorthand for "the moment damage lands," not a claim the
literal timers are back. Noted so the phrase does not reopen this.

### Unconfirmed: dodge damage may scale with remaining HP

Silph Road observed a player surviving 8 dodged Paybacks where 4–5 was
expected, with damage decreasing per dodge down to ~1 point. They flag it as
needing confirmation and have no formula for it.

**Engine: NOT MODELLED, and should stay that way until confirmed.** Recorded so
that anomalous survivability reports are recognised rather than investigated
from scratch.

---

## Move data

### Struggle has two different energy costs

`0` in raids/gyms, `100` in trainer battles. Verified 2026-09-08 by direct
fetch of Bulbapedia's `Struggle_(move)` wikitext (`|energy=0`,
`|energy_trainer=100`) and corroborated by GAME_MASTER (`energyDelta: 0`). Its
PvE value moved 20 → 0 → 33 → 0 during 2017 and has been 0 since.

**Engine: correct.** 42 species carry Struggle as their only charged move; a
free-firing Struggle is faithful for raids. This project has no PvP tab. If one
is ever built it needs a *separate* energy field — both numbers are
simultaneously true.

### Some real moves are assigned server-side and appear on no species

A recurring shape worth recognising, because it looks like a sync bug and is
not one. GAME_MASTER can carry a **move** template with no `pokemonSettings`
template ever granting that move to a species — the assignment happens
server-side at the encounter. Two live instances as of 2026-09-09:

- **Apex Shadow Lugia / Ho-Oh.** `AEROBLAST_PLUS` (200) / `AEROBLAST_PLUS_PLUS`
  (225) and `SACRED_FIRE_PLUS` (135) / `SACRED_FIRE_PLUS_PLUS` (155) all exist
  as real templates alongside base `AEROBLAST` (180) / `SACRED_FIRE` (120).
  No Apex *form* template exists anywhere in the dump. `[first-party]`
- **Super Max "+" moves.** 15 mega species have an extra Charged Attack usable
  only while Mega Evolved (Brave Bird+, Volt Tackle+, Outrage+, …), confirmed
  verbatim on official pokemongo.com posts and re-verified adversarially
  2026-09-09. Officially stated power for the only one published: Brave Bird+
  is **70 in Trainer Battles, 150 in raids** (base Brave Bird is 130). The
  other 14 have **no published power number** — do not invent one. None of
  these movementIds exist in GAME_MASTER at all. `[confirmed]` (official) for
  the mechanic; the per-species powers are simply unpublished.

**Engine: not modelled, and under-counts rather than over-counts.** An Apex
Lugia here would use the 180-power Aeroblast, not 225. A Super-Max mega would
miss its extra move entirely. Both err in the safe direction. Modelling the
"+" moves properly needs a per-species Mega Level dimension (the move is
available at *any* Mega Level, but its power scales with the level), which is
a materially bigger change than a boolean — and any user-facing version needs
`Scenario` round-trip treatment.

### Move durations are 500ms-aligned

320 of 321 GAME_MASTER moves have durations that are exact multiples of 500ms
(the exception being `DIVE` at 3300ms). Verified 2026-09-08.

**Engine: matches GAME_MASTER exactly** on power, energy and duration for every
move spot-checked. Note that Bulbapedia lists different duration figures (Leaf
Blade 2.4s against GAME_MASTER's 2.5s) — a different convention on that wiki,
not a contradiction. Prefer GAME_MASTER.

---

## Power-up (level-up) costs

### The universal stardust/candy table

Each power-up raises a Pokémon by 0.5 level and costs a fixed amount of
Stardust plus Candy — the same table for every species (one known exception,
below). GAME_MASTER's `POKEMON_UPGRADE_SETTINGS` template carries it directly
(`upgradesPerLevel: 2`; 49 per-whole-level `stardustCost` / `candyCost`
entries, both half-steps at a whole level costing the same; levels 40-49.5
cost XL Candy from a separate 10-entry `xlCandyCost` array instead of
regular Candy, `xlCandyMinPokemonLevel: 40`; `maxNormalUpgradeLevel: 50`).
Level 1 = 200 Stardust / 1 Candy per step, level 40 = 10,000 / 10 XL, level
49.5 → 50 = 15,000 / 20 XL. `[first-party]` — read from the live dump
2026-09-08 and cross-checked against the community-published tables.

**Engine: implemented** (`powerUp.ts`, `powerUpCostTableFromGameMaster`;
data-sync writes `data/normalized/powerUpCosts.json`). Best Buddy's +1 level
(`defaultCpBoostAdditionalLevel`) is not modelled.

### The non-array fields of POKEMON_UPGRADE_SETTINGS

The same template that carries the cost arrays carries these scalars
(GAME_MASTER, 2026-09-09, `[first-party]`):

| Field | Value | Meaning |
| :--- | ---: | :--- |
| `upgradesPerLevel` | 2 | a power-up is half a level |
| `maxNormalUpgradeLevel` | 50 | **the Pokémon power-up cap** |
| `allowedLevelsAbovePlayer` | 10 | power-up cap = Trainer level + 10 |
| `defaultCpBoostAdditionalLevel` | 1 | Best Buddy CP Boost = +1 level |
| `shadowStardustMultiplier` / `shadowCandyMultiplier` | 1.2 / 1.2 | shadow surcharge |
| `purifiedStardustMultiplier` / `purifiedCandyMultiplier` | 0.9 / 0.9 | purified discount |
| `xlCandyMinPlayerLevel` | 31 | XL Candy unlock (trainer) |
| `xlCandyMinPokemonLevel` | 40 | XL Candy required from L40 up |

`maxNormalUpgradeLevel: 50` is the decisive answer to a question the raw CPM
array invites (see "CPM, and the levels above 50 in the data"): the array runs
to level 80, and the power-up cap is nonetheless **50**. Two different fields,
two different meanings.

`allowedLevelsAbovePlayer: 10` confirms first-party what this project had
previously established from wiki text — the cap is `min(trainerLevel + 10, 50)`.
It remains deliberately unmodelled (see the Trainer Level entry below); this
entry only upgrades the sourcing.

**Engine: cost multipliers implemented, caps deliberately not.**
`powerUpCostTableFromGameMaster` consumes the arrays and the shadow/purified/
lucky multipliers. The two caps and the Best Buddy `+1` are known-and-skipped,
not missed.

### Shadow, Purified and Lucky modifiers

Shadow: ×1.2 Stardust and Candy. Purified: ×0.9 Stardust and Candy, "rounded
up". Lucky: ×0.5 Stardust only, Candy unaffected. All three multipliers are in
GAME_MASTER (`shadowStardustMultiplier`/`shadowCandyMultiplier`/
`purifiedStardustMultiplier`/`purifiedCandyMultiplier` on the template above;
`LUCKY_POKEMON_SETTINGS.luckyPokemonSettings.powerUpStardustDiscountPercent:
0.5` — a fraction despite the name) `[first-party]`, and Bulbapedia's "Shadow
Pokémon (GO)" page agrees on all three and adds the rounding
`[community-consensus]`, fetched 2026-09-08. Lucky and Purified stack
multiplicatively on Stardust. None of these change battle stats — Purified is
combat-identical to a non-Shadow Pokémon, Lucky only affects catch IVs.

**Engine: implemented** — multipliers applied per step and rounded up per
step. The shadow-side rounding direction is `[inferred]` from the purified
rule; Bulbapedia only states "rounded up" for Purified explicitly.

### Per-species cost overrides

GAME_MASTER carries `POKEMON_UPGRADE_OVERRIDE_SETTINGS_V0890_POKEMON_ETERNATUS`
— a 30× Candy override for Eternatus (same Stardust). Observed 2026-09-08.

**Engine: not modelled.** v1 of the Power-Up Optimizer uses the universal
table for every species; Eternatus's candy costs are understated by 30×.

### Fungible candy currencies (Rare Candy, Rare Candy XL, Candy → XL conversion)

Three ways to move candy between species, all deterministic:

- **Rare Candy → species Candy, strictly 1:1.** No batch ratio (the in-game
  quantity selector just performs N individual 1:1 conversions under one
  confirmation), no trainer-level gate, no species exclusion — regionals, Ditto
  and Legendaries all accept it. It **cannot** produce XL Candy.
  `[community-consensus]` — Pokémon GO Hub's "Rare Candy" guide
  (https://pokemongohub.net/post/guide/rare-candy/, 2020-11-24), re-checked
  2026-09-08 with no contrary source.
- **Rare Candy XL → species XL Candy, 1:1.** A *separate item*, not a form of
  Rare Candy: from in-person (never remote) 3-star+ raids, Trainer level-up
  rewards at 41-50, and Special Research. It cannot be bought, and plain Rare
  Candy cannot be converted into it. `[community-consensus]` — Bulbapedia
  "Candy (GO)" and Gamerant's Rare Candy XL guide
  (https://gamerant.com/pokemon-go-guide-rare-candy-xl/, 2022-09-04), both
  fetched 2026-09-08.
- **Candy → XL Candy via the in-game "Convert" button, exactly 100:1**,
  deterministic, no documented cap, gated at Trainer Level 31+ (lowered from 40
  in June 2022). `[community-consensus]` — Pokémon GO Hub's XL Candy guide
  (https://pokemongohub.net/post/guide/xl-candy-guide-how-to-get-power-up-costs-and-mechanics/,
  updated 2026-08-27), fetched 2026-09-08.

A claim that **100 Rare Candy converts into 1 Rare Candy XL** surfaced during
this research pass and is **false as far as we can tell** — the two articles
cited for it say no such thing, and it looks like a conflation with the 100:1
regular-Candy route above. Recorded here so it isn't "rediscovered" and built.

**Engine: the first two are implemented** as two independent shared pools in
the Power-Up Optimizer's budget planner (`rareCandyOnHand` → regular Candy,
`rareCandyXlOnHand` → XL Candy), each 1:1, with no path between them — a slot
spends its own per-species candy first, then draws on the shared pool.
**The 100:1 Candy → XL conversion is not modelled**: it is a real arbitrage the
planner could in principle exploit, but at realistic per-species candy counts
(tens, not hundreds) it almost never unlocks a step, and modelling it would let
the planner spend candy the user was saving for a different species entirely.

### Trainer Level cap on power-ups — deliberately not modelled

A Pokémon cannot be powered up past **`min(TrainerLevel + 10, 50)`**.
`[community-consensus]` — Bulbapedia's "Power up" page, read as raw wikitext
2026-09-08: "Each power-up increases the level by 0.5, up to the player's
Trainer level + 10." Niantic's own post on the 2025-10-15 level-cap-to-80
rebalance (https://pokemongo.com/post/pgo-leveling-update-details-2025/) is
`[first-party]` corroboration in one direction: it states that update does not
change Pokémon leveling, and that Trainer Level 40 is still required to reach
Pokémon level 50 — exactly what `min(40+10, 50)` predicts. It also explains the
Trainer Level 31 XL-Candy gate above as the *same* mechanic seen twice: level 31
is the first Trainer Level whose +10 ceiling (41) reaches past 40 into the first
XL-costing step.

Note for anyone reading an older summary: the figure is **+10, not +2**. The
"+2" number belongs to a different formula on the same Bulbapedia page — the
level of a Pokémon received in a trade, `min(TrainerLevel + 2, floor(originalLevel))`.

**Engine: not modelled, by explicit user decision (2026-09-08).** The Power-Up
Optimizer and its budget planner will recommend targets up to level 50
regardless of Trainer Level; judging reachability is left to the user. This is a
deliberate scope choice, **not an oversight** — do not add a trainer-level input
without asking.

### Evolution: candy-only, and it never pays to power up first

Researched 2026-09-08 (`pogo-researcher`) while scoping the whole-roster
Power-Up Optimizer. `[community-consensus]` — Bulbapedia-derived, cross-checked
across sources, no contrary evidence found; no single first-party Niantic table
covers it.

- Evolution costs **candy only, never stardust**. Species-specific, ~12
  (Caterpie → Metapod) to ~400 (Magikarp → Gyarados, Meltan → Melmetal), with
  typical two-stage lines around 50.
- **Evolving changes neither level nor IVs.** The base stats swap at the same
  level and the same IVs, which is why CP jumps on evolution.

The consequence is a hard rule for any investment advice this tool gives:
**powering up an unevolved Pokémon is never correct.** The power-up cost table
is species-agnostic and level/IV progress carries through evolution exactly, so
the same stardust always buys strictly more after evolving than before. No
counter-example was found.

**Engine: implemented (as an exclusion).** `SpeciesDefinition.isFullyEvolved` /
`evolvesToIds` are populated by data-sync from GAME_MASTER's `evolutionBranch`,
and `rosterPlanner.ts` excludes an entry with `isFullyEvolved === false` from
power-up candidates, reporting it as "evolve first (into X)" rather than hiding
it. **Not modelled:** pricing "evolve, then power up to L" as a single candidate
— that needs per-species evolution candy costs, which GAME_MASTER does carry
(`candyCost`/`candyCostPurified` per branch) but this project does not yet
normalize. See `IDEAS.md`.

> **Derivation trap, verified 2026-09-08:** `isFullyEvolved` must come from
> "has a branch carrying an `evolution` field," **not** from `evolutionBranch`
> being non-empty. 984 templates carry a real evolution branch, but a further
> **123 carry a branch whose only entries are TEMPORARY (mega) evolutions** —
> Venusaur, Charizard, Blastoise, Beedrill and Metagross among them. The naive
> check marks those unevolved and silently deletes the best attackers from any
> candidate set while still looking like it works.

### Candy is shared across an evolutionary FAMILY, not a species

Same research pass. GAME_MASTER publishes `familyId` on all 2472
`pokemonSettings` templates (e.g. Beldum, Metang and Metagross all carry
`FAMILY_BELDUM`), and real candy is held per family — powering up Metagross
spends Beldum candy.

**Engine: implemented.** `SpeciesDefinition.candyFamilyId` is populated by
data-sync, and the roster planner pools candy on it. This is not cosmetic at
roster scale: on a real 164-Pokémon Poke Genie export, **25 families hold more
than one entry**, with `FAMILY_HOUNDOUR` holding 14 and `FAMILY_CHARMANDER` 9.
Pooling per species id instead would let a planner spend the same candy
repeatedly. Mega/primal species carry no `familyId` of their own — resolve
theirs through the base species (`blaziken-mega` → `FAMILY_TORCHIC`).

### Second charged move unlock — same budget, different Purified rate

Researched 2026-09-08 (`pogo-researcher`). `[community-consensus]` — Pokémon GO
Fandom's "List of second Charged Attack cost", cross-referenced with Pokémon GO
Hub; no first-party Niantic table found.

Cost is tiered by the family's buddy-walking distance: 1 km → 10,000 stardust /
25 candy, 3 km → 50,000 / 50, 5 km → 75,000 / 75, 20 km → 100,000 / 100.
Starters and babies (except Toxel) are a flat 10,000 / 25. Sixteen species
(Caterpie, Metapod, Weedle, Kakuna, Magikarp, Ditto, Wynaut, Wobbuffet,
Smeargle, Wurmple, Silcoon, Cascoon, Taillow, Feebas, Beldum, Kricketot) cannot
learn one at all unless Shadow or Purified.

> **Trap:** Shadow is ×1.2 for both resources, but **Purified is ×0.8** here —
> *not* the ×0.9 this project's power-up cost table correctly uses. Do not reuse
> `PowerUpCostModifiers` for second-move costs.

**Engine: not modelled.** This draws on the *same* stardust and candy pool the
power-up planner allocates, and is often a better team-DPS-per-stardust purchase
than several half-levels — so a plan that prices only power-ups can recommend
the wrong purchase. Surfaced as a UI caveat, not simulated. By contrast **Elite
TMs do not compete for this budget at all** (earned via GO Battle League
milestones, Community Day boxes, or Special Research — never bought with
stardust or candy), so they need no caveat.

---

## Shadow raids

Sourcing for this section: Bulbapedia's `Shadow_Raid` raw wikitext, fetched
2026-09-09, corroborated by community guides. `[community-consensus]` — no
first-party source states any of these numbers.

- **Enrage begins at 60% remaining HP.** A competing "~1/3 of HP lost" (≈67%)
  figure found during research traces to one guide's internally-inconsistent
  paraphrase — the same page says "around 60%" a sentence later. One number,
  garbled, not two competing observations.
- **Enraged stats**: `attack = 1.81 × baseAttack + 15`,
  `defense = 3 × baseDefense + 15`. Two independently-converging community
  sources.
- **Shadow raids reuse the standard per-tier difficulty stats** — verbatim:
  "Shadow Raids use the same difficulty ratings and stats as standard Raid
  Battles." So no shadow-specific rows are needed in the tier table.
- **Shadow bosses get the shadow multipliers themselves**: they "deal and
  receive 20% increased damage, like other Shadow Pokémon." The "receive 20%
  more" figure is exactly a 5/6 defense multiplier (6/5 = 1.2).
- **Purified Gems**: 8 gems across all players subdue an enraged boss; each
  player may use at most 5 per raid, with a 5s cooldown. The per-player cap
  below the group threshold means **no solo trainer can ever subdue a boss
  alone** — it structurally requires two or more cooperating trainers.

**Engine: correct on the parts it models, deliberately silent on the rest.**
`bossEffectiveStats()` already calls `shadowAdjustedBaseStats(boss)` before
applying the tier multiplier, so a boss flagged `isShadow` gets the 1.2 attack
and 5/6 defense treatment today — this was checked, and it is a positive
validation rather than a gap. The `RaidTier` union correctly has no shadow
rows. **The enrage state itself is not modelled** — it is a mid-fight stat
change, structurally different from a flag, and would need a simulator phase.
**Purified Gems are not modelled and arguably should not be**: an 8-gem group
threshold no single trainer can reach is multi-trainer coordination, closer in
shape to the ruled-out Teambuilding Analyzer than to this tool's per-candidate
combat math.

---

## Known bugs in the real game

Recorded so we neither model a bug as intended behaviour nor mistake one for
ours.

- **Shadow raid bosses at 15% HP — probably NOT a bug. Re-examined
  2026-09-09.** This entry used to read: "once an enrage-capable shadow boss
  crosses 15% HP its defense drops to a very small non-zero value — weak moves
  like Lock-On then carve out huge chunks," recorded as a suspected bug from
  late September 2024. Four independent sources checked since (Bulbapedia raw
  wikitext, Pokémon GO Hub, Dexerto, Switchblade Gaming, all 2026-09-09)
  instead describe an **intended, documented mechanic** at that threshold: at
  15% HP an enraged boss auto-**subdues**, reverting Attack and Defense to
  their normal non-enraged values. None describes a below-normal state.
  Dropping from an enraged `3x + 15` defense back to tier-normal is a large
  enough swing to read as "defense collapsed" to a player calibrated to the
  enraged tankiness — a plausible, though unproven, origin for how this got
  recorded as a bug. **Genuinely unsettled**: the original Silph Road source
  cannot be re-fetched (reddit.com is unreachable from the research tooling),
  so it is not confirmed as fixed *or* as intended — but the balance of
  findable evidence now leans toward "misdescribed intended mechanic".
  **Engine: still not modelled**, which stays correct either way.
- **Raid damage doesn't always persist.** Pokémon that fainted in a raid
  sometimes return at full health. Clearly a bug, and irrelevant to this engine,
  which doesn't model post-raid state.

---

## Open question: the damage formula may be incomplete

The Silph Road team reports that after a year of testing they find damage
values the standard formula cannot explain: solving their observations for CPM
yields **non-overlapping** CPM ranges, meaning no single CPM explains both data
points. They ruled out a random component by repeating anomalous cases and
getting consistent results each time.

Their conclusion is that either the damage formula is slightly wrong or
incomplete, or something about CPMs is not correctly understood. They have not
resolved it.

**Implication for this project:** our damage formula matches the published one
and is internally consistent, but "matches the published formula" is not the
same as "matches the game". That is the honest ceiling on our accuracy, and it
is not a defect we can fix. Worth remembering before attributing a small
discrepancy against in-game observation to a bug in this engine.
