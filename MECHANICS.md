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
2025). Recorded because reading the raw array is an easy way to wrongly
conclude the power-up cap changed.

**What levels 51-55 are actually for (updated 2026-09-09).** Not unreachable
headroom, as this entry previously claimed — they are the lookup targets for
**effective-level bonuses that stack on top of** the level-50 power-up
ceiling, which is why the real (non-repeating) values stop climbing at exactly
55: Best Buddy `+1`, Super Max Mega Level `+2` (see "Mega Level" below), and a
one-off `+5` Kalos-event stack are the only mechanics that have ever needed
them. `[community-consensus]` — two converging community sources (a GitHub
gist comment, `gist.github.com/Mygod/71ac34368f66f0d3de469fbaeed386c4`, plus
an SEO-tier cluster), not first-party. A Pokémon's OWN power-up level is
still capped at 50 in every case; only its combat-effective CPM reads higher.

**Engine: implemented, with the power-up cap held separately.** `cpm.ts`'s
`CPM_TABLE` carries `50.5 / 51 / 51.5 / 52` (51 and 52 are the real
first-party values; the two half-levels are computed with this file's own
`CPM(n+0.5) = sqrt((CPM(n)^2 + CPM(n+1)^2)/2)` formula) — enough to resolve
Super Max's `+2` from any level up to 50, including a mega at 49.5 landing on
51.5. Levels 52.5-55 are still deliberately absent: no modelled mechanic
reaches them.

The cap is now enforced by `MAX_POKEMON_POWER_UP_LEVEL = 50` rather than by
the table's length, because those two things are no longer the same. That
distinction is load-bearing: `breakpoints.ts` and `ivComparison.ts` both
derived their level sweeps from `Object.keys(CPM_TABLE)`, so extending the
table silently swept levels 50.5-52 into the Attack/Defense Breakpoints grid
and the IV Breakpoints tab until both were filtered against the new constant.
`powerUp.ts` and `rosterPlanner.ts` were never affected — they derive their
candidate ladder from `PowerUpCostTable.maxLevel` (real
`maxNormalUpgradeLevel`, independently 50). **Never re-derive a power-up
ladder from `CPM_TABLE`'s keys.**

### Mega Level: Base / High / Max / Super Max

A **per-individual-Pokémon** ladder raised by repeatedly Mega Evolving that
specific Pokémon, max once per day. Introduced 2022-04-28; the fourth tier,
**Super Max**, launched at GO Tour: Kalos (2026-02-28) and costs 5,000 of that
species' own Mega Energy on top of Max. `[first-party]`
pokemongo.com/news/mega-evolution-2026-update for Super Max's existence and
benefits.

⚠️ **CORRECTED 2026-09-10 — this entry previously said "per-species (not
per-individual)", and that was wrong.** The claim came from a reading of
Bulbapedia "Mega Evolution (GO)" (raw wikitext, fetched 2026-09-08). The user
corrected it directly from their own account: **two Pokémon of the same species
legitimately sit at different Mega Levels.** That is a first-hand observation of
account state, which outranks a wiki paraphrase — treat it as settled and do not
"restore" the per-species reading from Bulbapedia on a future pass without new
first-party evidence, because that page has now misled this project once.

The correction has teeth, because the two readings imply different products.
Per-species would mean two roster slots holding the same species could not
legitimately differ, and the Team Raid Simulator / Power-Up Optimizer letting
them differ would be a bug to close. Per-individual means that is **correct
behaviour and must be preserved** — a trainer can own a heavily-Mega-Evolved
Charizard and a fresh one, field both, and this tool has to be able to say so.

**For most of its life this system touched nothing combat-relevant** — only
Mega Energy cost on repeats (80% / 90% / 95% reduction) and the rest period
(7 / 5 / 3 days, 24 hours at Super Max). Bulbapedia's own table leaves the
"CP Level Bonus" column blank for Base, High and Max. Two things changed that:

1. **Super Max grants "Greatly enhanced CP"** `[first-party]` for the claim,
   but Niantic publishes no mechanism and no number. Magnitude is
   `[community-consensus]` at **+2 effective levels** (+3 stacked with Best
   Buddy) from two converging community sources. The *mechanism* — real CPM
   lookup vs. display-only CP recompute — remains unconfirmed, with one mild
   negative signal: community raid calculators model "+"-move scaling
   carefully but show no CP change for a mega's ordinary moves across Mega
   Levels. Base / High / Max grant **+0**; this is a step at the top tier,
   not a gradient, so do not interpolate.
2. **A "+" move's power scales with Mega Level** `[first-party]` for the fact
   that it scales, but the only formula in existence is **+10% per tier**
   (Base 1.0 / High 1.1 / Max 1.2 / Super Max 1.3) and it is `[unverified]`:
   two community sites carry it with *verbatim-identical* disclaimer text, so
   it is one shared guess rather than independent corroboration, and both
   self-label it an estimate. No official, LeekDuck, PvPoke or Silph source
   confirms it. Note that **having** the "+" move requires only Base tier —
   official wording is that eligible Pokémon know the move while Mega Evolved
   "regardless of their current Mega Level" — so the tier sets its power, not
   its availability.

3. **Super Max is only reachable by a mega that has a "+" move.** `[unverified]`
   — stated by the user (a high-investment player relaying their own account
   state) on 2026-09-09: *"not every mega can get to super mega level its only
   the ones with plus moves unlocked."* No published source states this either
   way, so it is recorded at user-report tier; it is nonetheless the only claim
   anyone has made about Super Max eligibility, and it is self-consistent with
   Niantic having shipped Super Max and the "+" moves as one feature. The
   practical consequence is that item 1's +2 effective levels must **not** be
   grantable to the ~46 megas with no "+" move — before 2026-09-10 the engine
   handed that CP bump to any mega whose scenario asked for Super Max.

**The in-game client displays a "+" move's damage, and it moves with Mega
Level.** `[user-report]`, 2026-09-09 — the user's group owns Mewtwo at what
they call **"lvl 3"**, and reports the move display "shows a number next to the
move." ⚠️ **Do not map "lvl 3" onto one of this file's four named tiers.** The
client's own numeric labelling has never been confirmed against Base / High /
Max / Super Max, and a source cited elsewhere in this section calls Super Max
"Mega Level 4" — which would make "lvl 3" our `"max"`, not `"super-max"`. That
inference is plausible and unverified; an earlier draft of this very entry
asserted it as fact and had to be corrected. Leave it open.

The observation settles the weaker of the two questions in item 2: the scaling is real,
per-tier, and surfaced by the game itself, so it is not a community invention.
It does **not** settle the `+10%` magnitude. It does, however, describe a
**directly checkable** experiment that would retire the estimate outright: one
reading of (move name, Mega Level, displayed damage) for a known "+" move pins
the real multiplier. Nobody has yet supplied one — ask for it before trusting
the curve any further.

**The 1.3x mega/primal team-wide damage boost is UNCHANGED at every tier,
including Super Max.** Reconfirmed across three independent research rounds
(2026-09-08, and twice on 2026-09-09); no source has ever described Mega
Level, Super Max, or the "+" moves as touching it. This *corroborates*
CLAUDE.md's standing decision rather than threatening it — cite this entry
next time a mega content update raises the worry.

⚠️ **Numeric coincidence worth guarding:** the Super Max "+"-move multiplier
is `1.3`, and so is the mega/primal team boost. They are unrelated, and one
is a load-bearing project constant while the other is an unverified community
estimate. Never derive one from the other or share a constant between them.

**Engine: implemented** (`megaLevel.ts`). `MegaLevel` is a scenario input, not
a `SpeciesDefinition` field — a per-candidate 2-tuple on the Comparator and
per-slot elsewhere, round-tripped through all six tabs' share links.
`MEGA_LEVEL_PLUS_MOVE_POWER_MULTIPLIER` holds the estimated curve (and
cross-references the team boost as the documented coincidence above);
`SUPER_MAX_EFFECTIVE_LEVEL_BONUS = 2` applies the effective-level step via
`effectiveLevelForMegaLevel`; `chargedMoveAtMegaLevel` scales a "+" move's
power and is an exact no-op for every ordinary move. **Eligibility (added
2026-09-10):** `canReachSuperMax(species)` returns true only when the species
carries a move with `isPlusMove`, and `comparison.ts`'s
`resolveCandidateMegaLevel` — the one gate every orchestration path routes
through — **clamps** a `"super-max"` request down to `"max"` for anything
else. Before that clamp existed, asking for Super Max on any of the ~46
megas with no "+" move silently granted them the +2 effective levels, which
is why an old share link doing exactly that now computes a lower (correct)
number. The clamp is deliberately a clamp, not a throw, so a stale link
degrades instead of erroring. `breakpoints.ts` is the one module it can't
reach — its functions take raw stat numbers, never a species — so its
callers pre-resolve. Mega Energy cost and
cooldown are **not modelled at all** — a per-species currency this engine has
no concept of, and irrelevant to a single fight's math.

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

### A boss fast move at ≤0.5s cannot be fast-dodged at all — and that is arithmetic, not a bug

Diagnosed 2026-09-10 (`engine-developer`) after two separate UI agents reported a
"fast-attack lockout". The conclusion is that the engine is right and was merely
illegible: with `dodgeFastAttacks` on, an attacker facing a boss whose fast move
recycles at **0.5s or faster** does **literally zero** damage, forever, and that
is the correct answer.

**Why.** `DODGE_COST_SECONDS` is `0.5`, and `simulate.ts` pushes the attacker's
next fast-move eligibility back by that amount **once per dodged boss fast hit**,
unconditionally. If the boss's own fast move has period `P ≤ 0.5s`, the push
arrives at least as fast as real time elapses, so the attacker's eligibility can
never catch up. A provable livelock, confirmed empirically at exactly `P = 0.5`
against real Mega Tyranitar and real **Bite** (`durationMs: 500` — sitting
exactly on the boundary): `totalFastMoveDamage: 0`, `chargedAttacksLanded: 0`.
No off-by-one and no tick-quantisation artefact — `DODGE_COST_SECONDS` is itself
tick-aligned.

This is consistent with the already-recorded first-party `dodgeDurationMs: 500`
above, and it is the engine's expression of something the user said long before
the engine could show it:

> *"I can technically calculate dodges into the math but lord save me if you have
> to dodge every fast attack from kyogre just choose a different mega"*

**A second-order finding, verified rather than assumed.** The only escape route
is the attacker's own charged-move cast, since dodging is never attempted
mid-own-animation, so real time can close the gap during a cast. But "true zero
forever" does **not** require chip energy to fail to accumulate. It is reachable
even when energy accrues fine: reaching the charged move's cost on chip damage
alone means the attacker has already spent most of its HP getting there, leaving
too little margin to survive a full-damage boss hit landing mid-cast (mid-animation
hits are never dodge-reduced, by separate pre-existing design). The cast is
interrupted before it completes.

**Not the same as** the `holdChargedMoveUntilSafe` open question recorded below —
that concerns dodging timed around a *held* cast. This is `dodgeFastAttacks`
against the boss's own fast-move cadence. Adjacent, unrelated.

**Engine: detected and reported, deliberately NOT "fixed."** Changing the numbers
would be inventing damage the model says isn't there. Instead the condition is
now surfaced, following the existing `bossChargedMoveCadenceClamped` precedent
("config hit a structural floor — flag it, never silently adjust"):

- `fastMoveCadenceTooFastToDodge(fastMoveDurationSeconds)` in `breakpoints.ts` —
  a pure predicate (`≤ DODGE_COST_SECONDS`) usable for a live warning on the
  toggle itself, with no simulation run.
- `dodgeFastAttacksLockout: boolean` on `StepwiseRunResult`, `DistributionSummary`,
  `SustainedCandidateResult` (so it reaches the Comparator and Species Report for
  free via an existing spread) and `TeamRaidSlotResult` (per slot).
- Deliberately not wired into `rosterPlanner.ts` — that never calls the stepwise
  simulator directly and its output is too many layers of aggregation removed from
  a per-tick diagnostic.

### Unconfirmed: dodge damage may scale with remaining HP

Silph Road observed a player surviving 8 dodged Paybacks where 4–5 was
expected, with damage decreasing per dodge down to ~1 point. They flag it as
needing confirmation and have no formula for it.

**Engine: NOT MODELLED, and should stay that way until confirmed.** Recorded so
that anomalous survivability reports are recognised rather than investigated
from scratch.

### OPEN QUESTION: how much of the attacker's own time is lost dodging around their own charged-move cast (holdChargedMoveUntilSafe)

`holdChargedMoveUntilSafe` (`simulate.ts`'s `StepwiseAttacker`) holds the
attacker's charged move until either the attacker just dodged one of the
boss's charged hits (the "safe window") or its energy hits `MAX_ENERGY`
(forced). The real-game question this raises: when a player is doing this —
timing their own charged-move throw around a dodge — how much of their own
attack cycle does that dodging actually cost, compared to the ordinary single
`DODGE_COST_SECONDS` (0.5s) already modelled per dodge attempt elsewhere?
**No source establishes this** — every other dodge-cost figure in this file
(the 0.25 multiplier, the 500ms `dodgeDurationMs`) is confirmed first-party,
but nothing addresses the specific case of dodging both immediately before
AND after a held charged-move cast.

**Engine (2026-09-09): a labelled placeholder assumption, not a sourced
mechanic.** While `holdChargedMoveUntilSafe` is on, each of the boss's
CHARGED hits the attacker actually attempts to dodge costs
`HOLD_CHARGED_MOVE_DODGE_ATTEMPTS * DODGE_COST_SECONDS` (2 x 0.5s = 1.0s)
instead of the ordinary single `DODGE_COST_SECONDS` — modelling "dodge once
right before throwing the held cast, once right after" as two separate dodge
inputs. This only applies when a charged-attack dodge is actually attempted
(`dodge.kind !== "none"`, not mid the attacker's own animation); it never
touches boss FAST hits. This is explicitly **pending improvement** — if a
better-sourced model (or a source establishing the real figure) turns up,
replace it rather than treating the current constant as settled.

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
- **Super Max "+" moves.** **16** mega species have an extra Charged Attack
  usable only while Mega Evolved (Brave Bird+, Volt Tackle+, Outrage+, …),
  confirmed verbatim on official pokemongo.com posts and re-verified
  adversarially 2026-09-09. None of these movementIds exist in GAME_MASTER at
  all, so no sync can pick them up. `[first-party]` for the mechanic; the
  per-species powers are published unevenly, at three distinct tiers (all
  figures are **raid**-context and all are **Base**-tier readings, confirmed by
  4 of 4 checkable anchors — not ceilings):
  - `[first-party]` **3**: Brave Bird+ 150, Dark Pulse+ 150, Fell Stinger+ 140
    (base moves 130 / 80 / 45). Brave Bird+ is also **70 in Trainer Battles**,
    the one move with a published two-context split.
  - `[community-consensus]` **1**: Zap Cannon+ 160 — two independently-run
    community sites agreeing.
  - `[unverified]` **11**: Seed Bomb+ 150, Volt Tackle+ 170, Drill Peck+ 170,
    Outrage+ 185, Dynamic Punch+ 130, Future Sight+ 140, and — added
    2026-09-10 — Acid Spray+ 160, Brick Break+ 150, Liquidation+ 180,
    Mystical Fire+ 140, Psybeam+ 170, Surf+ 130. Each rests on a single site's
    own dedicated page for that specific move (`db.pokemongohub.net`), which
    is why they ship at this project's `community-estimate` confidence tier
    rather than `cross-site`.

  **RESOLVED 2026-09-10: the last 6 unknown powers.** Until this date the six
  moves added above had **no raid-power figure from any source**, and were
  deliberately excluded from `SUPER_MAX_PLUS_MOVES` rather than filled from
  PvPoke's PvP dataset — PvP and raid values demonstrably differ on the base
  moves underneath them (base Fell Stinger is PvE 33 vs PvP 35, Seed Bomb PvE
  33 vs PvP 40). **That warning still stands in general: a PvP number is not a
  raid number, do not substitute one.** It simply no longer applies here — the
  user read all 15 rows off `db.pokemongohub.net`'s own raid-context move
  pages on 2026-09-09 and supplied them directly, and the site states these
  are the complete set, so absence from it is itself meaningful (Brave Bird+ /
  Mega Staraptor is correctly absent, undebuted until 2026-09-19).

  **Raid energy cost: every "+" move costs 100, regardless of its base move.**
  `[community-consensus]` — `db.pokemongohub.net` per-move pages, fetched
  2026-09-09 (user-supplied lead), each stating verbatim "In Gym and Raid
  battles, it deals N damage and it costs 100 energy," with separate and
  different PvP figures. Three earlier research rounds recorded this as
  unpublished — that was a confident negative that turned out to be wrong, so
  treat "nobody publishes X" as a statement about search coverage, not about
  the world.

  **Strengthened 2026-09-10 to 15 of 15.** The obvious worry about that source
  was that a flat "100 energy" on every page is a template default rather than
  real data. It is not. The 15 base moves underneath span **three** different
  real energy costs in GAME_MASTER — 33 (Drill Peck, Volt Tackle, Fell
  Stinger, Seed Bomb, Brick Break, Liquidation, Mystical Fire), 50 (Dark
  Pulse, Outrage, Dynamic Punch, Acid Spray, Psybeam, Surf) and 100 (Zap
  Cannon, Future Sight) — and all 15 "+" moves read 100 regardless. A template
  default could not produce a uniform value that *contradicts* the underlying
  data in 13 of 15 cases; a real uniform rule is the only reading left.

  **Duration: 15 of 15, exact.** Independently re-checked 2026-09-10 against
  the committed `data/raw/game_master.json`: every one of the user's 15
  durations equals the base move's own `durationMs` to the millisecond,
  including all 6 moves that had no power figure at the time the original
  11-of-11 check was run. This is now the best-evidenced assumption in the
  whole "+" move model.

### RESOLVED: Form-change `moveReassignment` grants moves that appear in no movepool array

`[first-party]`, from the GAME_MASTER dump itself, established 2026-09-10 after
the user reported four "missing" signature moves (Behemoth Blade, Behemoth Bash,
Moongeist Beam, Gigaton Hammer).

This is the **opposite** shape to the entry above, and the two are easy to
confuse. There, the move template exists and no species template grants it —
nothing a sync can do. Here the grant **is** in GAME_MASTER, just not in the
field every sync reads. A form's own `pokemonSettings.quickMoves` /
`cinematicMoves` / `eliteCinematicMove` can omit a move it really has, because
the grant is recorded on `pokemonSettings.formChange[].moveReassignment`
instead — a *transition* table describing what happens to a moveset when the
Pokémon changes form.

Each `moveReassignment.cinematicMoves[]` entry sits on a **declaring** form and
names a **target** form (`formChange[].availableForm`). Its two arrays are
ownership claims about two different forms:

- `existingMoves` — moves the **declaring** form holds, that get replaced on
  transition.
- `replacementMoves` — moves the **target** form holds after the transition.

The whole dump carries only 18 such entries, covering six forms. Zacian and
Zamazenta declare theirs from **both** directions (Hero→Crowned lists the move
as a `replacementMove`; Crowned→Hero lists the same move as an `existingMove`),
which independently confirms the reading above; the fusion cases are one-way, so
`replacementMoves` → target is the operative direction.

| Form | Move it really has | How it is declared |
| :--- | :--- | :--- |
| Zacian (Crowned Sword) | `BEHEMOTH_BLADE` | both directions |
| Zamazenta (Crowned Shield) | `BEHEMOTH_BASH` | both directions |
| Necrozma (Dawn Wings) | `MOONGEIST_BEAM` | `replacementMoves`, FUSE from Necrozma |
| Necrozma (Dusk Mane) | `SUNSTEEL_STRIKE` | `replacementMoves`, FUSE from Necrozma |
| Kyurem (Black) | `FREEZE_SHOCK` | `replacementMoves`, FUSE from Kyurem |
| Kyurem (White) | `ICE_BURN` | `replacementMoves`, FUSE from Kyurem |

In every case the move's own `V####_MOVE_*` template is present and complete —
only the *assignment* was being missed, so this costs nothing but a read of one
more field.

Kyurem Black/White are the reason this matters beyond tidiness: Kyurem is a real
recommendation the Power-Up Optimizer has surfaced on the user's own roster, and
it was being simulated without the signature move it actually has.

**Not** an instance of this shape: **Gigaton Hammer**, which the user cited as
Tinkatuff's. It is Tinkaton's, sits in Tinkaton's ordinary `cinematicMoves`, and
already syncs correctly. Tinkatuff (the middle stage) does not learn it in
Pokémon GO, and its absence there is correct.

**Engine: not modelled, and it doesn't need to be** — this was always a
data-layer gap, not an engine one; the engine has always correctly consumed
whatever `chargedMoves` the sync produces.

**Data layer: fixed 2026-09-10.** `fetchGameMasterData` (`scripts/sync-data/
fetchCache.ts`) now keeps each pokemonSettings template's `formChange`
entries (filtered to move-bearing ones only — see
`GameMasterFormChangeEntryRecord` in `rawShapes.ts`) instead of discarding
the field at fetch time. A new pure module, `scripts/sync-data/
formChangeMoveGrants.ts` (`resolveFormChangeMoveGrants`), resolves both
directions and unions the result onto the correct form's `cinematicMoves`/
`quickMoves`, de-duplicated (unit-tested: both directions, the absent-
`existingMoves` fusion case, de-duplication across up to 5 independent
asserting entries, the elite-array self-grant no-op, skip-and-report for an
unresolvable move or target form). All six moves confirmed present in
`data/normalized/species.json` after a live re-sync the same day; two are
pinned at value level in `scripts/sync-data/test/normalizedGolden.test.ts`
(Kyurem Black's Freeze Shock, Zacian Crowned Sword's Behemoth Blade — the
latter also serving as the id-stability sentinel for the companion
display-name fix below).

### Changing a move: the four TM items, and what each can't touch

Researched 2026-09-10 (`pogo-researcher`) to price move changes as Power-Up
Optimizer candidates. Nothing about *how TMs work* was recorded here before —
the "Second charged move unlock" entry below covers only that unlock's cost.

**Exactly four items exist**, no others: **Fast TM**, **Charged TM**, **Elite
Fast TM**, **Elite Charged TM**. `[community-consensus]` Bulbapedia, one page
each, corroborated across every guide checked.

| | outcome | legacy/event moves | scarcity |
| :--- | :--- | :--- | :--- |
| Fast / Charged TM | **random**, always a *different* move | can never be **learned** this way | plentiful — raids, GBL sets, research |
| Elite Fast / Charged TM | **player picks** | can be learned | genuinely single-digit for most players |

Bulbapedia, verbatim: a regular TM *"changes its Fast/Charged Attack to a
random, **different** move in the Pokémon's current move pool"*, and
*"Legacy and event-exclusive moves … cannot be learned this way."*
`[community-consensus]`

Two consequences the wording makes easy to miss:

- A regular TM is **never a wasted no-op** — the result is guaranteed different
  from what you had.
- The exclusion is about *learning*, not *holding*. A Pokémon that currently
  holds a legacy move and gets regular-TM'd **loses it**, and no regular TM can
  give it back. Only an Elite TM can. `[inference from the two quoted rules —
  not separately stated by any source, but it follows directly.]`

**Elite TM scarcity is structural, not incidental.** Both free routes demand
heavy PvP: GO Battle League Season 28's seasonal research grants one at 400
wins and one at 500 wins, and ladder Rank 19 guarantees one of each per season.
Otherwise they appear in ~1,280-coin Community Day boxes, rare Route rewards,
and occasional compensation grants. `[community-consensus]`, checked against
the live season 2026-09-08. A roster owner realistically holds 0-3.

**On a Pokémon with two charged moves**, the player first chooses *which* slot
the TM rerolls, then it behaves normally. Bulbapedia, verbatim: *"If it has
multiple Charged Attacks, the player chooses which move to replace upon using
the item."* Fast moves never have this ambiguity — there is always exactly one
fast slot. `[community-consensus]`

**No TM of any kind can touch these:**

- **Frustration / Return** — see the next entry.
- **Signature moves**: Behemoth Bash, Behemoth Blade, Dynamax Cannon, Secret
  Sword. Structurally the same "granted, never TM'd" category as the
  `formChange` grants recorded above — Behemoth Blade/Bash reach this project
  *through* that mechanism, so the two entries agree.
- **Smeargle** — moveset fixed at catch, un-TM-able entirely.
- **Super Max "+" moves** — additive, granted by Mega Evolving, never members of
  any `cinematicMoves` pool, so never a TM target in either direction.

**No cost, cooldown, or per-day limit** on applying a TM you already own —
instant and repeatable. `[community-consensus by absence of contrary evidence
across several exhaustive pages.]`

⚠️ **The randomness distribution is NOT confirmed uniform.** "Uniform over the
pool minus the current move" is the standard assumption every community
calculator uses and the only practical one to build against, but Niantic has
never stated it and community suspicion is real rather than noise (a GamePress
Q&A titled "Are Charged TMs Truly Random?" existed; that whole domain is now
dead — see the source catalog). Any expected-value number built on it inherits
that uncertainty and **must be labelled an assumption on screen**, not
presented as fact.

**Engine: not modelled.** No TM item, inventory, or move-change action exists
anywhere in `packages/engine` or the Power-Up Optimizer today.

### Frustration is event-gated; purification is not

`[first-party]` for the move numbers, straight from `data/raw/game_master.json`:
**Frustration** is power 10 / energyDelta -33 / 2000 ms; **Return** is power 25
/ energyDelta -33 / **500 ms**. Same energy, 2.5× the power, a quarter of the
time exposed — Frustration is the weakest charged move in the game by design.

Every Shadow Pokémon knows Frustration, and **neither a regular nor an Elite
Charged TM can remove it except during a branded "Taken Over" event**. Confirmed
against a real dated event page (`pokemongohub.net`, "Steeled Resolve: Taken
Over", 2026-04-30 to 2026-05-04): *"You can use a Charged TM to help a Shadow
Pokémon forget the Charged Attack Frustration."* Roughly six such events across
2025-2026 — call it quarterly: worth planning around, not "basically never."
During the window both TM types work normally; the event's only effect is making
Frustration an eligible reroll target. Once removed, it can never be relearned.
`[community-consensus]`

**Purification is the always-available alternative** and needs no event: it
replaces Frustration with Return in the first charged slot automatically, and
does not touch the fast move. `[community-consensus]` Bulbapedia, verbatim:
*"Learn Return, replacing the Charged Attack in the first slot."*

Stated plainly because it is easy to assume otherwise: **Purified gets no TM
discount, because TMs cost no stardust or candy for anyone.** The ×0.8 Purified
rate flagged in the second-charged-move entry applies to that unlock and to
power-ups — never to TM application, which is free once the item is owned,
regardless of Shadow/Purified/Lucky.

**Engine: not modelled**, and consequential — a Shadow attacker in an imported
roster is simulated on whatever charged move resolved, with no notion that it
may be stuck on a power-10 move for most of the year.

### A blank move column means "not captured", never "has no move"

Established 2026-09-10 by two independent passes (`pogo-researcher`,
`pogo-player`) after a feature spec proposed treating a Poke Genie row with no
move data as a Pokémon *needing a TM for both slots*. Recorded because the
premise is wrong in a way that would have silently mispriced roughly half a real
roster.

**The game fact, which needs no source:** every Pokémon in a player's storage
has exactly one fast move and one or two charged moves **at all times** — moves
are assigned on capture, hatch, evolution and trade, and no state exists in which
a Pokémon holds none. So a blank cell in an export can only ever mean *the export
did not capture that field.* It can never mean the Pokémon lacks a move.

`[speculative]` as to why it happens so often: Poke Genie's Batch Scan reads the
storage **list** view, which does not show per-Pokémon moves, unlike the
individual detail screen. Unconfirmed, and not needed for the conclusion.

**Empirically it does not correlate with "untouched", either.** On the committed
`packages/web/src/import/test/pokeGenieSample.csv` (23 rows): 12 rows have both
moves, 2 fast only, 1 charged only, and **8 have neither**. Most of the 8 are
level-1-to-13 mules — but two are not: a kept Rayquaza at 82.2% IV, and a kept
Hisuian Sneasel. Blank hits invested Pokémon.

**There is a third state, and `movesetIsDefaulted` currently hides it.**
`packages/web/src/import/pokeGenieMatch.ts` computes
`movesetIsDefaulted = fast.id === null || charged.id === null`, which conflates:

1. a genuinely blank cell (`unmatchedMoveNames` empty), and
2. a move name that *was* recorded but did not match this project's own move data
   (`unmatchedMoveNames` non-empty) — a staleness problem on our side, not a
   missing moveset. Live example in that same sample: a Raticate (Alola) row
   recording **"Return"**.

**Engine: the fallback is implemented, the distinction is not.** Both cases fall
back to `species.fastMoves[0]` / `chargedMoves[0]` identically. The correct third
state is **"moveset unknown — verify in game"**, kept structurally separate from
"known and suboptimal": recommending a TM (let alone a single-digit-supply Elite
TM) against a moveset the tool never observed spends a real item to fix something
that may not be broken.

### A Mega form has no movepool of its own

`[first-party]`, read directly out of `data/raw/game_master.json` for two
species. `tempEvoOverrides` carries only stats, type overrides and Mega Energy
costs — never its own `quickMoves` / `cinematicMoves` / elite arrays:

```
"pokemonId": "BLAZIKEN", "quickMoves": [...], "cinematicMoves": [...],
"tempEvoOverrides": [{ "tempEvoId": "TEMP_EVOLUTION_MEGA", "baseAttack": 329, ... }]
```

A Mega/Primal is a temporary transformation flag on the same underlying
Pokémon, not a second stored entity. **A TM on the base form is a TM on the
Mega form** — there is no separate "which form holds which move" question, and
nothing to reconcile between this project's separate mega species entries and
their bases. The Super Max "+" moves are not a counter-example: they are
additive and granted at Mega Evolution, never stored in a movepool array.

**Engine: consistent by construction** — mega species are built from the base
species' resolved moves plus any attached "+" move, so this already holds.

### RESOLVED: a DPE sanity check caught a wrong "+" move energy assumption

Recorded 2026-09-09, then resolved the same day. Kept because the *method*
generalises: a plausibility check against the real move distribution caught a
bad assumption before it shipped, and the prediction it made was confirmed.

**The problem.** Inheriting each "+" move's energy from its base move made
several of them better than **every real charged move in the game** on
damage-per-energy. The real ceiling is Mind Blown at **DPE 3.94**
(`FISSURE`/`HORN_DRILL` at 9000 power are OHKO placeholder templates, not raid
moves — exclude them):

| Move | Assumed | DPE | Corrected | DPE |
| :--- | :--- | :--- | :--- | :--- |
| Drill Peck+, Volt Tackle+ | 170 / 33 | 5.15 → would be #1 of 243 | 170 / 100 | 1.70 |
| Seed Bomb+ | 150 / 33 | 4.55 → would be #1 | 150 / 100 | 1.50 |
| Fell Stinger+ | 140 / 33 | 4.24 → would be #1 | 140 / 100 | 1.40 |
| Outrage+ | 185 / 50 | 3.70 | 185 / 100 | 1.85 |
| Dark Pulse+ | 150 / 50 | 3.00 | 150 / 100 | 1.50 |

The tell was that the implausibility tracked the **base move's** cost, not the
"+" move's power — the 33-energy bases were absurd while the 50- and
100-energy ones looked fine. That pointed at the inherited field rather than
at the (partly first-party) power figures.

**The resolution.** The prediction — "expect the 33-energy bases to price
higher" — was confirmed: every "+" move costs a flat **100** energy in raids
(see the entry above for sourcing). All eight now land at DPE 1.30-1.85.

**Two lessons worth keeping.**
1. A uniform value across every row is not automatically a template default.
   This project had been burned by exactly that (dittobase emitting `-100`
   everywhere), and the reflex to distrust uniformity was right — but the
   *test* is what settles it. Checking the same source's ORDINARY moves against
   our own `game_master.json` gave 11 of 11 exact matches on power, energy and
   duration, including base Volt Tackle at 33 and base Zap Cannon at 100. A
   default cannot produce both. **Validate a suspicious source against data you
   already trust rather than rejecting it on shape.**
2. Inheriting a field from a related record is a guess wearing the costume of
   data. It reads as sourced in code review because the value came from
   GAME_MASTER — but which record it came from was the assumption.

**Engine: implemented with the corrected values** (`scripts/sync-data/superMaxPlusMoves.ts`
carries explicit per-entry raid energy; duration is still inherited, and that
one IS corroborated).

**Engine: Apex not modelled; "+" moves implemented for 8 species.** An Apex
Lugia here still uses the 180-power Aeroblast, not 225 — errs in the safe
direction. The "+" moves ship as real charged moves on the 8 mega species that
have both a raid-power figure and a base-move template to inherit timing from
(`scripts/sync-data/` owns the hand-curated, per-entry-cited table;
`ChargedMove.isPlusMove` and `.plusMovePowerConfidence` carry the marker and
the tier into the UI, which badges anything below first-party). Power comes
from the table; **duration and energy are inherited from the base move's
global GAME_MASTER template** — the first `[community-consensus]` per above,
the second explicitly `[unverified]` and resting only on the Apex
Lugia/Ho-Oh precedent, where `energyDelta` is identical across every `_PLUS`
tier. Those are two different confidence levels on one move object; don't let
the duration evidence launder the energy assumption.

Deliberately still absent: the 6 species with no raid power, and Mega Mewtwo
Y's Future Sight+ — excluded on **sourcing**, not on missing data. Its only
power reading (140) is a single self-labelled community estimate whose own
page 404s, weaker than any of the 5 accepted `[unverified]` entries.

⚠️ Note the movementId trap here: it is **`FUTURESIGHT`**, with no underscore,
and it *is* in the dump (115 / -100 / 2500ms) — a grep for `FUTURE_SIGHT`
returns nothing and reads as "the move doesn't exist." That mistake was made
once during this feature's research and briefly written into this file as the
reason for the exclusion. GAME_MASTER movementIds are not uniformly
underscore-separated; confirm a negative before recording one.

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
