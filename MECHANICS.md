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

**Engine: NOT MODELLED — the most significant known gap.** `simulate.ts`
derives boss charged-move readiness from the boss's own fast moves only
(`bossChargedMoveReadySeconds`, simulate.ts:341) plus a user-set mean interval.
The attacker correctly gains energy from damage taken (simulate.ts:459); the
boss does not.

The consequence sits directly on this project's thesis: in the real game a
**higher-DPS attacker makes the boss fire charged moves faster**. The engine
misses that feedback loop entirely, so it systematically under-penalises glass
cannons on survivability. Closing it would add a genuine ranking-flip axis
rather than a refinement.

### The charged-move decision is a 50% roll, made instantly

When a boss has enough energy it has a **50% chance** to use its charged move
(reverted from a brief 100% "spam" period). Crucially, bosses now decide
**instantly** rather than planning one turn ahead as the pre-2024 system did.

**Engine: NOT MODELLED.** The engine uses a mean interval with ±40% jitter — a
statistical stand-in for this energy-plus-probability process, not a mechanical
reproduction of it.

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

Per-move windup-to-flash delay reportedly varies by move (Flamethrower ~1.0s,
Earthquake ~1.3s, Solar Beam ~2.3s, Fire Blast ~2.9s) rather than being flat.
`[unverified]` — referenced via a community chart, not directly confirmed.
pogoapi exposes no per-move windup field, so this is not derivable from our
current data sources.

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

### Move durations are 500ms-aligned

320 of 321 GAME_MASTER moves have durations that are exact multiples of 500ms
(the exception being `DIVE` at 3300ms). Verified 2026-09-08.

**Engine: matches GAME_MASTER exactly** on power, energy and duration for every
move spot-checked. Note that Bulbapedia lists different duration figures (Leaf
Blade 2.4s against GAME_MASTER's 2.5s) — a different convention on that wiki,
not a contradiction. Prefer GAME_MASTER.

---

## Known bugs in the real game

Recorded so we neither model a bug as intended behaviour nor mistake one for
ours.

- **Shadow raid bosses (T3/T5) lose almost all defense at 15% HP.** Once an
  enrage-capable shadow boss crosses 15% HP its defense drops to a very small
  non-zero value — weak moves like Lock-On then carve out huge chunks. Suspected
  bug as of late September 2024. **Engine: not modelled**, correctly — we should
  not reproduce a suspected bug.
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
