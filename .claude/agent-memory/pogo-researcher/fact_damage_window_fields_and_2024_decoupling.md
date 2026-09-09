---
name: fact-damage-window-fields-and-2024-decoupling
description: damageWindowStartMs/damageWindowEndMs are real per-move GAME_MASTER fields with concrete values, but Sept 2024 decoupled raid ENERGY timing from them — a nuance, not a debunk
metadata:
  type: project
---

Researched 2026-09-09, overnight dodging deep-dive (answers Q2 — this is the headline finding of
that pass).

## The fields are real, schema-confirmed, and per-move — this is new, not previously established

`POGOProtos.Settings.Master.MoveSettings` (confirmed via a Haskell protobuf-bindings package,
`pokemon-go-protobuf-types`, mirroring Niantic's actual `.proto` schema — fetched 2026-09-09)
defines, alongside `durationMs`:

```
damageWindowStartMs :: Int32
damageWindowEndMs   :: Int32
```

This is schema-level confirmation the fields exist in GAME_MASTER's move templates — a stronger
claim than the prior `[unverified]` MECHANICS.md note ("per-move windup... referenced via a
community chart, not directly confirmed"), which can now be upgraded.

**Concrete populated values**, fetched directly from `db.pokemongohub.net`'s individual move pages
(a live, currently-maintained community database, not a stale archive — see cross-check below)
on 2026-09-09:

| Move | Animation Duration | Damage Window (start–end) |
| :--- | :--- | :--- |
| Flamethrower | 2.0s | 1.3s – 1.5s |
| Earthquake | 3.5s | 2.6s – 3.4s |
| Solar Beam | 5.0s | 2.8s – 4.8s |
| Fire Blast | 4.0s | 2.9s – 3.7s |

**Cross-check that these are CURRENT (post-Sept-2024), not stale pre-rework numbers**: Pokémon GO
Hub's own 2024-09-01 article on the raid-move-duration rework gives post-change DPS figures for
these same moves (Earthquake 40.00, Solar Beam 36.00, Fire Blast 35.00). Using each move's known
raid power (Earthquake 140, Solar Beam 180, Fire Blast 140) and `DPS = power / duration`:
140/3.5 = 40.00 exactly, 180/5.0 = 36.00 exactly, 140/4.0 = 35.00 exactly — all three durations
fetched from db.pokemongohub.net reproduce the post-rework DPS figures exactly. This is a clean,
self-consistent numeric cross-check (not just "the site looks current"), so the Damage Window
figures above should be read as **current 2026 values**, not leftover pre-2024 data. Tier:
[community-consensus] (a wiki database, not an official patch note), but internally verified.

## The real nuance: Sept 2024 decoupled raid/gym ENERGY timing from this window — damage/dodge timing status is less clear

The same 2024-09-01 Pokémon GO Hub article states explicitly: post-rework, "moves generate and
consume full energy as soon as they are activated, rather than observing the 'damage window
start' and 'damage window end' timers," describing a shift to a "0.5 second cycle" duration-
rounding model (this matches [[fact_raid_boss_attack_timing]]'s already-recorded finding about
0.5s-cycle duration rounding — same event, now with an explicit mechanism given for *why*).

**What this means, stated carefully**: the fields still exist and are still populated per-move
(the table above proves that), but their functional role narrowed — **energy** crediting/spending
in raids and gyms no longer waits for the window, it happens on cast. Whether **damage
application** (and therefore dodge feasibility) still respects the per-move window is genuinely
unclear from what I could find: a separate, later article (2024-12-16, see
[[fact_dodge_dec2024_window_fix]]) describes the *practical* dodge window as spanning "between the
text notification... and the actual damage window," explicitly still naming "damage window" as a
live per-move concept, and says "some attacks remain hard to dodge... because the damage dealing
window is quite short" — implying per-move variation in the window still exists in-game and
matters for dodging, even though energy no longer waits for it. **I did not find a source that
resolves this ambiguity cleanly (energy decoupled, damage window's role for dodging is stated to
still exist but is not quantified anywhere post-2024) — flag as open, don't presume either
direction if this gets modeled.**

## What this repo's data-sync currently does — and could plausibly do

`data/raw/charged_moves.json` (pogoapi.net-sourced, already read directly 2026-09-09) has NO
damage-window field at all — its move records are `critical_chance`, `duration`, `energy_delta`,
`move_id`, `name`, `power`, `stamina_loss_scaler`, `type` only. So pogoapi genuinely doesn't carry
it, confirming the existing engine comment ("data pogoapi.net doesn't expose at all") is correct
**for pogoapi specifically**.

But `scripts/sync-data/fetchCache.ts`'s `fetchGameMasterData()` already downloads the full raw
GAME_MASTER array from PokeMiners (`GAME_MASTER_URL`) for other purposes — it just currently only
extracts `pokemonSettings` fields (species stats/moves lists) and the two Power-Up-Optimizer
settings templates, never touching `moveSettings.damageWindowStartMs/EndMs` or the `combatSettings`
template. **This means the field is plausibly one sync-data change away from being real, sourced
data** rather than a community-chart approximation — a genuine, actionable finding, not just
trivia. I am not proposing this as a comparator feature per my role's remit (a raw per-move
timing field, not a metric/scenario idea) — routing it back as a data-layer finding for
`data-sync`/`engine-developer` to evaluate, same as any other schema-gap finding I surface.

## Engine status

`packages/engine/src/types.ts`'s `ChargedMove.vulnerableWindowSeconds` is currently just set equal
to `durationSeconds` at gamemaster.ts sync time (`vulnerableWindowSeconds: durationSeconds`, no
independent value) — confirmed by direct read 2026-09-09. It is NOT derived from any per-move
damage-window data today. `DODGE_WINDOW_SECONDS` (flat 0.7s) remains prose-only per
[[fact_dodge_gamemaster_field_confirmed]]. **Not modelled**: per-move damage-window
start/end, at any layer.
