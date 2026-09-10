---
name: reaction-powerup-tm-proposal
description: Reaction to the proposed "incorporate TMs into the Power-Up Optimizer" feature (2026-09-10) — verdict, priority order, and a concrete finding about today's moveset-default gap
metadata:
  type: project
---

Proposal (2026-09-10): fold TM/Elite TM move changes into the Power-Up Optimizer multi-raid mode
as candidates ranked alongside power-ups, gated by a user-typed TM inventory. CSV rows with no
recorded move were to be treated as "needs a TM for both moves."

## Verdict (as real-users, with f2p-constrained on the lottery question)

Not rejected outright, but scoped down hard. Priority order given:
1. Surface the ALREADY-EXISTING "default moveset" flag inline on ranked-candidate/benched-but-
   promising rows (see finding below) — not on anyone's list, but is the actual trust bug today.
2. IDEAS.md #10, second charged move as a budget candidate — no new user input, existing move
   is structurally never destroyed regardless of what slot 2 resolves to.
3. IDEAS.md #9, evolve-then-power-up pricing — see finding below, already the dominant real
   blocker on a real sample roster, ahead of any moveset issue.
4. Elite-TM-only, deterministic ("given my exact count N, rank my top N") — a narrowed,
   safe version of the proposal.
5. Full regular-TM lottery/EV modeling — last. f2p-constrained would drop this to "never build,"
   not just deprioritize: an irreversible, RNG-gated spend the tool can't verify is safe (see
   belief below re: legacy moves) shouldn't be ranked in a list that reads as certain as a
   stardust power-up row. hardcore-spender disagreed — enough TM volume over time that the
   gamble washes out, wanted the EV number built, not refused.

Full reasoning, the CSV-blank-meaning analysis (grounded in `pokeGenieSample.csv`, not
speculation), and all belief flags were returned in-conversation, not duplicated here.

## Finding worth reusing (don't re-derive by re-driving the app)

Imported the repo's own 23-row `packages/web/src/import/test/pokeGenieSample.csv` into multi-raid
mode and ran a real sweep. Two gaps, both reproducible from that exact file:

- **The "default moveset" / "unmatched move name(s)" note (Last-import table only) does not
  propagate to the ranked-candidate table or "Benched but promising."** Concrete instances from
  that sweep: Rayquaza (moveset fully guessed — CSV had both moves blank) was recommended for a
  191,000-stardust power-up at +0.311 team DPS with zero inline flag; Toxtricity (Amped) appeared
  in "Benched but promising" needing 103,000 stardust to earn a spot, also on a fully-guessed
  moveset, also unflagged at that row. A player acting on either row has no on-row signal the
  moveset is a guess. This is true TODAY, independent of whether TM support ever ships — fix
  first regardless.
- **On this same 23-row sample, 6 of the 8 "Never competitive" entries are excluded purely for
  "evolve first"** (Beldum, 2x Houndour, Totodile, Lairon, Sneasel Hisuian), not moveset. Direct
  evidence IDEAS.md #9 (evolve-then-power-up pricing) bites harder on a real roster than the
  moveset gap the TM proposal targets.
- **A blank CSV move column is not the only cause of "default moveset."** One row (Raticate
  Alola, recorded charged move "Return") had real data the app's move-name matcher didn't
  recognize, and got silently defaulted with the identical flag as a truly-blank row. Any
  TM-eligibility rule keyed on "column is blank" will miss this class and misprice it.

See `.claude/agent-memory/pogo-player/archetype-real-users.md` for the archetype evidence
this reaction was built on (unchanged by this entry).
