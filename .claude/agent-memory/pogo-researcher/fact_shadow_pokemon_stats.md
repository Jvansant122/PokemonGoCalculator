---
name: fact-shadow-pokemon-stats
description: Shadow Pokemon attack/defense stat multipliers and the shadow-cannot-mega-evolve constraint
metadata:
  type: project
---

Real-game facts relevant to [[proposal-shadow-stat-multipliers]] and to the project's known gap
("real Shadow-form stat multipliers are only approximated, not modeled" per CLAUDE.md context):

- Shadow Pokemon: **Attack x1.2**, **Defense x0.83** (some sources render this as 5/6 ≈ 0.8333;
  minor variance across sources on the exact decimal — worth pinning down precisely before
  hand-authoring). [community-consensus], longstanding (since Shadow Pokemon's Feb 2021 rework),
  repeated consistently across Fandom wiki, GamePress-adjacent guides, and datamine-derived
  community sources as of searches run 2026-09-05. No official Niantic-published number found.
- **Shadow Pokemon cannot Mega Evolve** — must be Purified first to unlock Mega Evolution.
  [community-consensus], confirmed across multiple current (2026) guide sites on 2026-09-05.
  This means "Shadow" and "Mega/Primal boost" are mutually exclusive states on the same
  candidate in real gameplay — don't model a "Shadow Mega X" as if it's real content.

**How to apply:** if Shadow multipliers get added to the engine, they're an independent
attack/defense modifier (like the mega boost multiplier but never combined with it on the same
candidate) — relevant mainly to raid-boss accuracy (several real raid bosses are Shadow) and to
a potential "glass cannon" candidate comparison (Shadow's +DPS vs -survivability trade only
matters when converted into team DPS, i.e. this project's actual thesis).
