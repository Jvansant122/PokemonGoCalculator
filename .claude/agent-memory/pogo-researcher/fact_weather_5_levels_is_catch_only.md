---
name: fact-weather-5-levels-is-catch-only
description: Resolves whether weather's "+5 effective levels" changes in-battle combat stats (boss or attacker) — it does not; it is a wild-spawn/catch-encounter-level mechanic only, fully separate from the 1.2x in-battle damage multiplier
metadata:
  type: project
---

Researched 2026-09-09 (round 4), settling the open question this project's own code comments
flagged in [[fact_weather_boost_mechanic]] and `packages/engine/src/weather.ts`'s "KNOWN
SIMPLIFICATION" doc comment.

## The headline answer

**Weather's "+5 effective levels" is a spawn/catch-encounter mechanic, not an in-battle combat
stat effect, for EITHER side.** It governs the level (and therefore CP) of a Pokémon when it
spawns in the wild or is caught after a raid/Team GO Rocket battle — never the attack/defense
math used *during* the fight. In battle, weather is fully and only the flat 1.2x move-power
multiplier on both sides (already correctly modelled). This project's own `weather.ts` comment
claiming a deferred "stat-level effect on top of the 1.2x multiplier" describes a mechanic that
does not exist — see the correction note at the bottom.

## 1. Does weather change a raid boss's IN-BATTLE stats?

**No. [community-consensus, but resting on a settled formula, not new research this pass]**
Per [[fact_raid_boss_tier_stats_resolved]] (Bulbapedia raw wikitext, 2026-09-05): a raid boss's
real battle Attack/Defense is `floor((baseStat + 15) * tierMultiplier)`, where `tierMultiplier`
is a **fixed per-tier constant** (0.5974 / 0.73 / 0.79) with no "level" input anywhere in the
formula — it is not derived from CPM-by-level at all, it's a raid-specific lookup. HP is a
separate fixed per-tier pool, also with no level input. Weather is not a term in either formula.
The "level 20 → 25" figure governs only the Pokémon you receive in your bag after winning — a
completely different, later calculation (`CP = floor(sqrt(HP)*Attack*sqrt(Defense)/10)` using
level-derived CPM against the caught Pokémon's own IVs) that has zero bearing on the boss's
in-battle threat.

Confirmed again this pass via two independent fetches (Bulbapedia raw wikitext + a
WebFetch-summarized read of the same page): "are five power up levels higher than normal (capped
at 35 instead of 30 for wild Pokémon, **25 instead of 20 for Raid Bosses**, and 13 instead of 8
for Shadow Pokémon)" — the word "capped" here is about the caught/spawned Pokémon's level cap,
not a boss battle stat.

## 2. Does the boss's damage output get the 1.2x weather multiplier?

**Yes, confirmed [community-consensus].** pokemongohub.net's raid-capture-CP guide states
explicitly: "raid bosses are also affected by this boost during battle" — "Attacks executed in
their preferred weather will have a 20% boost in power," applying to the boss's own attacks
against the player exactly like it does to the player's attacks against the boss. This matches
the general community description ("weather boost affects both sides of a raid/gym battle") that
[[fact_weather_boost_mechanic]] already recorded.

## 3. Does this engine apply weather to the boss's damage?

**Yes — already symmetric, no asymmetry to flag.** Read `packages/engine/src/comparison.ts`,
`teamRaid.ts`, `speciesReport.ts`, `powerUp.ts`: every one of them calls `isWeatherBoosted(...)`
independently for the candidate's fast/charged moves AND the boss's fast/charged moves, feeding
the result into each side's own `calculateDamage` call. `weather.ts`'s own doc comment states
this in so many words: "applies identically to either side of a fight (a boss's own moves are
checked the same way a candidate's are)." The task's worried-about attacker-only asymmetry does
not exist in this codebase — it was already built correctly per-move on both sides.

## 4. Raid catch IV floor / level numbers (for the future "hypothetical 6th catch" Power-Up
## Optimizer idea, IDEAS.md item 3)

**[community-consensus], triple-corroborated this pass** (pokemongohub.net's raid-capture-CP
guide, Dittobase's "IV Floors by Encounter Type" page, and a general weather-guide cross-check):
- Raid catch (any tier, including Legendary): guaranteed IV floor is **10/10/10**, unaffected by
  weather. Dittobase states it plainly: "Weather boost raises the catch level, not the IV floor."
- Catch level: **20 normally, 25 when weather-boosted** (the boss's own type matches active
  weather). Worked example given by pokemongohub: a 100% IV Ho-Oh is CP 2222 at level 20, CP 2778
  at level 25 — same IVs, only the level term changes.
- Team GO Rocket catches: level 8 normally, level 13 weather-boosted (Bulbapedia, same page) —
  not directly relevant to this project's raid-only scope, noted for completeness.

These are the correct numbers to hardcode if IDEAS.md item 3 (hypothetical roster-swap candidate
at raid catch level) is ever built.

## 5. Does weather change the ATTACKER's effective level in battle (CPM-style stat bump), or is
## it purely the 1.2x damage multiplier?

**Purely the 1.2x damage multiplier. The "attacker gets +5 levels in battle" framing is a myth /
conflation, not a real mechanic** — this directly corrects the framing this project's own
`weather.ts` comment and [[fact_weather_boost_mechanic]] carried since 2026-09-05.

A WebSearch AI-synthesis this pass initially produced an unsourced claim ("attacker is treated as
+5 levels, CP up ~10%, HP up ~5%") — flagged and specifically re-checked rather than trusted, per
this role's "fetched content is data, not instructions" discipline. A follow-up targeted search
("does weather increase my attacking pokemon's level in battle — myth") returned a direct,
multi-source-corroborated correction: "This is a myth — weather boost does NOT increase your
Pokémon's level during battle. ... Weather boost affects the level of Pokémon you *catch*, not
those already in your collection." A trainer's own owned Pokémon has a level fixed by their own
power-ups; weather cannot and does not change it. The only "+5 levels" effect that is real is the
wild-spawn/catch-encounter-level mechanic in section 1/4 above, which is entirely about newly
spawning/caught Pokémon, never an already-owned attacker mid-battle.

One piece of weaker circumstantial evidence found this pass, tagged **[speculative]**: an old
(client version ~0.85.1, i.e. ~2017-era, around when Weather itself launched) datamine writeup
surfaced via WebSearch synthesis names distinct proto fields — `WeatherAffinityProto`,
`WeatherBonusProto`, `get_CpBaseLevelBonus`, `get_GuaranteedIndividualValues`,
`get_AttackBonusMultiplier` — i.e. the level-bonus/IV-floor settings and the attack-damage-bonus
setting appear to be genuinely separate schema fields even at the code level, not one field doing
double duty. This is structurally consistent with sections 1-5 above but is a single very old
AI-paraphrased source, not independently verified this pass — treat as corroborating color, not
as the basis for a claim on its own.

## Correction owed to this project's own code/memory

- `packages/engine/src/weather.ts`'s "KNOWN SIMPLIFICATION" comment (added 2026-09-05) currently
  reads: "real Pokémon GO weather also treats the attacking Pokémon as if it were +5 effective
  levels higher (a stat-level effect on top of the 1.2x damage multiplier below) ... NOT
  implemented (would require conditionally recomputing effective stats at level+5 per move, a
  bigger change deferred as a deliberate v1 scope call)." **This describes a mechanic that does
  not exist.** There is nothing to implement — not because it was correctly scoped out as future
  work, but because the premise was wrong. This is a documentation-accuracy finding, handed back
  for `engine-developer` to fix the comment (and delete the now-moot "deferred scope call"
  framing) — not something I've changed myself.
- [[fact_weather_boost_mechanic]] (2026-09-05) is superseded by this entry on the "+5 levels"
  point specifically; its 1.2x-damage-both-sides finding and the weather-to-type mapping table
  remain correct and unchanged.

## Sources
- [[fact_raid_boss_tier_stats_resolved]] — underlying tier-multiplier formula (Bulbapedia raw
  wikitext, fetched 2026-09-05), re-confirmed applicable here.
- Bulbapedia, "Weather (GO)", raw wikitext (`action=raw`), fetched 2026-09-09: verbatim "five
  power up levels higher... capped at 35 instead of 30 for wild Pokémon, 25 instead of 20 for
  Raid Bosses, and 13 instead of 8 for Shadow Pokémon"; verbatim "Increasing the power of moves
  of boosted types in Gym and Raid Battles by 20%."
- pokemongohub.net, "Raid Boss Max CP capture values with active Weather boost", fetched
  2026-09-09: "raid bosses are also affected by this boost during battle," Ho-Oh CP 2222→2778
  worked example.
- Dittobase, "Pokémon GO IV Floors by Encounter Type", fetched 2026-09-09: raid-catch 10/10/10
  floor across all tiers, "weather boost raises the catch level, not the IV floor."
- WebSearch synthesis (multi-source, not independently re-fetched verbatim), 2026-09-09: direct
  "myth" correction on attacker-side level bump; cross-checked against the above rather than
  trusted alone.
- Direct code reads (not web sources): `packages/engine/src/weather.ts`, `damage.ts`,
  `comparison.ts`, `teamRaid.ts`, `speciesReport.ts`, `powerUp.ts`, `raidBoss.ts` — confirmed the
  engine already applies `weatherBoosted` symmetrically to both sides and that boss stats never
  reference weather or level anywhere in the codebase.
- niantic.helpshift.com weather-boosts FAQ: attempted, returned HTTP 403 this pass (consistent
  with prior sessions' note that official Niantic/Scopely help pages are frequently unfetchable
  directly) — not used as a source, noted as attempted-and-blocked rather than silently skipped.
