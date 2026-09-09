---
name: fact-party-power-raid-multiplier
description: Party Power (Party Play feature, live since Oct 2023, still active 2026) doubles a raid attacker's next charged-move damage; charges via fast moves, faster with more party members (2-4); entirely unmodelled and structurally multi-trainer
metadata:
  type: project
---

[community-consensus, corroborated by Niantic's own promotional page], researched
2026-09-09. **Party Power** is part of **Party Play** (launched 2023-10-17,
confirmed still active during GO Fest 2026: Global, July 2026 — Pokémon Blog guide
dated 2026-07-12).

**Mechanic:** a party of 2-4 trainers who are physically near each other forms a
Party. During a raid fought as that party, each member fills a **Party Power**
gauge by using Fast Attacks; more party members fills it faster. Once full,
activating it **doubles the damage of that trainer's next Charged Attack** (`2x`
multiplier, confirmed by both the official `pokemongo.com/partyplay` page — "Party
Power doubles the damage of your next Charged Attack and charges with every Fast
Attack" — and Gamerant's 2024-07-11 explainer). Can recharge and be used multiple
times within one raid (charges continuously off fast moves; no source states a
per-raid cap). One secondary, unconfirmed note from Gamerant: "the Party Power may
charge faster or do more damage if an event is happening" — `[speculative]`, no
specific event or magnitude cited.

**Scope note, worth flagging explicitly:** like the mega/primal boost and the
friendship raid bonus, this is an **other-trainers-present** mechanic — it requires
a physical multi-trainer party, not a single trainer's own roster. A single-trainer
Team Raid Simulator run has no "party" to charge Party Power with (analogous to why
the mega boost's team-wide multiplier already correctly excludes the trainer's own
bench). Modelling it meaningfully would mean either (a) a Comparator-level "assume
you're in an N-person party" damage-multiplier-on-your-own-DPS toggle — cheap,
round-trips through `Scenario` as one new field, doesn't imply multi-trainer
staggering — or (b) something that tracks *other* trainers' Party Power charge-up
independently, which starts to smell like the ruled-out Teambuilding Analyzer.
Option (a) is the only version worth proposing; see the PROPOSALS section of the
2026-09-09 research response for the concrete framing.

**Engine: entirely unmodelled.** No field, no comment, no dead code — this is a
clean gap, not a mislabeling like the friendship bonus. At 2x damage on a single
charged hit, this is a large, bursty effect on team DPS (bigger in magnitude than
weather's 1.2x or the mega boost's 1.3x, though single-hit rather than sustained) —
worth flagging as materially significant if this project ever extends toward
multi-trainer scenarios, but explicitly NOT proposed as in-scope today beyond the
narrow single-trainer-party-multiplier framing above.

**Round-2 pass, 2026-09-09: charge rate remains unquantified — closed out, do not
re-search without a new lead.** Tried again specifically for a fast-move count or
seconds-to-fill number, and for party-size (2/3/4) scaling, a per-raid cap, and
whether an unfilled gauge persists between raids. Fetched LeekDuck's "Party Play
New Feature" page and Vortex Gaming's "Party Power, The Hidden Truth" explainer
directly — both independently confirm only the qualitative claim ("charges with
every Fast Attack," "more party members means it charges faster") with **no
numbers** for any of the four sub-questions. Vortex Gaming even points readers
to "Poke Battler" and "Dialga Dex" for exact figures rather than stating any
itself, implying the number may live in a raw datamine/community spreadsheet
neither surfaced by search. **Do not estimate and present a number as sourced —
report this as unquantified if asked again**, unless a new source specifically
surfaces the raw value.
