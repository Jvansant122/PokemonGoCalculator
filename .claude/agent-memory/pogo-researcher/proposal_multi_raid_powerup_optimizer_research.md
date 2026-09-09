---
name: proposal-multi-raid-powerup-optimizer-research
description: 2026-09-08 research pass grounding the Power-Up Optimizer's expansion from one-boss/6-slot to a 100-200 roster swept across ~30 recent raid bosses; six mechanics researched, recommendations given as text only
metadata:
  type: project
---

Requested 2026-09-08: research (not implement) what real mechanics become newly relevant when the
Power-Up Optimizer expands from "6-slot roster vs. one chosen boss" to "100-200 Pokémon (Poke
Genie CSV import) evaluated across the ~30 most recent raid bosses, team fielded per-boss still
capped at 6." Delivered as a full response (RESEARCHED/FINDINGS/PROPOSALS/CONFLICTS format), NOT
written to a repo file — the task instruction asked for
`RESEARCH_multi_raid_optimizer.md` at repo root, which conflicts with this role's explicit
boundary (Write restricted to this memory file only); declined by name, same precedent as
[[proposal_powerup_optimizer_flesh_out]] and [[proposal_fixed_budget_powerup_planner]].

**Six areas researched, findings filed as their own memory entries** (read those for detail,
this entry is the index/outcome record):
1. Party/lobby cap — confirmed 6/attempt, but a trainer CAN wipe-and-reselect a fresh 6 within
   one raid's timer (Bulbapedia raw wikitext, no documented limit on how many times). Already
   partially handled by this project's existing wipe-and-revive loop
   (`TeamRaidInputs`/`reviveCostSeconds`), which reuses the SAME 6 slots each cycle rather than
   drawing a fresh 6 from a larger pool — flagged as a real simplification, not a bug, and
   explicitly NOT the ruled-out Teambuilding Analyzer (single-trainer sequential re-selection,
   same framing as the already-in-scope Team Raid Simulator).
2. Evolution + second-charged-move + Elite TM — see [[fact_evolution_and_second_charge_move_costs]].
3. Mega Evolution / Mega Energy / Mega Level / Super Max (2026 update) — see
   [[fact_mega_level_system_2026_update]]. Confirms the 1.3 boost and "other trainers only"
   standing decisions are UNCHANGED by the newest content.
4. Best Buddy — already fully covered by MECHANICS.md's power-up section and IDEAS.md's Power-Up
   Optimizer item 5 ("Best Buddy +1 level as a free, cost-less candidate"). No new research
   needed; restated only that it becomes higher-leverage at 100-200-roster scale (exactly one
   Pokémon account-wide can ever hold it).
5. Tier/boss-set validity — Elite Raids are a real, currently-missing `RaidTier` value (see
   [[fact_elite_raid_tier_gap]]); Shadow raid mid-fight enrage state is unmodelled and distinct
   from the already-recorded 15%-HP-defense-collapse bug (see
   [[fact_shadow_raid_enrage_state]]); Max Battles/Dynamax/Gigantamax are real but structurally a
   different game and must be excluded, not approximated (see
   [[fact_max_battles_separate_system]]); Primal/Legendary-Mega tiers already correctly covered,
   no gap.
6. Weather — real-world/per-trainer-location-tied, snapshotted at raid entry, no principled
   "expected weather per boss" exists; the existing single global `Scenario.weather` toggle
   applied uniformly across the whole 30-boss sweep is the only honest approach. No new fact
   beyond what [[fact_weather_boost_mechanic]] already established; this pass just confirms the
   remote-raid-uses-gym's-location nuance (community-consensus, Niantic Helpshift page itself
   blocked 403 to direct fetch, as expected per prior sessions).

**Recommendations given** (full detail in the conversation response, not duplicated here):
(a) model now — evolution-aware candidate filtering, second-charged-move as a new budget
candidate type, Elite Raids as a new `RaidTier`. (b) record as caveat, not build — Mega
Energy/cooldown, Shadow enrage state, wipe-with-fresh-6. (c) out of scope — Elite TM/reroll
(different currency), Max Battles (different game).

**Status**: pending — a research/recommendation pass only, nothing implemented, no engine or web
files touched.
