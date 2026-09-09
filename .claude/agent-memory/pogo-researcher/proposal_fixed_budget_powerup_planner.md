---
name: proposal-fixed-budget-powerup-planner
description: Researched 2026-09-08 for a fixed-budget ("100k stardust / N candy / 25 Rare Candy") planner extension to the Power-Up Optimizer
metadata:
  type: project
---

Proposed 2026-09-08, in response to a direct request to research the real mechanics behind a
fixed-budget planner extension to the existing (shipped) Power-Up Optimizer tab
(`packages/engine/src/powerUp.ts`, `optimizePowerUps`). Status: **pending** — research handed back
as a conversation response only, not written into `IDEAS.md`/`MECHANICS.md` (Write-tool role
boundary, same as [[proposal_powerup_optimizer_flesh_out]]).

**What v1 should model** (all real, all now sourced — see [[fact_rare_candy_xl_candy_conversions]]
and [[fact_trainer_level_powerup_cap]]):
- Rare Candy and Rare Candy XL as fungible currencies that convert 1:1 into a CHOSEN slot's
  regular/XL Candy pool respectively, on top of the existing `candyOnHand`/`xlCandyOnHand` per
  slot in `PowerUpSlotInput`. This turns the "which power-ups can I afford" question into a
  knapsack/allocation problem across slots sharing one Rare Candy pool, not per-slot-independent
  affordability as today.
  - The 100:1 regular-Candy-to-XL-Candy Convert button is a legitimate additional lever (spend
    surplus regular Candy on one species to unlock an XL-gated power-up on another) but is a
    much worse rate than Rare Candy XL used directly — worth surfacing as an option, not
    defaulting to it.
- **The Trainer Level power-up cap, `min(trainerLevel + 10, 50)`.** This is the one that actually
  changes correctness, not just scope: without it, a fixed-budget planner can recommend a target
  level the account cannot legally reach. This REQUIRES a new user-facing input (the trainer's
  own level) that does not exist anywhere in this engine today.

**What to record in MECHANICS.md as "not modelled" rather than build in v1:**
- Per-species power-up cost overrides (Eternatus's 30x Candy) — already flagged as a known gap in
  the existing module's doc comment; a fixed-budget planner inherits the same gap, doesn't need
  its own note beyond pointing at the existing one.
- Event stardust discounts (Niantic periodically runs "half stardust to power up" events) — real,
  but time-limited and not something a general-purpose planner should assume active by default.
  If ever added, it would need to be an explicit Scenario toggle, not a silent default.
  [community-consensus, well-documented pattern across many past events, not independently
  re-verified this pass since it's out of v1 scope]
- Best Buddy's CP boost — real, but it's a flat post-leveling combat-stat bonus (already the
  `bestBuddy` field's job in `damage.ts`, currently a dead input per
  `fact_weather_bestbuddy_dead_inputs`), not a change to power-up cost or the trainer-level cap
  itself. No interaction with a budget planner beyond what already exists.
- The per-species/account candy storage cap — could not find a reliably-sourced current number
  this session (old "999" folklore, no confirming source found 2026-09-08); irrelevant to a
  planner that's already budget-constrained below whatever the real cap is in all realistic
  inputs, so not worth chasing further unless it becomes load-bearing.

**Standing-decision flags (both explicit, per role instructions):**
- A Trainer Level input is a genuinely NEW user-facing setting. Per CLAUDE.md's "Every
  user-facing assumption must round-trip through Scenario," it would need to be added to the
  Power-Up tab's `pu` Scenario codec via the `add-scenario-assumption` skill — flagging this
  explicitly rather than leaving it implicit, since the whole point of the trainer-level cap is
  that it changes what advice is even valid, and a setting that resets to a default on a shared
  link would silently reintroduce "impossible advice" bugs on top of the ones this research is
  trying to close.
- A shared, budget-constrained ALLOCATION across multiple slots (spend one pool of stardust/
  candy/Rare-Candy across up to 6 Pokémon to maximize total team-DPS gained) is a genuine
  extension of the survivability-as-team-DPS thesis — it's a knapsack over the SAME team-DPS
  metric `optimizePowerUps` already computes per candidate, not a new metric, and it stays
  single-trainer/single-roster (same framing as the already-in-scope Team Raid Simulator and
  Power-Up Optimizer). This is NOT the ruled-out "Teambuilding Analyzer" (that's multi-trainer
  mega staggering across a raid lobby) — worth stating plainly since it's the kind of shape a
  reader might pattern-match onto that exclusion at a glance.
