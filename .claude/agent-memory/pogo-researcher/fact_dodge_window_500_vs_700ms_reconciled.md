---
name: fact-dodge-window-500-vs-700ms-reconciled
description: Resolves the apparent 500ms-vs-700ms dodge-window conflict — they are two different quantities, not a discrepancy; no engine change implied.
metadata:
  type: project
---

Researched 2026-09-10 as part of an accuracy pass (round 5) that re-opened five previously-flagged
MECHANICS.md unknowns. This one closes cleanly.

**Two different quantities, not a discrepancy:**

- **`dodgeDurationMs: 500`** (`BATTLE_SETTINGS`, `[first-party]`, already recorded) — the
  **invulnerability window once a dodge is executed**. This is what `DODGE_COST_SECONDS` in the
  engine models: the time cost of the dodge *action itself*.
- **~700ms** ([community-consensus], pokemongohub.net "Close Calls: Dodging Mechanics" article,
  dated **2019-04-21** — old, pre-Sept-2024-rework) — the **reaction window**: how long a player
  has *between the yellow-flash cue appearing and the attack landing* to input the dodge swipe.
  Directly fetched and quoted verbatim: "A yellow flash occurring means that you have 700 ms (.7s)
  to dodge," and separately, "it is very easy to overlap the dodging cool down and the 700 ms you
  have once the yellow flash occurs" — the site itself treats these as two things that can overlap
  or fail to, which only makes sense if they're distinct.
- fevgames.net's "A deeper look into dodging" (undated in the fetch, but structurally pre-rework —
  discusses per-move `damageWindowStartMs/EndMs` as still governing damage) independently frames
  it the same way: a fixed 500ms **dodge window** (their term for the invulnerability period) that
  must **overlap** the move's own (now-superseded, see [[fact_damage_window_post2024_semantics_resolved]])
  **damage window** to succeed.

**Caveat on the 700ms figure**: it is 2019-dated and tied conceptually to the same per-move damage
window that MECHANICS.md's own "damage window post-2024 semantics" entry already established
stopped governing damage after the Sept 2024 rework. It may no longer be current, and no source
re-confirms it post-rework. This does not affect the engine, which never modelled a human reaction
window in the first place.

**Engine implication: none.** `DODGE_COST_SECONDS = 0.5` correctly models the sourced,
first-party `dodgeDurationMs`. The 700ms figure is a human-reflex quantity the engine's
perfect-play dodge model has no use for (it doesn't simulate whether a player's swipe lands in
time, only whether a dodge attempt is made and its 0.25x/0.5s mechanical effect). Recommend the
user record this in MECHANICS.md as a RESOLVED reconciliation so it isn't re-flagged as an
open discrepancy.
