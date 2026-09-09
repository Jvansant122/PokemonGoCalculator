---
name: fact-best-buddy-cp-boost-magnitude
description: Best Buddy CP Boost (buddy-adventure status, distinct from friendship-with-other-trainers bonus) is worth +1 level equivalent (2 power-ups); GAME_MASTER field defaultCpBoostAdditionalLevel, already noted unmodelled in MECHANICS.md
metadata:
  type: project
---

[community-consensus], researched 2026-09-09. The **Best Buddy CP Boost** — earned
by walking/playing with a Pokémon set as your current buddy until it reaches Best
Buddy status — raises its effective stats by the equivalent of **two power-ups**,
i.e. **+1 whole level** (e.g. a level-40 Best Buddy plays as level 41; a maxed
level-50 Best Buddy plays as level 51, exceeding the normal level-50 cap). Sources:
Gamerant "Pokemon Go: Best Buddy CP Boost", pokeep.com Best Buddy guide,
Pokémon GO Fandom's Buddy Pokémon page — all agreeing on "equivalent to 2
power-ups." Applies in raids, gyms, Team GO Rocket, and PvP trainer battles alike;
only active while that Pokémon is your *current* buddy (not merely "has reached
Best Buddy status" — must be actively buddied).

**This is a completely different mechanic from the friendship-with-other-trainers
attack bonus** — see [[fact_friendship_raid_attack_bonus_correction]] for that one.
Best Buddy CP Boost is a stat/level increase from your relationship with your OWN
buddy Pokémon; the friendship attack bonus is a raid-lobby damage multiplier from
your relationship with ANOTHER TRAINER. MECHANICS.md already correctly separates
these two under "Power-up (level-up) costs" (`defaultCpBoostAdditionalLevel` noted
not modelled) — this entry just pins the exact magnitude with corroborating
sources.

**Engine: not modelled**, matching MECHANICS.md's existing note and the engine's
own `bestBuddy` field naming, which (per the sibling memory above) is actually
mis-scoped to represent the *other* mechanic anyway. No proposal here — recording
the number so it doesn't need re-deriving, and so a future "add Best Buddy" request
knows it means +1 level via `stats.ts`/CPM lookup, not a `damage.ts` multiplier.
