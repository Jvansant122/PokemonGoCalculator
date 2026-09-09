---
name: fact-no-normal-raid-hp-threshold-ai
description: Confirms standard (non-Shadow, non-Super-Mega) raid bosses have no HP-threshold-triggered behavior change; also reconciles a discrepancy in the shadow-raid enrage HP threshold and flags the new Feb 2026 Super Mega Raid shield/enrage mechanic as multi-trainer and out of this engine's model
metadata:
  type: project
---

Researched 2026-09-09, answering "does the boss dodge/flee/change behavior by remaining HP, beyond
the already-recorded shadow-raid enrage and 15%-HP bug" (both already in
`fact_shadow_raid_enrage_state.md` and MECHANICS.md's "Known bugs" section).

## Standard raid bosses: no HP-threshold AI change — negative finding, `[community-consensus]`

Multiple `WebSearch` aggregates converge on the same framing: HP-threshold behavior changes are
explicitly scoped to **Shadow Raids** (3-star and Legendary tiers) and, since 2026-02, **Super Mega
Raids** — not standard Tier 1/3/5, Mega, or Primal raids. No source found describes a normal boss
dodging, fleeing, or gaining any stat change tied to remaining HP. Treat as the closest thing to a
confirmed negative available — absence of any contrary report across several independent
aggregations, not a single affirmative official statement that "no such mechanic exists."

## Shadow-raid enrage threshold: a numeric discrepancy worth flagging, not resolving

`fact_shadow_raid_enrage_state.md` (2026-09-08) records the threshold as **60% remaining HP**. This
pass's `WebSearch` aggregate independently describes it as triggering **"once the Shadow Raid Boss
loses approximately 1/3 of its HP"** — i.e., ~67% *remaining*, not 60%. The attack/defense
multipliers match across both passes (~1.81x attack, ~3x / "+200%" defense), so this is very
plausibly the same underlying mechanic described imprecisely by two different secondary sources,
not two different mechanics. **Do not silently pick one number over the other** — both are
`[community-consensus]`, neither traces to an official source, and 60% vs. 67% is close enough to
be the same rough player observation restated two ways. Recorded here so a future pass sees both
numbers and knows they conflict, rather than re-deriving the same ambiguity from scratch.

## Super Mega Raid enrage/shield mechanic — see the dedicated, better-sourced note instead

A same-day, earlier overnight-pass note, `fact_super_mega_raid_shield_enrage_mechanic.md`, already
covers this in far more depth than this pass found independently — including an **official,
first-party** pokemongo.com source (this pass only found community write-ups for it). That note
also already flags the Teambuilding-Analyzer adjacency. Not duplicating it here; see that file for
the shield count, the Primal/Ditto exclusion, and the "MAJOR unmodeled gap" framing. This pass's
own independent findings on it (getgodex.com's "~2x attack/4x defense" framing, and the shadow-
enrage-style numeric ambiguity) are consistent with, not contradictory to, that note's "exact
multiplier is contested across sources" conclusion.
