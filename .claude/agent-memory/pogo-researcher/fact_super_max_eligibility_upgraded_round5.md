---
name: fact-super-max-eligibility-upgraded-round5
description: Super Max eligibility == "+"-move roster now has first-party-corroborated community confirmation, not just the user's own account-state report. Upgrades confidence, doesn't change the engine's existing gate.
metadata:
  type: project
---

Researched 2026-09-10, accuracy pass round 5. Prior status (`fact_super_max_extra_charged_move.md`,
`fact_super_max_plus_move_mechanics_detail.md`, MECHANICS.md "Mega Level" section item 3): the
claim "only megas with a '+' move can reach Super Max" rested on a single first-hand user report
with no published source found across 3 prior research rounds.

**New this round**: pokemongo.com's own post `more-mega-updates-2026` (`[first-party]`, directly
fetched 2026-09-10), quoted verbatim: **"Pokémon that can reach Super Max Level will have an
additional Charged Attack while Mega Evolved"** and **"In the future, as Pokémon gain access to
Super Max Levels, they'll also get an additional Charged Attack while Mega Evolved."** This states
the implication Super-Max-eligible → gets a "+" move, directly and first-party — the opposite
direction from the user's framing ("+" move → Super-Max-eligible) but the same coextensive set in
practice.

Two independent community sites corroborate the sets are identical, not just one-directional:
`doctorpokegogo.com/super-max-level-mega-evolutions-ranked/` and
`theclick.gg/how-to-get-super-max-level-in-pokemon-go/` (dated 2026-08-31) both list the SAME
roster (Mega Mewtwo X/Y, Delphox, Chesnaught, Greninja, Dragonite, Raichu X/Y, Victreebel,
Starmie, Malamar, Skarmory, Falinks — 13 of them; combined with pokemongo.com's own separate
mention of Beedrill and Houndoom reaching Super Max, totals ~15, matching MECHANICS.md's existing
"15 of 15" `db.pokemongohub.net` "+" move count) as both "Super Max eligible" AND "has the extra
Charged Attack" — treating the two as one feature, framed identically.

**Confidence upgrade**: from `[user-report]` alone to `[community-consensus, first-party-corroborated
in one direction]`. Still short of a full first-party statement of the converse ("no + move implies
cannot reach Super Max"), but the practical predicate the engine needs (`canReachSuperMax(species)`
≡ `species has isPlusMove`) is now well-supported by three independent sources agreeing on the same
roster, one of them first-party.

**Engine: no change needed.** `canReachSuperMax` in `megaLevel.ts` already implements exactly this
gate. This is a documentation-confidence upgrade for MECHANICS.md item 3 under "Mega Level," not a
code change — recommend the user (who owns MECHANICS.md edits) bump the tag there.
