---
name: fact-mega-boost-persists-after-faint
description: Whether the mega/primal party-wide damage boost survives the boosting Pokemon fainting — differs by species, confirmed community-consensus tier
metadata:
  type: project
---

Real-game mechanic, relevant to [[proposal-boost-persists-through-faint]]:

- **Standard Mega Evolution** (e.g. Mega Charizard, Mega Skarmory, Mega Gengar): the
  party-wide same-type damage boost requires the Mega'd Pokemon to be **on the battlefield**
  — it stops the moment that Pokemon faints.
- **Primal Reversion (Primal Groudon, Primal Kyogre) and Mega Rayquaza specifically**: the
  boost only requires the Pokemon to be **present in the raid party**, not alive/on the
  battlefield — the boost keeps applying to teammates even after it has fainted, as long as
  it wasn't swapped out of the party entirely.

Source tier: [community-consensus], not an official Niantic statement. Bulbapedia's
"Mega Evolution (GO)" page (fetched 2026-09-05) states this explicitly but its own citation
traces back to a Reddit crowd-test from March 2023 — i.e. community-tested, not datamined or
Niantic-published. Longstanding and repeated across wiki sources, but treat as unconfirmed
until/unless a primary source turns up. GamePress's "Raid Damage and Fainting" page 404'd on
2026-09-05 (previously a candidate second source — note it may have moved/been retired,
don't rely on that URL without re-checking).

**How to apply:** if this ever gets implemented (see [[proposal-boost-persists-through-faint]]),
flag to engine-developer that the underlying evidence is community-tier and old (2023) — worth
an independent re-check before treating the specific "Primal + Mega Rayquaza only" species list
as final, the same discipline this project already applies to hand-authored stats.
