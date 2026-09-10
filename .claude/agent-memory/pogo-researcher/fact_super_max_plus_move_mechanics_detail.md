---
name: fact-super-max-plus-move-mechanics-detail
description: Deep-dive on Super Max "+" charged moves - GAME_MASTER template precedent, eligibility gating (available at ANY Mega Level, not just Super Max), and as of round 3 (2026-09-09) PvPoke-sourced PVP power/energy for 13/16 species, an 11/11-evidenced "duration = base move's duration" recommendation, and why raid-context energy stays genuinely unpublished
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

## ROUND 3 (2026-09-09, same-day follow-up) — Q1/Q2 blockers substantially resolved

Overseer asked specifically to close the energy/duration blocker (Q1) and the per-tier scaling
blocker (Q2) so the engine team can build `ChargedMove` support + a Mega Level dropdown. Full
effort spent on those two; Q3-Q5 below are lighter-touch re-checks per the overseer's own priority
order.

### Fresh same-day GAME_MASTER re-check — staleness reconfirmed, not stale info

`data/raw/game_master.json` was re-synced by the team **today** (`_meta.json`:
`fetchedAt: "2026-09-09T22:54:07.668Z"`, working tree, uncommitted at research time). Grepped the
live post-sync file directly: still **zero** `_PLUS`-suffixed movementIds beyond the pre-existing
unrelated `AEROBLAST_PLUS`/`AEROBLAST_PLUS_PLUS`/`SACRED_FIRE_PLUS`/`SACRED_FIRE_PLUS_PLUS` (Apex
Lugia/Ho-Oh). **This is now confirmed against the freshest possible pull, same day as this
research** — not an artifact of researching against a stale cached dump. GAME_MASTER will not
solve Q1 no matter how often it's re-synced; the "+" moves are client/server-side raid- and
GBL-context logic with no distinct template, full stop. `[confirmed, direct grep, 2026-09-09]`.

### Q1 resolved as far as it can be: PvPoke has real PVP-context power+energy for 13 of 16 species

Fetched PvPoke's own actively-maintained community GBL dataset directly
(`raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster/moves.json` — the real file
backing the live pvpoke.com battle simulator, not a paraphrase). It has full, structured
`power`/`energy`/`isMegaMove:true` entries for **13 of the 16 known "+" moves**:

| moveId | Species | PVP power | PVP energy |
|---|---|---|---|
| ACID_SPRAY_PLUS | Mega Victreebel | 20 | 40 |
| BRICK_BREAK_PLUS | Mega Falinks | 40 | 35 |
| DRILL_PECK_PLUS | Mega Skarmory | 60 | 35 |
| DYNAMIC_PUNCH_PLUS | Mega Mewtwo X | 130 | 80 |
| FELL_STINGER_PLUS | Mega Beedrill | 40 | 35 |
| FUTURE_SIGHT_PLUS | Mega Mewtwo Y | 130 | 80 |
| LIQUIDATION_PLUS | Mega Starmie | 55 | 40 |
| MYSTICAL_FIRE_PLUS | Mega Delphox | 50 | 40 |
| PSYBEAM_PLUS | Mega Malamar | 60 | 45 |
| OUTRAGE_PLUS | Mega Dragonite | 80 | 50 |
| SEED_BOMB_PLUS | Mega Chesnaught | 60 | 40 |
| SURF_PLUS | Mega Greninja | 55 | 35 |
| VOLT_TACKLE_PLUS | Mega Raichu X | 65 | 35 |

**Missing from pvpoke entirely**: `BRAVE_BIRD_PLUS`, `DARK_PULSE_PLUS` (both very recent —
plausible pvpoke update lag, Houndoom's was 1 day old at fetch time and Staraptor's isn't even
live yet), and `ZAP_CANNON_PLUS` (Raichu Y — part of the *original* 13-species batch, no obvious
reason for the gap, just an unexplained hole in pvpoke's own coverage).

**[community-consensus, PvPoke's real maintained dataset]** — per the overseer's own framing,
report explicitly as **PvP/GBL-context**, not raid-context. `cooldown: 500` and `turns: 1` appear
identically on every single entry — this is PvPoke's generic post-move tap-lockout bookkeeping
for ANY charged move in their simulator, not a real per-move animation duration. **Do not read
this as a duration figure for raid purposes.**

**Important correction found mid-pass**: PvE and PVP energy costs are NOT generally interchangeable
even for the ordinary base moves underneath these "+" versions — directly checked against this
project's own real GAME_MASTER: base `FELL_STINGER` PvE energyDelta is 33 vs pvpoke's PVP energy
35; base `SEED_BOMB` PvE 33 vs PVP 40; base `VOLT_TACKLE` PvE 33 vs PVP 40. This is ordinary,
well-known behavior (PvE uses only 3 energy tiers — 33/50/100 — while PVP is tuned far more
granularly per move) rather than anything specific to Super Max, but it means **pvpoke's PVP
energy numbers should not be assumed equal to the eventual raid-context energy cost** — they are
the best (and only) real numbers that exist anywhere, not a substitute for the real thing.

### Raid-context "Level 1" power — 2 more community sites, with an important self-caught correction

`doctorpokegogo.com/en/moves/{slug}/` and `dittobase.com/pokemon-go/moves/{slug}` both carry
per-move pages for most of the 16 "+" moves, each with a Level 1-4 (Base/High/Max/Super Max)
power table. Cross-checked against the 4 numbers with an independent anchor (3 official Niantic
raid-power posts + 1 cross-site match, see below): **in every case, the site's own "Level 1" row
equals the independently-anchored number exactly.** This is good evidence the Level-1 column is a
faithful "what the move does today" reading, not noise:

| Move | Species | Raid "Level 1" | Anchor |
|---|---|---|---|
| Brave Bird+ | Staraptor | 150 | **official** (pokemongo.com) |
| Dark Pulse+ | Houndoom | 150 | **official** (pokemongo.com) |
| Fell Stinger+ | Beedrill | 140 | **official** (pokemongo.com) |
| Zap Cannon+ | Raichu Y | 160 | cross-site: `db.pokemongohub.net` states "Damage: 160" flatly, independent of doctorpokegogo's own table, which also reads Level1=160 |
| Seed Bomb+ | Chesnaught | 150 | doctorpokegogo only, self-labeled estimate |
| Volt Tackle+ | Raichu X | 170 | doctorpokegogo only, self-labeled estimate |
| Drill Peck+ | Skarmory | 170 | doctorpokegogo only, self-labeled estimate |
| Outrage+ | Dragonite | 185 | doctorpokegogo only, self-labeled estimate |
| Dynamic Punch+ | Mewtwo X | 130 | doctorpokegogo only, self-labeled estimate |
| Future Sight+ | Mewtwo Y | 140 | dittobase only, self-labeled estimate (doctorpokegogo's own page for this move 404s) |

**Still with zero raid-power reading of any kind, from any source**: Mystical Fire+ (Delphox),
Surf+ (Greninja), Brick Break+ (Falinks), Liquidation+ (Starmie), Acid Spray+ (Victreebel),
Psybeam+ (Malamar). Do not backfill these.

**The "Base/High/Max/Super Max = Level 1/2/3/4" mapping is now better-sourced than round 2 left
it.** `dittobase.com` states it as an explicit table (`1=Base ×1, 2=High ×1.1, 3=Max ×1.2,
4=Super Max ×1.3`), and separately, WebSearch's summary of the official
`pokemongo.com/news/staraptor-super-mega-raid-day-2026` post states "Staraptor caught from Super
Mega Raids will have Mega Level 1 unlocked" — i.e. Niantic itself uses "Mega Level 1" as the name
for a freshly-caught single mega evolution, which is definitionally "Base." **Tier note**: the
Staraptor quote came through a WebSearch aggregate summary, not a direct verbatim WebFetch of the
page this round — treat the *numbering* (1=Base) as [community-consensus corroborated by an
official phrase relayed via search-summary], not a directly-quoted primary source.

**Important self-correction on the "+10% power per Mega Level tier" formula.** Round 2 found this
on doctorpokegogo alone and flagged it speculative. This round found the *identical* formula
(expressed as multipliers: `1×/1.1×/1.2×/1.3×`) on **dittobase.com too** — but on inspecting
multiple pages on each site, **the disclaimer text is verbatim-identical across every "+"-move
page on each given site** ("This formula is our own estimate based on in-game measurement" /
"The multipliers are community-observed and may change..."). That means this is **two sites' own
site-wide template assumption, not 13+ independently-derived per-move data points converging.**
Correctly stated, the evidence is: **two separately-run community sites, independently of each
other, both chose +10%/tier as their working assumption** — worth more than one guess, but still
short of true multi-source consensus, and still self-labeled an estimate by both. **No official
source, LeekDuck, PvPoke, Reddit, or Silph Road corroboration found for this specific formula**
despite direct, repeated search this round. Do not upgrade this past "cross-site community
estimate, unconfirmed" tier.

### Duration: now very well evidenced as "= the base move's own real duration, unchanged"

Not stated as a rule by any source — this is this session's own cross-check, done by comparing
every community-reported "+" move duration against this project's real, freshly-synced
GAME_MASTER duration for that species' base (non-plus) version of the same move. **11 for 11,
zero exceptions**:

| "+" move | Community-reported duration | Real base-move `durationMs` (GAME_MASTER) |
|---|---|---|
| Dark Pulse+ | 3.00s (doctorpokegogo) / 3.0s (dittobase) | `DARK_PULSE` 3000 |
| Brave Bird+ | 2.00s (doctorpokegogo) | `BRAVE_BIRD` 2000 |
| Fell Stinger+ | 2.00s (doctorpokegogo) / 2.0s (dittobase) | `FELL_STINGER` 2000 |
| Seed Bomb+ | 2.00s (doctorpokegogo) | `SEED_BOMB` 2000 |
| Volt Tackle+ | 3.50s (doctorpokegogo) | `VOLT_TACKLE` 3500 |
| Outrage+ | 4.00s (doctorpokegogo) | `OUTRAGE` 4000 |
| Dynamic Punch+ | 2.50s (doctorpokegogo) | `DYNAMIC_PUNCH` 2500 |
| Drill Peck+ | 2.50s (doctorpokegogo) | `DRILL_PECK` 2500 |
| Future Sight+ | 2.5s (dittobase) | `FUTURESIGHT` 2500 (note: no underscore in the real movementId) |

**Recommendation (explicitly invited by the overseer for this fallback): assume a "+" move's raid
`durationSeconds` equals its own species' base move's real, currently-synced duration, unchanged.**
This is inference from a clean 11/11 pattern, not a stated fact anywhere — but it is the best
evidenced assumption available by a wide margin.

### Energy: genuinely unpublished for raid context — and one source's numbers actively distrusted

No source anywhere states a raid-context energy cost that survives cross-checking. `doctorpokegogo`
is honest about this ("Energy Bar Cost: Not specified in official data" on every single move page
checked). `dittobase` does print a raid-context "Energy Cost" figure — but it reads **exactly
-100 on every single move checked** (Dark Pulse+, Fell Stinger+, Future Sight+), **regardless of
that move's own real base-move energyDelta** (which is 50, 33, and 100 respectively — only the
last one coincidentally matches). A number that never varies despite the underlying real values
varying is a template default/placeholder, not sourced data. **Flagging `dittobase`'s
raid-context energy field as unreliable; do not use it, and treat this as a source-reliability
note for future passes**, distinct from its duration field (which independently checks out, see
above) and its PVP-context numbers (which independently match pvpoke's real values, see below) —
i.e. don't discard the whole site, just this one specific field.

**Recommendation (explicitly invited): the only defensible analogy is the real GAME_MASTER
precedent** — the sole two cases where Niantic has ever shipped a "+"/"++"-style upgraded charged
move as an actual template (Apex Lugia's Aeroblast, Apex Ho-Oh's Sacred Fire) kept `energyDelta`
**exactly identical** across every tier:
`AEROBLAST 180/100/3500ms -> AEROBLAST_PLUS 200/100/3500ms -> AEROBLAST_PLUS_PLUS 225/100/3500ms`;
`SACRED_FIRE 120/100/2500ms -> SACRED_FIRE_PLUS 135/100/2500ms -> SACRED_FIRE_PLUS_PLUS 155/100/2500ms`
(both re-grepped fresh this round from today's synced dump). By direct analogy, **assume a "+"
move's raid `energyCost` equals its own species' base move's real energyCost, unchanged** — this
is weaker evidence than the duration recommendation (2 precedent cases in an unrelated mechanic,
vs. 11/11 direct checks on the actual mechanic in question), and unlike duration it is **not**
corroborated by any per-move community source once the unreliable `dittobase` field is discounted.
Confidence: reasoned-by-analogy, not evidenced-by-the-actual-mechanic. A confident "unpublished"
is the honest headline; this is the best fallback if a number is required at all.

### `vulnerableWindowSeconds` needs no separate research

Checked `packages/engine/src/gamemaster.ts` directly: for every existing move today,
`vulnerableWindowSeconds` is simply set equal to `durationSeconds`
(`vulnerableWindowSeconds: durationSeconds` — not derived from GAME_MASTER's real
`damageWindowStartMs`/`damageWindowEndMs` fields at all, for any move). Whatever `durationSeconds`
value gets chosen for a "+" move will produce its `vulnerableWindowSeconds` for free under the
engine's existing convention, with zero additional data needed. The "Damage Window" figures
doctorpokegogo publishes (1.40s/1.00s/1.60s/2.10s/2.80s for various "+" moves) are a **different,
real-sounding concept** (likely related to `damageWindowStartMs`/`EndMs`, i.e. when the move's own
damage registers within its animation) that this engine does not currently model for ANY move —
noted for completeness, not a Q1 blocker.

### Q3: roster stands at 16, re-confirmed same-day, no growth beyond what round 2 found

Re-checked fresh (event is live, today is event day 2 of 7): `leekduck.com/gofest/mega-updates/`,
`pokemongohub.net/post/event/pokemon-go-mega-squads-event-guide/`, and a same-day news search all
independently reconfirm the roster is the same 15 live + Staraptor-still-upcoming = 16 total found
at the end of round 2. **No 17th species found.** Mega Squads event (2026-09-08 to 09-14) added
exactly Houndoom (Dark Pulse+) and Beedrill (Fell Stinger+), nothing else. Staraptor's Sept 19
debut is independently reconfirmed still upcoming (rotomlabs.net, gonintendo.com, leekduck.com,
pokemongo.com all agree on the date; "Staraptor caught from Super Mega Raids will have Mega Level
1 unlocked" is new detail from that post).

### Q4: mechanism still not found; one new negative signal, one new provenance fact

- **Bulbapedia** (`bulbapedia.bulbagarden.net/wiki/Mega_Evolution_(GO)`, fetched 2026-09-09, a
  higher wiki-tier source than the SEO sites this claim otherwise lives on) independently states
  "Mega-Evolved Pokémon at Super Max Level will have higher CP" — corroborates the claim exists,
  but **gives zero mechanism/formula detail**, same gap as every other source checked across 3
  rounds now.
- **New negative signal**: `doctorpokegogo.com`'s own per-species raid pages (e.g. the Mega
  Beedrill page) carefully model Mega-Level-dependent scaling for the "+" move itself (with a
  full DPS-by-level breakdown) but show **zero corresponding CP/Attack/DPS difference for that
  Pokémon's ORDINARY moves** across Mega Levels anywhere on the page. A site this detail-oriented
  about Mega Level scaling not surfacing an ordinary-move DPS delta is suggestive — not proof —
  that community raid calculators are not treating "greatly enhanced CP" as a real, DPS-relevant
  CPM change. Still not decisive either way.
- **New provenance fact, not numerically useful**: Bulbapedia dates the "+" move feature itself
  (distinct from the Super Max Level tier existing since Feb 2026) to **2026-08-31**, and states
  it is "based off Plus Moves from Pokémon Legends: Z-A." Checked what Z-A's own Plus Moves
  actually are (Siliconera/Game8/Bulbapedia's own `Plus_Move` page, 2026-09-09): in that game, a
  Plus Move is "any move used by a Mega Evolved Pokémon" — i.e. Z-A boosts **every** move a mega
  uses via a spendable resource gauge, not one single bonus move. GO's implementation (one named,
  permanently-known extra Charged Attack) is structurally different — same branding/flavor, not a
  transferable formula. Dead end for numbers, but worth knowing so nobody goes looking in Z-A's
  own data files expecting a match.
- Net: **magnitude stays at [community-consensus]** (+2 effective levels, +3 with Best Buddy, per
  the gist-comment convergence already recorded in [[fact-cpm-table-levels-41-50]]); **mechanism
  stays unconfirmed**, now with a mild negative lean from the doctorpokegogo non-finding above.

### Q5: additional slot confirmed; prerequisite and per-battle restriction remain genuinely silent

- **Additional/3rd slot, not a replacement**: consistent "additional Charged Attack" language
  across every official and community source fetched this round and prior rounds. No source ever
  frames it as replacing either of the Pokémon's normal two.
- **2nd-charged-move (Elite TM / "New Attack") prerequisite**: searched this specific question
  multiple ways (direct WebSearch phrasing, direct WebFetch of the official post, direct WebFetch
  of leekduck's mirror) — **no source anywhere mentions this as a requirement**. The only stated
  gating condition, repeated identically everywhere, is "(a) species eligible for Super Max" +
  "(b) currently Mega Evolved." Treat "no prerequisite" as **inference from consistent silence
  across many independently-phrased searches**, not a positive confirmation — nobody has
  explicitly ruled it out either, they just never mention it, which given how much these same
  posts explain about the mechanic reads as meaningful silence.
- **Per-battle usage restriction (cooldown, once-per-battle)**: same result — zero mentions found
  anywhere, despite the same posts being detailed enough to specify Gym-battle exclusion and GBL
  inclusion explicitly. Same "meaningful silence" caveat applies.
- **Do not conflate with Mewtwo's "Adventure Effect."** Mega Mewtwo X/Y's announcement bundles a
  *second*, unrelated mechanic (an overworld encounter utility — e.g. Future Sight+'s Adventure
  Effect reveals 3-star-or-higher IV Pokémon on encounter) alongside the "+" charged move. That
  Adventure Effect plausibly has its own activation/cooldown rules, but it is not a raid-combat
  mechanic and is out of scope for this engine; don't let it bleed into the "+" move's own
  (apparently unrestricted) usage model.

### Explicit check against the standing 1.3x team-boost decision

Nothing found this round touches it. Every source describes the "+" move and Super Max's CP
increase as affecting only the individual Pokémon's own combat output, never anything shared with
teammates. No contradiction to flag, same conclusion as rounds 1-2.
