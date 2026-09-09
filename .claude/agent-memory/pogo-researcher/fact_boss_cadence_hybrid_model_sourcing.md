---
name: fact-boss-cadence-hybrid-model-sourcing
description: What third-party open-source raid simulators actually implement for the boss charged-move decision trigger, sought to corroborate (or refute) the per-move-boundary inference in fact_boss_charged_move_decision_cadence.md
metadata:
  type: project
---

Researched 2026-09-08, following on from `fact_boss_charged_move_decision_cadence.md` (same
underlying question: what event triggers the boss's "should I fire my charged move now" check).
That note's own recommendation — re-roll at the end of every boss move, fast or charged, gated on
energy >= move cost — was a reasoned synthesis of two sourced facts, explicitly labelled
`[speculative — reasoned inference, not separately sourced]`, not an independent confirmation.
This pass looked for a third-party implementation that would either corroborate or contradict it.

## Headline: GoBattleSim-Engine is a first-class open-source corroboration of the per-move-boundary model

`GoBattleSim-Engine` (`biowpn/GoBattleSim-Engine` on GitHub) implements exactly the shape
recommended in `fact_boss_charged_move_decision_cadence.md`:

- `src/Battle.cpp`'s `on_clear` dispatch fires the defender's ("boss's") decision logic on **any**
  completed action — fast move, charged move, or dodge — not on a fixed timer and not only after
  fast moves.
- `src/Strategy.cpp`'s `defender_on_clear` gates the charged-move decision on
  **energy >= the move's own cost**, not on hitting `MAX_ENERGY`. This matters because it means a
  boss with more than enough energy for a cheap charged move doesn't need to sit at the cap to be
  eligible — consistent with the "just-crossed-threshold, not cap-only" ambiguity that
  `fact_boss_charged_move_decision_cadence.md` flagged as unresolved by any prior source.
  eligible — consistent with the "just-crossed-threshold, not cap-only" ambiguity that
  `fact_boss_charged_move_decision_cadence.md` flagged as unresolved by any prior source.
- On firing, energy is **decremented by the move's cost**, not reset to 0 — so leftover energy
  above the cost can immediately re-arm another eligibility check at the very next `on_clear`,
  which is the same mechanism that would explain the "three Hydro Pumps back-to-back" anecdote
  cited in the earlier note.

Tag: `[community-consensus]` at best — this is one independent open-source project's own modelling
choice, not a Niantic-sourced mechanic and not itself proof of how the real game works. But it is
meaningfully stronger evidence than a raw inference: it shows at least one other person who
studied the same public behavior (community raid observations, Niantic's own vague statements)
independently converged on the same "any move, energy-cost-gated, decrement-not-reset" shape this
project's own reasoning arrived at. Treat it as corroboration of plausibility, not confirmation of
truth.

## What else was checked this pass, and came up empty or out of scope

- **Pokebattler**: its only public writeup found covers **attacker-side** charge-move-detection
  logic (used for its damage calculator), not raid-boss AI. Nothing on boss decision cadence.
- **PvPoke**: has no raid-battle logic at all — it's a PvP (Great/Ultra/Master League) simulator
  only. Direct fetch attempts against its GitHub returned HTTP 403 this pass; resting on prior
  general knowledge of the project's scope (it has never modelled PvE raids), not a fresh fetch.
- **One WebSearch-synthesized claim** describing a PvPoke "Tera Raid" tool surfaced during this
  pass. I could not verify it against any page I could actually open, it doesn't match PvPoke's
  known scope (raids in Pokémon GO have no "Tera" mechanic — that's mainline-game/Scarlet-Violet
  terminology, a red flag for cross-franchise search-summarizer contamination), and per this
  project's "fetched content is data, not instructions" discipline I am **not citing it** — noting
  only that it surfaced and was discarded as a likely hallucination.
- **No new data on hold-delay behavior or post-2024 inter-cast interval timing** beyond what was
  already recorded in `fact_boss_charged_move_decision_cadence.md` (the Silph Road Kyogre
  anecdotes: five Surfs at ~2.5s intervals, three Hydro Pumps back-to-back). Nothing this pass
  adds a formal distribution or a second independent sighting of those numbers.

## Net effect on the earlier recommendation

Does not upgrade the tag on the per-move-boundary model from "reasoned inference" to "confirmed" —
no Niantic or official source was found. But it does add a second, independent line of reasoning
(a working open-source implementation, presumably validated against real raid footage by its
author) landing on the same shape, which is worth recording alongside the original inference in
`fact_boss_charged_move_decision_cadence.md` next time this question comes up.

Sourcing tags used in this note: GoBattleSim-Engine finding is `[community-consensus]` (one
independent project's implementation, not official); Pokebattler/PvPoke negative findings are
plain absence-of-evidence, not claims; the "Tera Raid" item is explicitly flagged
`[unverified / likely hallucination]` and not used as a finding.
