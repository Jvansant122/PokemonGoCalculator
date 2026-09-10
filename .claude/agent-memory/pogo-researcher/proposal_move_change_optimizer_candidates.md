---
name: proposal-move-change-optimizer-candidates
description: Design proposals for modeling TM/Elite-TM/second-charged-move as Power-Up Optimizer candidates — EV-banded regular TMs, deterministic Elite TM/second-move candidates, moveset-unknown as a third state, Frustration-event-gating caveat. Routed back 2026-09-10, outcome pending.
metadata:
  type: project
---

Proposed 2026-09-10 in response to a direct design-research request (not self-initiated ideation).
Outcome: pending — handed back for engine-developer/web-developer scoping, not yet built.

**1. A regular (non-Elite) TM candidate cannot honestly be ONE number — model it as a
[worst, expected, best] band**, computed by simulating team-DPS for every move actually reachable
by that species' TM pool (pool minus currently-held move), not just the single best outcome.
Pricing "TM to the best move" as deterministic — the exact trap the user's own prompt named —
would silently misrepresent a gamble as a guaranteed purchase. This is the same discipline the
whole tool already lives by (a ranking flip point, not a single winner) applied to a genuinely
random action instead of a genuinely deterministic comparison — sharpens rather than dilutes the
core thesis, doesn't touch it. Needs `fact_tm_move_change_mechanics`'s uniform-minus-current
assumption stated as an assumption in the UI, not silently baked in as fact (real uniformity is
contested, not confirmed — see that memory).

**2. An Elite TM candidate (and a second-charged-move-unlock candidate) CAN be priced exactly
like a power-up** — both are fully deterministic once the target move/unlock is chosen. These are
the cheap, low-risk parts of this whole feature to build first.

**3. "Moveset unknown" needs to be its own state, distinct from "moveset known and suboptimal."**
See `fact_pokegenie_blank_move_field_meaning` — a blank imported CSV field is not evidence a
Pokémon's real moveset is wrong, only that this tool doesn't know it. Recommending a TM purchase
against an unknown moveset risks spending a real, sometimes-scarce item on a Pokémon that may
already be fine. Proposed surfacing: a distinct "verify in-game first" caveat, never folded into
the same confident recommendation list as a genuinely known-suboptimal moveset.

**4. A Shadow Pokémon's Frustration-removal candidate needs an availability caveat, not a live
Scenario dependency.** `fact_frustration_removal_event_gating` — Frustration can only actually be
rerolled during irregular ~quarterly "Taken Over" events. Recommend NOT adding a live "is an event
active right now" check (that would be a dynamic, non-reproducible Scenario input — the same link
would give a different answer depending on when it's opened, which this project has never done
anywhere else). Instead: always surface the candidate with a static "only actionable during a
Taken Over event" label, same spirit as how the tool already states assumptions rather than
silently gating on live state.

**CONFLICTS WITH STANDING DECISIONS, flagged explicitly per instruction**: a finite TM inventory
(Fast/Charged/Elite Fast/Elite Charged counts the user types in) is a NEW user-facing input with
no existing field to reuse — it must round-trip through `Scenario` like every other
Power-Up-Optimizer setting (the `add-scenario-assumption` skill applies). It is directly analogous
in shape to the existing `rareCandyOnHand`/`rareCandyXlOnHand` account-wide fungible pools, so this
is a precedented extension, not a novel one. No other standing decision is implicated — this
doesn't touch combat-phase, the 1.3 mega boost, or the Teambuilding-Analyzer exclusion.

See MEMORY.md's fact_ entries dated 2026-09-10 for the full sourcing behind each point.
