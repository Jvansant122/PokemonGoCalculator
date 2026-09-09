---
name: fact-dodge-gamemaster-field-confirmed
description: Real GAME_MASTER/protobuf field names and values behind the 0.25 dodge damage multiplier and 0.5s/0.7s timing constants, with a real independent-engine cross-check
metadata:
  type: project
---

Researched 2026-09-09, overnight dodging deep-dive (answers Q1 of that pass).

## The field names and values, cross-checked two independent ways

`biowpn/GoBattleSim-Engine` (a real, open-source C++ raid/PvP simulator, GPL-3.0, unrelated to
this project) hardcodes these as its `GameMaster` class defaults, read directly from
`include/GameMaster.h` (fetched 2026-09-09):

```
unsigned dodge_duration{500};                    // ms
unsigned dodge_window{700};                       // ms
double dodge_damage_reduction_percent{0.75};       // fraction of damage REMOVED
```

And its `setting/GBS.json` (also fetched 2026-09-09), under a section literally named
`PvEBattleSettings`:

```
"dodgeDurationMs": 500,
"dodgeDamageReductionPercent": 0.75
```

`Battle.cpp` consumes these as `GameMaster::get().dodge_duration`,
`GameMaster::get().dodge_window`, and
`damage = (1 - GameMaster::get().dodge_damage_reduction_percent) * damage` — i.e. the field is
named as the *fraction removed* (0.75 removed → 0.25 remains), matching this project's
`DODGE_DAMAGE_MULTIPLIER = 0.25` exactly.

**Corroboration tier**: [community-consensus], but unusually strong for that tier — this is a
second, structurally independent reverse-engineering effort (not just prose repeating a number)
landing on the exact same three numbers (0.75/500ms/700ms) this project already had from
pokemongohub.net's "Close Calls" article. GoBattleSim-Python's own `GameMaster.py` confirms the
raw GAME_MASTER templateId is literally `COMBAT_SETTINGS` (data key `combatSettings`), which the
tool treats as a generic key-value dict — meaning `dodgeDamageReductionPercent`/`dodgeDurationMs`
are almost certainly the actual camelCase field names Niantic uses in `COMBAT_SETTINGS`, not an
invented name. I could not fetch the live GAME_MASTER JSON directly to see this key populated
in-place (10MB WebFetch cap; grep.app/GitHub code search/Sourcegraph all blocked or 403/429 in
this environment) — so this stops short of [confirmed], but it's about as close as this
environment lets me get.

**Important staleness caveat**: both GoBattleSim-Engine files above were last touched **January
2020** (verified via GitHub commit history) — five years before the Sept 2024 combat rework. They
agree with a 2019-dated pokemongohub.net article and a 2016-dated fevgames.net article on the same
three numbers, so there is unanimous **pre-2024** agreement, but **zero source found that
re-confirms these specific numbers post-Sept-2024**. Treat 0.25/500ms/700ms as "long-standing,
never seen to change" rather than "verified current as of 2026." See
[[fact_dodge_dec2024_window_fix]] for what *is* dated post-rework (a change to the practical dodge
*window*, not a change to these three underlying constants — no source claims those changed).

## Engine status

`packages/engine/src/breakpoints.ts`: `DODGE_DAMAGE_MULTIPLIER = 0.25` and
`DODGE_COST_SECONDS = 0.5` are both implemented and consumed computationally in `simulate.ts`.
`DODGE_WINDOW_SECONDS = 0.7` is defined but, per the constant's own doc comment, consumed only as
prose justification — never computationally (`perfectlyDodgeable` is a hand-set per-move boolean,
not a timing check against this window). This research doesn't change that status; it just
raises confidence in the three numbers already chosen.
