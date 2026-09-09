---
name: fact-super-max-plus-move-mechanics-detail
description: Deep-dive on Super Max "+" charged moves - GAME_MASTER template precedent, confirmed raid power for 3 moves, and a CORRECTION to eligibility gating (move is available at ANY Mega Level, not just Super Max)
metadata:
  type: project
---

Researched 2026-09-09, round-2 overnight pass, follow-up to [[fact-super-max-extra-charged-move]] and
[[fact-mega-level-system-2026-update]]. Answers the 5 questions the overseer asked; corrects one
detail from the earlier pass.

## Q1: Do "+" moves exist as distinct GAME_MASTER move templates?

**Precedent confirmed, but not yet for THIS mechanic in the committed dump.** Grepped
`data/raw/game_master.json` (committed 2026-09-09, 321 move templates) directly:

- Niantic DOES use a `_PLUS` / `_PLUS_PLUS` movementId suffix convention for upgraded charged
  moves elsewhere in GAME_MASTER: `AEROBLAST_PLUS` (power 200), `AEROBLAST_PLUS_PLUS` (power 225,
  vs base `AEROBLAST` power 180), `SACRED_FIRE_PLUS` (power 135), `SACRED_FIRE_PLUS_PLUS` (power
  155, vs base `SACRED_FIRE` power 120) — each a fully distinct template with its own
  power/energyDelta/durationMs, exactly the 5 fields this repo's sync already keeps.
  **[confirmed, raw GAME_MASTER, fetched 2026-09-09]**. These are NOT the Super-Max mega
  mechanic — WebSearch corroborated (gamepress.gg, dexerto.com) they belong to **Apex Shadow
  Lugia / Apex Purified Lugia** from Pokémon GO Tour: Johto (Aeroblast+ is Apex Shadow Lugia's
  default move; purifying it upgrades to Aeroblast++). Cited here only as proof the naming/data
  pattern exists in this game's data model.
- **None of the confirmed Super-Max "+" moves (BRAVE_BIRD_PLUS, DARK_PULSE_PLUS,
  FELL_STINGER_PLUS, SEED_BOMB_PLUS, VOLT_TACKLE_PLUS, etc.) appear anywhere in this committed
  dump** — neither as templates nor referenced in any `pokemonSettings.eliteCinematicMoves`/
  `cinematicMoves`. Confirms the user's framing: this dump (fetched 2026-09-09) is upstream-stale
  for this mechanic, same as the already-known missing Raichu Volt Tackle. LUGIA's own
  `pokemonSettings` entry lists only `AEROBLAST` in `eliteCinematicMoves`, not the `_PLUS`
  variants either — so even the precedent templates are currently "orphaned" (defined but
  unassigned) in this specific mirror.
- **Conclusion for Q1**: distinct-template is the established pattern Niantic uses for this kind
  of move upgrade, so IF/when Super Max "+" moves land in PokeMiners' GAME_MASTER mirror, this
  repo's existing 5-field extraction should pick them up automatically with zero code change —
  same as any other new move. The blocker today is entirely upstream staleness, not a sync-code
  gap. **[reasoned inference from confirmed data, not itself an official statement]**.

## Q2: Species x move table (partial, honestly labelled)

**15 species now confirmed** (up from 13 in the prior pass — the roster has grown twice more
since, once mid-flight during this very research pass):

| Species | Base move | "+" move | Base raid power (GAME_MASTER) | "+" raid power | Source/date |
|---|---|---|---|---|---|
| Mega Chesnaught | Seed Bomb | Seed Bomb+ | 55 | not found | GO Fest 2026 Mega Finale (pokemongo.com, leekduck) |
| Mega Delphox | Mystical Fire | Mystical Fire+ | 60 | not found | same |
| Mega Greninja | Surf | Surf+ | 60 | not found | same |
| Mega Raichu X | Volt Tackle | Volt Tackle+ | 90 (base VOLT_TACKLE template; not yet in Raichu's own moveset) | not found | same |
| Mega Raichu Y | Zap Cannon | Zap Cannon+ | 140 | not found | same |
| Mega Skarmory | Drill Peck | Drill Peck+ | 70 (buffed Sept 2 2025) | not found | same |
| Mega Falinks | Brick Break | Brick Break+ | 40 | not found | same |
| Mega Starmie | Liquidation | Liquidation+ | (not pulled this pass) | not found | same |
| Mega Victreebel | Acid Spray | Acid Spray+ | 20 | not found | same |
| Mega Malamar | Psybeam | Psybeam+ | 65 | not found | same |
| Mega Dragonite | Outrage | Outrage+ | 110 | not found | same |
| Mega Mewtwo X | Dynamic Punch | Dynamic Punch+ | 85 | not found | pokemongo.com/en/news/more-mega-updates-2026 |
| Mega Mewtwo Y | Future Sight | Future Sight+ | 115 | not found | same |
| **Mega Staraptor** (not yet live, debuts 2026-09-19) | Brave Bird | **Brave Bird+** | 130 | **150** (raid), 70 (PvP, -3 Def stages self-debuff) | **[official]** pokemongo.com/news/staraptor-super-mega-raid-day-2026, fetched 2026-09-09 |
| **Mega Houndoom** (NEW this event) | Dark Pulse | **Dark Pulse+** | 80 | **150** (raid), 60 (PvP) | **[official]** pokemongo.com/en/news/mega-squads-2026, fetched 2026-09-09 |
| **Mega Beedrill** (NEW this event) | Fell Stinger | **Fell Stinger+** | 45 | **140** (raid), 40 (PvP, +1 Atk stage self-buff) | **[official]** same |

Houndoom and Beedrill are brand-new additions from the **Mega Squads event, 2026-09-08 to
2026-09-14** — i.e. this list is not a closed batch, it keeps growing event-by-event. Treat any
"the 13/15/16 species" count as a snapshot, not a ceiling.

Power values for the other 12 species' "+" moves were **not found in any source this pass** —
every guide article that lists the species names explicitly declines to give power numbers for
them. Do not backfill with a guessed number.

## Q3: Is "+" raid power flat, ratio-scaled, or per-move? — Best answer yet, still not fully settled

Three **officially-sourced** raid-power data points now exist (all fetched 2026-09-09, all from
pokemongo.com news posts):

| Move | Base power | "+" raid power | Delta | Ratio |
|---|---|---|---|---|
| Brave Bird | 130 | 150 | +20 | +15% |
| Dark Pulse | 80 | 150 | +70 | +88% |
| Fell Stinger | 45 | 140 | +95 | +211% |

**Neither a flat delta nor a fixed ratio holds** — +20/+70/+95 and +15%/+88%/+211% are all wildly
different. What DOES line up: the three absolute **"+" raid-power values cluster tightly at
140-150**, regardless of how weak or strong the base move was. This reads as each "+" move being
independently tuned to land in a similar target power band (roughly Frenzy-Plant/Blast-Burn
tier), not derived from the base move by any formula. **[reasoned inference from 3 official data
points — a real pattern, but 3 points is not proof of intent; do not present as a confirmed
design rule]**.

**Unresolved**: none of the three official posts state whether 150/150/140 are the move's power
at **Base** Mega Level, at **Super Max**, or some other tier — all three posts mention "power
increases with Mega Level" as a separate clause from the flat number, and no source gives a
per-tier breakdown (checked doctorpokegogo.com's dedicated Super-Max ranking article — it has a
cooldown/candy-bonus/energy-cost table across the 4 tiers, but explicitly no move-power table).
Given Q4's correction below, the likeliest reading is that 140-150 is close to the number a
player will see immediately post-release (since press coverage happens day-1, when almost nobody
is at Super Max yet) — i.e. probably closer to a **Base-tier** number that grows further toward
Super Max, not a Super-Max ceiling. **This is speculative**, not stated anywhere directly.

## Q4: What does reaching Super Max require, and — important correction — is the "+" move even gated behind it?

**Correction to the prior pass's framing.** The earlier memory implied an attacker needs to be
"at Super Max Level AND mega-evolved" to use the "+" move at all. That is **wrong**. Direct quote,
fetched via leekduck.com/posts/more-mega-updates-2026 (community/first-party-adjacent mirror of
the official pokemongo.com post) 2026-09-09:

> "Eligible Pokémon will know their additional Charged Attack while Mega Evolved, **regardless of
> their current Mega Level**."

So:
- **Having the move at all** requires only: (a) the species is on the Super-Max-eligible list,
  and (b) the individual is currently Mega Evolved. A single Mega Evolution (Base Mega Level) is
  enough to unlock access to the move. **[official, via first-party-adjacent mirror quoting the
  source sentence verbatim]**.
- **The move's power scales up further** as that individual's own Mega Level rises toward Super
  Max — so the ceiling (best-case damage) is still gated behind the full grind, but a "typical"
  raider who has mega-evolved a species even once already has SOME version of the move.
- Reaching Super Max itself costs **5,000 of that species' own Mega Energy**, spent after already
  reaching Max Level (30 cumulative evolutions or equivalent Mega Energy purchases per the
  existing Base/High/Max ladder in [[fact-mega-level-system-2026-update]]) — this specific figure
  is now cross-corroborated by multiple independent guide sites in September 2026 in addition to
  the original February 2026 Niantic post, still **[community-consensus with an official
  anchor]**, not itself quoted verbatim from Niantic this pass.
- **Scope: per-species**, not account-wide (confirmed again this pass, no change).
- **Practical takeaway for "is this fringe or typical"**: the ANSWER SPLITS. Access to a weaker
  version of the "+" move is not fringe — any player who mega-evolves an eligible species once
  has it. The FULL-POWER version is a real endgame grind (5,000 species-specific Mega Energy on
  top of 30 evolutions to Max first). A tool modelling only the ceiling number would overstate a
  typical player's real damage; modelling only the floor would understate a dedicated player's.

## Q5: Any other new mega-conditional combat property?

No new property found beyond what [[fact-mega-level-system-2026-update]] and
[[fact-super-max-extra-charged-move]] already recorded (Greatly Enhanced CP mechanism still
unconfirmed/speculative beyond a "+2 levels" number that only lower-tier SEO sites cite; catch
bonuses; 24h cooldown at Super Max; the 1.3x team boost confirmed unchanged). Nothing new
surfaced this pass on a stat/CPM mechanism for "Greatly enhanced CP" specifically — still open.

## Not proposing a build

Same reasoning as [[fact-super-max-extra-charged-move]]: this needs a new per-species Mega Level
dimension the engine doesn't have at all, and now that dimension has to represent 4 discrete tiers
each with a DIFFERENT "+" move power, not a boolean gate — bigger than previously scoped. Handing
back as research only.

## Sources (all fetched 2026-09-09 unless noted)
- `data/raw/game_master.json` (committed dump, direct grep) — primary source for all base-move
  power numbers and the `_PLUS`/`_PLUS_PLUS` template precedent.
- pokemongo.com/news/staraptor-super-mega-raid-day-2026 — official (Brave Bird+).
- pokemongo.com/en/news/mega-squads-2026 — official (Dark Pulse+, Fell Stinger+, event dates).
- pokemongo.com/en/news/more-mega-updates-2026 / leekduck.com/posts/more-mega-updates-2026 —
  official / first-party-adjacent mirror (13-species original list, eligibility-gating sentence).
- gamepress.gg "Meta Implications: Aeroblast Lugia", dexerto.com — community, for Apex Lugia
  context only (not the mechanic in question).
- doctorpokegogo.com/super-max-level-mega-evolutions-ranked/ — community, checked for a
  per-tier power table, found none.

## A WebSearch summarization caveat worth recording

One WebSearch call's auto-summary asserted "Houndoom will now be able to use... Dark Pulse+" as
if already a known fact before I had fetched a primary source for it — this turned out to be
TRUE (confirmed moments later via direct WebFetch of the official mega-squads-2026 post), but it
arrived as an unsourced claim inside a search-engine summary layer, not a citation. Treated as
speculative until independently fetched and confirmed; flagging the pattern since this project's
standing rule is not to trust a claim's tier above what was actually verified.
