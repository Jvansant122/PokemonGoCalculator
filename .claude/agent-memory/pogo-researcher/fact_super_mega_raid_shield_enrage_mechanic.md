---
name: fact-super-mega-raid-shield-enrage-mechanic
description: Super Mega Raids (already a RaidTier in this engine, 25000 HP / 0.79 mult) have an enrage+shield phase mid-fight where the boss becomes near-immune to ordinary attacks and only a Mega-Evolved Pokemon's charged attack (one break per trainer) removes a shield — entirely unmodeled by this engine's flat per-tier multiplier
metadata:
  type: project
---

Researched 2026-09-09, overnight content-sweep pass. **This is the single biggest data/model gap
found this session — flag loudly to the overseer.**

## The mechanic, as confirmed

Partway through every Super Mega Raid, the boss "becomes enraged and puts up shields, reducing
the amount of damage it takes from normal attacks" [**official, first-party**: pokemongo.com,
"A new update to Mega Evolution in Pokémon GO arrives during Pokémon GO Tour: Kalos!"
(https://pokemongo.com/news/mega-evolution-2026-update), re-fetched directly 2026-09-09 with a
question targeted specifically at shields — the earlier 2026-09-08 fetch of this SAME URL for
Mega Level details (see [[fact-mega-level-system-2026-update]]) apparently didn't surface this in
its AI summary; the mechanic was on the page the whole time, just missed by an untargeted fetch].

- **Only a Mega-Evolved Pokémon's charged attack breaks a shield.** "Each Trainer can destroy one
  Shield by using a Charged Attack with their Mega-Evolved Pokémon" — capped at exactly one shield
  break per trainer per raid, regardless of how many charged attacks they land.
- **Primal Kyogre, Primal Groudon, and Ditto-transformed-into-Mega are explicitly EXCLUDED** from
  being able to break shields — verbatim from the same official page. Only "pure" Mega Evolutions
  count.
- **Shield count varies by boss**: most Super Mega Raid bosses use 7-8 shields; Mega Mewtwo and
  Mega Dragonite are named exceptions at 10 shields [community-consensus, corroborated across 3
  independent community sources: poketory.com, getgodex.com, hundo-hunter.com, all fetched
  2026-09-09, broadly consistent with each other on the 7-10 range and the Mewtwo/Dragonite
  exception].
- **Minimum lobby size is effectively the shield count** — sources state "8 trainers with active
  Megas is the practical minimum" for a typical 8-shield boss [community-consensus,
  hundo-hunter.com], consistent with the official Super Mega Raid minimum of "at least seven other
  Trainers" (8 total) [leekduck.com quoting the same official copy].
- **Exact attack/defense multiplier or damage-reduction while shielded is CONTESTED across
  sources, not settled**: getgodex.com states boss gains "2x Attack and 4x Defense" while
  shielded; hundo-hunter.com states the boss "takes no damage from regular attacks" at all while
  shields are up. These are NOT the same claim (a large-but-finite multiplier vs. literal
  immunity) and no official source gives an exact number. **Tag the qualitative mechanic
  (shields drastically reduce/negate ordinary damage, only mega charged attacks break them) as
  [community-consensus, official-corroborated]; tag any specific multiplier number as
  [speculative/contested]** until a primary source states one.
- **Trigger timing (HP% or timer) for when the enrage/shield phase starts is NOT documented
  anywhere found this session** — every source (official and community) says only "partway
  through" / "during the battle." Genuinely unknown, not just under-cited.
- **Scope: Super Mega Raids only.** No source this session mentions this mechanic for Legendary
  Mega Raids (six-star), ordinary Mega Raids, Primal Raids, or standard Legendary raids — matches
  this engine's existing `RaidTier` union, where "Super Mega Raids" is already its own distinct
  row (25000 HP, 0.79 mult) separate from "Legendary Mega Raids" (22500 HP, 0.79 mult).

## Why this matters for THIS engine specifically

`RAID_TIER_TABLE["Super Mega Raids"]` (`packages/engine/src/raidBoss.ts`) applies one flat HP pool
and one flat attack/defense multiplier for the ENTIRE fight — there is no concept anywhere in this
engine (Comparator, Team Raid Simulator, Species Report, Power-Up Optimizer) of a mid-fight state
change where the boss becomes briefly near-immune to non-mega attacks. Every simulated Super Mega
Raid today is strictly easier/faster than the real one, because the model never pays the "shield
tax" a real 8-trainer lobby pays. This isn't a small numeric miss like a stale CPM digit — it's an
entire missing PHASE of the fight, specific to exactly the tier this engine already claims to
model.

## Deliberately not proposing a build here — flags a standing-decision collision

Modeling this properly requires knowing how many OTHER trainers are in the lobby and whether their
Pokémon are mega-evolved (shield-breaking is inherently a multi-trainer coordination mechanic —
"how many trainers, how many of them bring a mega, in what order do they break shields" is
exactly the shape of a **Teambuilding Analyzer**, explicitly ruled out of scope in CLAUDE.md's
standing decisions). A softer alternative — modeling ONLY the solo trainer's own possible
contribution (can I, this one trainer, break my one shield with my mega's charged attack, given
my own combat log) — is closer to in-scope and worth a real proposal, but even that needs a
product-level decision about what the OTHER 7+ shields (which the solo trainer's own team-DPS
number cannot single-handedly clear) should assume, since the boss's real effective attack/defense
for the "un-shielded" portion of the fight depends on assumptions about the whole lobby's clear
speed. Flagging this explicitly rather than quietly building around it, per the researcher role's
own boundary rule.

## Round 2 update (2026-09-09, same-session follow-up) — the five open questions

The overseer asked five specific follow-ups. Closing what's closeable, stating plainly what
isn't.

**Q1 — trigger (HP%, timer, attack count): still genuinely undocumented.** Re-fetched the
official page with a question targeted exactly at this; the verbatim official text is only
"During Super Mega Raids, you may find that the opposing Mega-Evolved Pokémon becomes enraged and
puts up shields" — no number. Every community source checked this round (destructoid.com,
poketory.com, getgodex.com, hundo-hunter.com, pokemongohub.net's Dragonite guide, Bulbapedia's
Raid Battle (GO) page) uses only vague phrasing ("at a certain point," "partway through,"
"during the battle"). **[confirmed absent]** — not under-cited, actually not published anywhere
found. Close this one out as unknown; don't guess an HP% to hardcode.

**Q2 — what a shield does to damage: two claims, now better separated by evidence quality.**
- "2x Attack / 4x Defense" — stated as flat fact by poketory.com (2026-07-20) and echoed by a
  WebSearch AI summary that also cites getgodex. But getgodex.com's own page (fetched directly,
  not via search-summary) hedges this itself: "active shields as roughly doubling the boss's
  Attack and quadrupling its Defense" is explicitly flagged by the article's own text as a
  **community-sourced estimate**, with the author adding "The developer has not published a hard
  trainer count or the exact shield stat values. The figures below come from community coverage
  and guide sites, so treat them as well-supported estimates." That self-disclosure matters: it
  means poketory and getgodex are likely both drawing on the same upstream guide-site consensus
  number rather than two independently-derived figures — this is NOT two-source corroboration in
  the way it first appears.
- "Takes no damage from regular attacks at all" — hundo-hunter.com, stated flatly, no hedge, no
  citation of its own source either.
- Official page: still only "reducing the amount of damage it takes from normal attacks" — no
  multiplier, no "immune" language. Bulbapedia's Raid Battle (GO) page (fetched directly 2026-09-09)
  uses the identical unquantified phrasing, which is itself informative: Bulbapedia is usually
  where a hard number like this would eventually get recorded if Niantic or a datamine had
  published one, and it hasn't.
- **Verdict: no number should be trusted as sourced.** Tag "2x Attack / 4x Defense" as
  [speculative/contested] — plausible, repeated by two sites, but self-disclosed by one of the two
  as an estimate and not independently corroborated. Tag "takes no damage" as
  [speculative/single-source, no hedge disclosed]. The only fully [confirmed] claim remains the
  qualitative one: damage taken is drastically reduced while shielded, by an unpublished amount.

**Q3 — shield count: now a real per-boss table, still community-sourced.** poketory.com
(2026-07-20) publishes explicit counts: Mega Mewtwo & Mega Dragonite = 10; Mega Victreebel, Mega
Malamar, Mega Falinks = 8; Mega Raichu (both forms, unspecified which), Mega Skarmory = 7.
pokemongohub.net's dedicated Mega Dragonite guide independently confirms "Mega Dragonite starts
with 10 shields" and "a minimum of 10 Trainers." **[community-consensus]**, no official source
gives a table. **Scaling with lobby size: NO — fixed per boss, not adaptive.** hundo-hunter.com
states this explicitly: "One shield-break per trainer per raid. If a boss spawns 8 shields, you
need 8 trainers with active Megas — full stop. A 6-trainer lobby with massive damage output still
loses because two shields stay up forever." So it is not "one shield per trainer present" — it's
a fixed boss-defined count, and an undersized or under-mega'd lobby simply cannot clear it.
**Recurrence: one shield phase per raid, not a repeating cycle** — every source describes a
single enrage window with N shields to clear, after which "the boss becomes vulnerable again and
can take normal damage" for the remainder of the fight (Bulbapedia's phrasing); no source
describes a second re-shield later in the same fight.

**Q4 — break rule, all four clauses now confirmed, plus two new details.**
1. One break per trainer, confirmed both officially and by every community source: "Each Trainer
   can destroy one Shield by using a Charged Attack with their Mega-Evolved Pokémon" — capped
   regardless of how many charged attacks land.
2. Mega-Evolved Pokémon's charged attack only — confirmed.
3. Primal Kyogre, Primal Groudon, Ditto-as-Mega excluded — confirmed verbatim, official text:
   "Primal Kyogre, Primal Groudon, and Ditto that have transformed into a Mega-Evolved Pokémon are
   not able to break shields in Super Mega Raids."
4. **No type restriction found anywhere** — no source, official or community, restricts which
   Mega's type can break a shield; any Mega-Evolved Pokémon qualifies.
5. **No minimum-damage threshold — the game auto-buffs the breaking attack.** Official wording:
   "Your Mega-Evolved Pokémon's next attack will be powered up significantly, allowing you to
   break one of the opposing Pokémon's shields easily." This reads as the game guaranteeing the
   break (buffing the attack itself) rather than the shield having an HP/damage gate the player's
   own numbers must clear — i.e. any charged attack, weak or strong, breaks a shield once
   triggered. **[confirmed, official wording]**.
6. **New: auto-switch mechanic.** Bulbapedia adds a detail not in the original pass: "Once the
   opposing Pokémon becomes enraged and activates its shields, a Mega-Evolved Pokémon from the
   player's battle party will be automatically sent into battle if one is not already out." So a
   trainer doesn't need to have already been fighting with their Mega active when the shield phase
   starts — the game force-switches them in. **[community-consensus, Bulbapedia]**.
7. **No mega present → raid is lost, not a timer-expiry escape.** hundo-hunter.com again: a
   lobby short on Megas "loses because two shields stay up forever" — no source anywhere describes
   a shield-specific expiry timer distinct from the raid's ordinary overall clock. The raid simply
   runs out its normal 300-second timer (Bulbapedia's Difficulty table) and fails like any other
   raid where the boss survives — there's no special shield-only failure state to model beyond
   that.

**Q5 — soloability: structurally a large-group activity, not modelable at single-trainer scope.**
Multiple independent sources agree Super Mega Raids cannot be soloed or duoed:
destructoid.com: "Unlike normal Mega Raids, you can't solo Super Mega Raids... The minimum
eight-player requirement makes duoing also impossible." pokemongohub.net (Dragonite guide):
"Super Mega Dragonite Raids require a minimum of 10 Trainers to defeat them, and each trainer
will need to have a Mega Pokémon in their team." The official page itself frames the whole
mechanic as inherently multi-trainer ("Each Trainer can destroy one Shield..."). **Evidence points
firmly toward: this tier is not soloable at any skill/investment level** — it's gated by a
mechanic (one shield break per trainer, N shields fixed by boss) that no amount of single-trainer
optimization can route around, unlike every other raid tier this tool models where a strong-enough
single Pokémon can in principle clear it alone given enough time/revives. That's a structural
difference from every other RaidTier in this engine, not just a "harder" version of the same
thing.

**Bonus — Super Mega Raid HP/multiplier sourcing, now directly confirmed, not extrapolated.**
Fetched Bulbapedia's raw wikitext (not just AI-summarized prose) for the Difficulty table this
round: Super Mega Raid's row explicitly lists `25000` HP, and its attack/defense-multiplier cell
is part of the same `rowspan="8" | 0.79` group spanning Mega Raid, Legendary Mega Raid, and Super
Mega Raid together — i.e. **0.79 is explicitly the tier's own listed value in the same table row
group, not an assumption carried over from a different tier.** This matches
`RAID_TIER_TABLE["Super Mega Raids"]` in `packages/engine/src/raidBoss.ts` (25000 HP, 0.79
mult) exactly — that entry was sourced correctly, not extrapolated. **[community-consensus,
Bulbapedia raw-wikitext, re-verified 2026-09-09]**. This is separate from the shield mechanic
itself, which the flat multiplier still doesn't capture mid-fight (see below).

## Sources
- pokemongo.com/news/mega-evolution-2026-update — official, first-party, re-fetched 2026-09-09
  targeted at shields specifically (see above).
- poketory.com/en/pokemon-go-super-mega-raid-guide/ — community, fetched 2026-09-09, published
  2026-07-20; only source with a per-boss shield-count table.
- getgodex.com/blog/pokemon-go-super-mega-raids-guide — community, fetched 2026-09-09, published
  2026-08-20; self-discloses its stat-multiplier numbers as unofficial estimates.
- mein-mmo.de/en/pokemon-go-super-mega-raids-heres-how-they-work — community, fetched 2026-09-09.
- hundo-hunter.com/super-mega-raid — community, fetched 2026-09-09, no visible date (also source
  of a separate, unverified "Party Power" fast-move-charging claim not corroborated elsewhere this
  session — treat that piece as [speculative] only, not folded into this shield writeup as settled
  fact).
- leekduck.com/posts/mega-evolution-update-super-mega-raids-super-max/ — community/first-party-
  adjacent, fetched 2026-09-09, corroborates minimum trainer count and Primal/Ditto exclusion.
- destructoid.com/pokemon-go-super-mega-raids-explained/ — community, fetched 2026-09-09,
  confirms 8-minimum lobby and explicit non-soloable/non-duoable framing.
- pokemongohub.net/post/guide/mega-dragonite-raid-guide/ — community, fetched 2026-09-09, per-boss
  confirmation of 10 shields / 10-trainer minimum for this specific species.
- bulbapedia.bulbagarden.net/wiki/Raid_Battle_(GO) — community wiki, fetched 2026-09-09 (both
  rendered prose and raw wikitext of the Difficulty table); confirms 25000 HP / 0.79 multiplier
  for Super Mega Raid tier explicitly, and adds the auto-switch-to-Mega detail on shield trigger.
