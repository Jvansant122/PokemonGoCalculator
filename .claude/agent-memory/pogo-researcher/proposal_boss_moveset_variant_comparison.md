---
name: proposal-boss-moveset-variant-comparison
description: proposed 2026-09-05 (open-ended pass) — compare candidates against each of the boss's known charged moves side by side, since a real raid boss's charged move is fixed per-instance and currently the tool only checks one at a time
metadata:
  type: project
---

Status: proposed 2026-09-05. **BUILT** (confirmed 2026-09-05 in a later session) — `comparison.ts`'s
`compareAcrossBossChargedMoves`, wired into `App.tsx`/`BossMovesetSweep.tsx` as "Does the winner
depend on the boss's charged-move roll?", rendered whenever the boss has 2+ known charged moves.

**What it would show:** today `bossChargedMoveId` picks exactly one of the boss's
charged moves per comparison (`comparison.ts`'s `resolveMove`, defaulting to moves[0]).
In the real game, an individual raid boss instance has ONE fixed charged move for that
raid's lifetime, but different instances of "the same" boss (different eggs/gyms) can
roll different charged moves from its known movepool. A player deciding which mega to
bring can't know in advance which moveset variant they'll face. This proposal: run the
comparison once per each of the boss's charged moves (already in the synced data, no new
sourcing needed) and show, side by side, whether the ranking/flip-point between two
candidates depends on which moveset the boss happens to have.

**Why it sharpens the thesis:** it's a second, independent axis of "the ranking flip
point is the headline" — not a numeric assumption to slide (dodge skill, party size,
cadence), but a discrete "which real-world variant of this fight am I actually in"
question. If candidate A beats candidate B against moveset 1 but loses against moveset
2, that's exactly the kind of conditional conclusion this tool exists to surface, and a
player literally cannot know which variant they'll face before entering the raid.

**Scope/flags:**
- Deliberately NOT proposed as another `sensitivity.ts` row — that panel's
  `SensitivityCheck` shape assumes a continuous numeric scan (`rangeMin`/`rangeMax`,
  flip-bar visualization); "which discrete charged move" has no such axis, so this needs
  its own presentation (e.g., one result-card pair per moveset variant, or a compact
  "flips by moveset: yes/no" indicator), not a shoehorned row.
  Any UI toggle here also needs the round-trip check.
- No probability-weighting needed/proposed (no reliable public per-instance frequency
  data was found or claimed) — just an exhaustive sweep over the boss's known charged
  moves, all already in `data/normalized/species.json`.
- Does not touch any standing decision.
