---
name: fact-struggle-energy-cost
description: Struggle's real energy cost differs by battle format — 0 in raids/gyms (PvE), 100 in trainer battles (PvP/GBL); pogoapi's 0 is correct for this project's PvE-only engine, not a bug
metadata:
  type: project
---

## The question

User asked (2026-09-08) to verify Struggle's energy cost before acting on a suspected data bug:
`data/raw/charged_moves.json` (pogoapi.net) lists Struggle (move_id 133) as `energy_delta: 0`,
and 42 species (Caterpie, Metapod, Weedle, Kakuna, Magikarp, Ditto, all Unown forms, Wurmple,
Silcoon, Cascoon, Kricketot, Burmy, Tynamo, Scatterbug/Spewpa, Cosmog/Cosmoem, Blipbug, Applin,
Dreepy, etc.) carry Struggle as their ONLY charged move, per this project's normalized species
data. A `0`-cost charged move is always affordable, so the engine can fire it at every decision
point. User's strong prior was that the real cost is 100.

## Finding: the cost genuinely differs by format — this is NOT a pogoapi bug

**[community-consensus, corroborated across 4 independent sources, 2026-09-08 fetch]**

- **Gyms & Raids (PvE): 0 energy.** Confirmed independently by:
  - Pokémon GO Hub's move database, `db.pokemongohub.net/move/133` (same move_id=133 as
    pogoapi) — "Gym and Raid Battles: Energy Cost: 0" (fetched 2026-09-08).
  - Bulbapedia `Struggle_(move)` raw wikitext (`action=raw`, fetched 2026-09-08) — historical
    patch log shows the raid/gym energy cost was changed a few times early on (20→0 on
    2016-07-30, 0→33 on 2017-02-16, 33→0 on 2017-02-21) and has sat at **0** since Feb 2017.
  - General web-search summary corroborating "Gym and Raid battles: 35 power, 0 energy cost."
- **Trainer Battles (PvP/GBL): 100 energy.** Confirmed independently by:
  - Same Bulbapedia raw wikitext: `pow_trainer=35 | energy_trainer=100`.
  - pvpoke's own `gamemaster/moves.json` (GitHub, `pvpoke/pvpoke`, fetched 2026-09-08):
    `{"moveId":"STRUGGLE","power":35,"energy":100,"energyGain":0,...}`.
  - Pokémon GO Hub's same move-133 page, "Trainer Battles (PvP): Energy Requirement: 100."
  - A GamePress search snippet also surfaced "-100 charge energy," consistent with the PvP figure
    (GamePress's own page 301-redirected away during a direct fetch attempt, so treat that one
    citation as weaker/unconfirmed on its own — corroborated by the three above instead).

**Conclusion: pogoapi's `0` is correct for the raid/gym (PvE) context this project's engine
actually simulates.** It is not a convention artifact, not a missing field, and not a sign-flip
mismatch with GAME_MASTER's negative-cost convention — Struggle really is coded as a free charged
move in PvE. The `100` the user recalled is real, but it's the **PvP-only** number; this project
has no PvP/GBL tab (its five tabs are Comparator, Team Raid Simulator, Species Report, IV
Breakpoints, Attack/Defense Breakpoints — all raid/gym-oriented per `CLAUDE.md`), so the PvP value
doesn't apply here.

**Not directly confirmed against the first-party GAME_MASTER JSON itself** — attempted a direct
fetch of PokeMiners' `game_masters/master/latest/latest.json`; it exceeded the fetch tool's 10 MB
response cap and a `grep.app` code-search fallback rate-limited (HTTP 429). The finding rests on
three independent secondary/community sources rather than the primary GAME_MASTER dump directly;
tag the overall conclusion **[community-consensus]**, not `[confirmed]`, on that basis — though the
sources are unusually consistent (one keyed to the exact same `move_id` used in this project's own
`data/raw`, one with a dated patch history, one an independent PvP simulator's own gamemaster
mirror) and I have no reason to doubt them.

## Special behaviour

- Struggle is not a runtime "no moves left" fallback the way it works in the main series (no PP
  mechanic in GO). In GO it is a **static per-species moveset assignment**: certain species —
  confirmed by web search to be exactly the same roster the user identified (Caterpie line,
  Weedle line, Magikarp, Ditto, all Unown, Wurmple line, Kricketot, Burmy, Tynamo, Vivillon
  pre-evos, Cosmog line, Blipbug, Applin, Dreepy, etc.) — simply have no other charged move
  entered in their GAME_MASTER moveset, so Struggle is their only charged-move slot, full stop.
  This is a real, intentional design choice by Niantic for weak/filler species, not a data gap.
- No evidence found of Struggle behaving differently for raid bosses vs. player-owned Pokémon
  within the PvE context — the 0-energy cost is the same-format number cited across sources
  without a boss/player split.
- Practical implication for this engine: for these 42 species, a 0-energy-cost Struggle spamming
  at every available decision point is a **faithful simulation of real game behavior**, not a bug
  the engine introduced. Real Magikarp/Caterpie/Ditto raid encounters and player-owned copies of
  these species genuinely can throw Struggle for free repeatedly in actual gameplay.

## Where an override would NOT belong (and where a future PvP field would, if ever wanted)

Per the user's question about `RELEASED_MEGA_PRIMAL_ALLOWLIST`-style override tables
(`scripts/sync-data/releasedMegaPrimalAllowlist.ts`): **no override is warranted** — the existing
`0` is the correct value for this project's PvE-only simulation domain, so changing it would
introduce a real bug where none currently exists. If a future PvP/GBL tab were ever proposed
(none exists today, and none of this project's 5 tabs model PvP), that would need a **new,
separate energy-cost field** for PvP context (not a same-field override, since raid/gym and PvP
values are both real and both currently correct for their respective formats) — sourced from
pvpoke's `gamemaster/moves.json` (`energy: 100` for STRUGGLE) or the GAME_MASTER `combatMove`
template directly. That's a data-sync-scope decision if it's ever pursued, not raised as a
proposal here since it's out of scope for the question asked.
