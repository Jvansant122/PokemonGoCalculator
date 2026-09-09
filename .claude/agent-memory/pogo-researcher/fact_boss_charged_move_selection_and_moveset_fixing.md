---
name: fact-boss-charged-move-selection-and-moveset-fixing
description: How a boss picks between two known charged moves (order-dependent independent coin-flip, per a corroborating open-source engine), and confirmation the boss's moveset is fixed once per raid rotation, not re-rolled per lobby
metadata:
  type: project
---

Researched 2026-09-09, answering "which charged move does a boss pick, and is the moveset fixed
or re-rolled per raid" — a gap neither `fact_raid_boss_attack_timing.md` nor
`fact_boss_charged_move_decision_cadence.md` (2026-09-08) addressed.

## Moveset is rolled once per raid rotation, not per lobby — `[community-consensus]`, Bulbapedia
## direct fetch

Fetched `bulbapedia.bulbagarden.net/wiki/Raid_Battle_(GO)` directly. Verbatim: **"The moves that a
Raid Boss knows is randomly selected from its standard move pool and will remain the same
throughout the entire raid. Therefore, different lobbies of players challenging the same Raid Boss
will all battle against the same move set."** Read plainly, this means the random roll happens
once per boss release/rotation (not once per individual raid instance/lobby) — every player
fighting, say, this week's Kyogre sees the identical fast+charged moveset, and it doesn't vary
lobby-to-lobby. A separate, unrelated fact on the same page: if a boss knows Hidden Power, it's
always Fighting-type in raids.

**Do not confuse this with the CAUGHT Pokémon's moveset**, which genuinely is randomized
per-catch/per-player — a completely different roll (post-catch IV/moveset generation), and a
`WebSearch` synthesis conflating the two surfaced during this pass and was discarded once the
direct Bulbapedia fetch disambiguated it.

**Engine relevance**: this validates the existing `compareAcrossBossChargedMoves`/
`BossMovesetSweep` feature (`packages/engine/src/comparison.ts`, `combat.ts`) as the *correct*
response to real uncertainty, rather than a gap to close — since a boss's live moveset is fixed
per rotation but not independently knowable without checking that specific rotation's data, a
sweep across the boss's candidate charged moves (`SpeciesDefinition.chargedMoves: ChargedMove[]`)
is the right modelling shape, not a "which move fires more often" split. No change recommended.

## Multi-charged-move selection, when a boss knows more than one — `[community-consensus]`,
## corroborated only by one open-source simulator's implementation, not an in-game observation

Re-examined `GoBattleSim-Engine`'s `src/Strategy.cpp` `defender_on_clear` (same repo already used
to corroborate the per-move-boundary trigger in `fact_boss_cadence_hybrid_model_sourcing.md`).
Exact logic:

```cpp
void defender_on_clear(const StrategyInput &si, Action *r_action) {
    r_action->type = ActionType::Fast;
    r_action->value = 0;
    auto projected_energy = get_projected_energy(si);
    for (unsigned char i = 0; i < si.subject->cmoves_count; ++i) {
        auto cmove = si.subject->get_cmove(i);
        if (projected_energy + cmove->energy >= 0 && ((si.random_number >> i) & 1)) {
            r_action->type = ActionType::Charged;
            r_action->value = i;
            break;
        }
    }
}
```

Interpretation: for each charged-move slot `i` (in a fixed order — index 0 first), the boss checks
(a) it has enough energy for that specific move, AND (b) an independent bit `i` of one shared
random draw is set. The **first** move index satisfying both wins; if neither does, it falls back
to a fast move. For a two-charged-move boss this means: move 0 gets first shot at its own
independent ~50% roll gated on its own (usually cheaper) energy cost; move 1 is only even
considered if move 0's check fails (either not enough energy for move 0, which can't happen once
both are affordable, or move 0's bit didn't hit) — so in practice, when both moves are affordable,
each has an independent coin-flip roll checked in a fixed slot order, not a single weighted "pick
one of two" choice. **This is one independent simulator's own modelling choice**, not itself proof
of Niantic's real algorithm — same corroboration tier as the rest of the GoBattleSim findings
already on record. No official or community-testing source was found that describes the real
in-game selection mechanism for a two-charged-move boss at this level of detail.

**Engine status**: not directly comparable — this engine's `StepwiseBoss.chargedMove` is always a
single resolved move per simulation run (the moveset-uncertainty question is handled by sweeping
across candidates externally via `compareAcrossBossChargedMoves`, not by modelling a live
multi-move choice inside one simulated fight). No gap to flag; the sweep approach sidesteps needing
this mechanism modelled at all.
