---
name: fact-pokegenie-blank-move-field-meaning
description: A blank Charge Move/Charge Move 2 cell in a Poke Genie CSV export means "not captured by this scan," never "this Pokemon has no charged move" — every real Pokemon always has 1 fast + 1-2 charged moves already
metadata:
  type: project
---

Researched 2026-09-10, directly answers a framing question the user flagged: should "no move data"
in an imported roster row be treated as "needs a TM" (implying something is wrong/missing) or as
"unknown" (implying the tool simply doesn't know, and the real Pokémon might already be fine)?

**The definitional argument (solid, doesn't depend on any external source)**: every Pokémon in
Pokémon GO already has exactly one fast move and one or two charged moves at all times — "no
charged move" is not a state a real Pokémon can be in. So a blank CSV cell can only mean the export
failed to capture that field, never that the underlying Pokémon lacks one.

**Code-structural confirmation, this project's own import layer**
(`packages/web/src/import/pokeGenieCsv.ts`, `pokeGenieMatch.ts`, read 2026-09-10): `Quick Move`,
`Charge Move`, and `Charge Move 2` are three independent CSV columns. `pokeGenieMatch.ts`'s
`buildRosterEntry` sets `movesetIsDefaulted = fast.id === null || charged.id === null` — true both
when the cell was genuinely blank AND when it held a name that didn't match the species' own
moveset (e.g. stale engine move data) — **both cases collapse into the same flag today**, and both
fall back to `species.fastMoves[0]`/`species.chargedMoves[0]`. IDEAS.md item 11 already records
that ~60% of a real 164-row export has no recorded charged move this way.

**Plausible (not confirmed) mechanical reason for the high blank rate**: Poke Genie's "Batch Scan"
feature (its own marketing: "select batch scan mode ... navigate to your Pokémon storage")
operates over the Pokémon STORAGE LIST view, which — unlike a single Pokémon's own detail screen —
does not display fast/charged moves at all; capturing moves would require a slower per-Pokémon
individual scan most users skip for their whole box. **This specific causal claim was not found
stated explicitly anywhere** (WebSearch could not confirm it directly) — flagged as
`[speculative/inferred]`, offered only as a plausible explanation for the definitional finding
above, which does not depend on it being true.

**Design implication for the user's stated framing ("no move data at all treated as needing a TM
for both fast and charged")**: this is mechanically the WRONG frame. A blank entry should be
modeled as **moveset-unknown**, not **moveset-needs-changing** — those are different claims with
different correct UI treatment. Recommending "buy a TM for this Pokémon" on the strength of a
blank CSV cell could easily tell a player to spend a real, scarce item (especially an Elite TM) on
a Pokémon whose real in-game moveset might already be exactly what they'd have chosen. The correct
default is closer to "moveset unknown — verify in-game (or rescan) before acting on any
move-change recommendation for this entry," structurally separate from
`unmatchedMoveNames`/`movesetIsDefaulted`'s existing "known-but-stale-in-our-data" case.

Fed into `proposal_move_change_optimizer_candidates`.
