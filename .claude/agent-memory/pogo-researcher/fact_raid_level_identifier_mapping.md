---
name: fact-raid-level-identifier-mapping
description: Maps GAME_MASTER's internal RAID_LEVEL_* / RAID_CLIENT_SETTINGS identifiers (fetched raw by the user 2026-09-09) onto this engine's player-facing RaidTier union; closes the Elite Raid timer loose end; confirms Super Mega Raids DO support remote passes while Elite/Unity do not
metadata:
  type: project
---

Researched 2026-09-09, round 3, from evidence the user supplied directly (raw GAME_MASTER
`RAID_CLIENT_SETTINGS` + full `RAID_LEVEL_*` identifier list, PokeMiners mirror, same dump this
repo syncs from). This is the durable mapping table — read before touching `raidBoss.ts` or
`raidHistory.json`'s tier-label handling again.

## Full identifier -> player-facing tier mapping

| Internal identifier | Player-facing tier | Confidence |
|---|---|---|
| `RAID_LEVEL_1_SHADOW` | Shadow Raid, 1-star base stats | [INFERRED from name, corroborated — see [[fact_shadow_raid_enrage_state]]: shadow bosses use base-tier HP, no separate table] |
| `RAID_LEVEL_3_SHADOW` | Shadow Raid, 3-star base stats | [INFERRED from name, corroborated] |
| `RAID_LEVEL_5_SHADOW` | Shadow Raid, 5-star base stats | [INFERRED from name, corroborated] |
| `RAID_LEVEL_4` | Legacy/retired "Tier 4" identifier (pre-Aug-2020; possibly the same as Bulbapedia's "Community Day Raid" historical label the engine's own `RAID_TIER_TABLE` comment references for "Mega Raids") | [community-consensus + INFERRED] — pokemongohub.net "Pokémon GO removes Tier 2 and Tier 4 raids" confirms tier 4 was merged into tier 3 Aug 2020; kept in GAME_MASTER as dead client plumbing, not a currently-spawnable tier |
| `RAID_LEVEL_MEGA` | "Mega Raids" (engine's existing 4-icon tier, 9000 HP/0.79) | [INFERRED, high confidence — direct name match] |
| `RAID_LEVEL_MEGA_5` | "Legendary Mega Raids" (engine's existing six-star tier, 22500 HP/0.79) | [INFERRED, high confidence, by analogy with the 4/5-Star split pattern below] |
| `RAID_LEVEL_PRIMAL` | "Primal Raids" (engine's existing tier, 22500 HP/0.79) | [near-certain, direct name match] |
| `RAID_LEVEL_ULTRA_BEAST` | Ultra Beast raid — NOT a distinct combat-stat tier; shares "5-Star Raids" HP/multiplier. WebSearch aggregate: "Ultra Beasts appear as Tier-5 Raid bosses." The distinct identifier most likely exists for spawn/catch-mechanic flagging (no gender, different catch flow), not different battle stats | [community-consensus] |
| `RAID_LEVEL_EXTENDED_EGG` | **Elite Raid** (engine's existing known gap — see [[fact_elite_raid_tier_gap]]) | [INFERRED from name + strongly corroborated]: "EXTENDED" matches Elite Raid's own up-to-24h extended hatch timer (vs. the ordinary 1h egg), and this identifier's presence in `unsupportedRemoteRaidLevels`/`unsupportedRaidLevelsForFriendInvites` exactly matches Elite Raids' real, well-known in-person-only rule (Bulbapedia, thegamer.com, sportskeeda, all consistent) |
| `RAID_LEVEL_4_MEGA_ENHANCED` | **Super Mega Raid**, non-legendary-base-mega variant (Bulbapedia's own difficulty table names this row plain "Super Mega Raid", distinct from the row below, though both share identical stats: 25000 HP/0.79) | [community-consensus, datamine-corroborated] — a Pokemod Group datamine tweet (X, dated in this dump's era) explicitly names "Mega Enhanced Raid Level 4 and Level 5" and gives their entry cost as "1 Raid Pass or 200 Link Charge (in-person) / 1 Remote Raid Pass + 200 Link Charge (remote)" — Link Charge is the confirmed, official Super Mega Raid currency, so this ties the MEGA_ENHANCED identifiers directly to Super Mega Raids, not just by name-guessing |
| `RAID_LEVEL_5_MEGA_ENHANCED` | **Super Mega Raid**, legendary-base-mega variant (Bulbapedia's "Super Legendary Mega Raid" row — same stats as above) | same evidence as above; the 4/5 split plausibly tracks whether the underlying mega's ordinary (non-enhanced) tier is 4 (`RAID_LEVEL_MEGA`, e.g. Skarmory/Raichu/Victreebel/Malamar/Falinks/Dragonite — all non-legendary) or 5 (`RAID_LEVEL_MEGA_5`, e.g. Mewtwo — legendary). This is a coherent, evidence-consistent pattern, not proven letter-for-letter |
| `RAID_LEVEL_COORDINATED_1` | **Unity Raid** (launched officially under this name at GO Fest 2026 Global; leaked earlier under the name "Coordinated Raids" — see Centro Leaks/Beebom) | [community-consensus] — the Unity Raid datamine itself (pokemongohub.net, "Dataminers Discover New Texts For a New Raid Type: Unity Raids") lists internal resource strings using the SAME `coordinated_` prefix (`coordinated_attack_countdown`, `coordinated_attack_raise_prompt`, `coordinated_encounter_catch_countdown`, etc.) — i.e. "Coordinated" is demonstrably the internal/leak-era name for what shipped as "Unity Raid," not a coincidental name collision |
| `RAID_LEVEL_COORDINATED_2` | **Unity Raid**, a second internal level/difficulty (exact distinction from `_1` not found — possibly a future/harder Unity Raid boss tier, unreleased as of this dump) | [community-consensus for "Unity Raid family"; speculative for what specifically differs between _1 and _2] |

## Q2 — remote/friend-invite exclusion, corroborated per-tier (NOT uniform across "in-person" tiers)

- **Elite Raid (`RAID_LEVEL_EXTENDED_EGG`): confirmed match.** Elite Raids are famously,
  unambiguously in-person-only (no Remote Raid Pass) — this is the single best-known Elite Raid
  rule and it exactly matches the identifier's presence in both unsupported lists. [confirmed]
- **Unity Raid (`RAID_LEVEL_COORDINATED_1/_2`): matches.** Unity Raids debuted specifically as
  in-person GO Fest 2026 Global events with mass-scale physical-device-gesture mechanics (see
  [[fact_unity_raid_distinct_system]]) — structurally incompatible with remote participation
  anyway, consistent with the exclusion. [community-consensus, corroborated by existing memory]
- **Super Mega Raid (`RAID_LEVEL_4_MEGA_ENHANCED`/`_5_MEGA_ENHANCED`): does NOT match — genuinely
  new finding.** These two identifiers are notably ABSENT from the user's supplied
  `unsupportedRemoteRaidLevels` list. This lines up with the Pokemod Group datamine tweet's own
  explicit remote-cost line ("Remote: 1 Remote Raid Pass + 200 Link Charge") — i.e. **Super Mega
  Raids DO support Remote Raid Passes**, unlike Elite and Unity Raids. This directly answers "does
  the same in-person-only rule hold for Super Mega raids" with a sourced **no** — worth correcting
  if any prior assumption in this project's notes implied Super Mega Raids are local-only (the
  "at least seven other Trainers" minimum-lobby language in [[fact_super_mega_raid_shield_enrage_mechanic]]
  never actually claimed local-only, so no correction needed there — just flagging this as the
  first source that resolves the remote question either way).
- **`RAID_LEVEL_4` (legacy tier 4): plausible but unconfirmed.** No direct source found stating
  whether legacy tier-4 raids ever supported remote passes; Remote Raid Passes launched in 2020
  around the same window tier 4 was merged away, so this is very possibly moot/dead code rather
  than an active rule. [speculative]

## Q3 — RAID_LEVEL_4 status: legacy identifier, not a live tier

Confirmed via pokemongohub.net ("Pokémon GO removes Tier 2 and Tier 4 raids") that tier 4 raids
were merged into tier 3 in August 2020 and have not existed as a separate player-facing tier
since. `RAID_LEVEL_4` surviving in the current (2026) GAME_MASTER dump is dead/legacy client
plumbing — consistent with games generally not pruning old enum values that historical save data
or client version-skew might still reference. **Grep-confirmed this session**: zero rows in
`data/normalized/raidHistory.json` carry any tier string containing "4" as a standalone legacy
label (checked via regex) — so there is no current historical-data mapping ambiguity to resolve;
this project's raidHistory has never recorded a raw "Tier 4"/"Level 4" tier value that needs
bucketing. [community-consensus + direct repo grep]

## Q4 — gaps/mismatches in the engine's RaidTier union (identify only, no fix proposed)

Read directly, `packages/engine/src/types.ts` lines 45-52 — the full current union is exactly:
`"1-Star Raids" | "3-Star Raids" | "Mega Raids" | "5-Star Raids" | "Legendary Mega Raids" |
"Super Mega Raids" | "Primal Raids"` (7 members, matches `RAID_TIER_TABLE` in `raidBoss.ts`
exactly — no silent divergence between the type and the table).

1. **Elite Raid is still missing** — already known (see [[fact_elite_raid_tier_gap]]), now
   additionally confirmed to correspond to `RAID_LEVEL_EXTENDED_EGG` specifically, and now has a
   fully sourced battle timer (see Q5 below) alongside the already-sourced HP/multiplier.
2. **No separate Shadow Raid tier — and none is needed.** Shadow raids reuse their base tier's
   HP/multiplier (per [[fact_shadow_raid_enrage_state]]); `isShadow` is correctly a flag, not a
   `RaidTier` member. Confirmed no gap here, not identifying one.
3. **No separate Ultra Beast tier — and none is needed**, for the same reason: shares "5-Star
   Raids" stats per this session's research.
4. **"Super Mega Raids" is a single engine row covering what Bulbapedia's own difficulty table
   lists as TWO distinctly-named rows** ("Super Mega Raid" and "Super Legendary Mega Raid",
   sharing an identical `rowspan="8"` HP/multiplier cell pair per [[fact_raid_boss_tier_stats_resolved]])
   — and this session's `RAID_LEVEL_4_MEGA_ENHANCED`/`RAID_LEVEL_5_MEGA_ENHANCED` split maps onto
   exactly that same two-way division. This is a **naming-completeness gap, not a numeric one** —
   both real-world rows carry identical stats (25000 HP/0.79), so the engine's single merged row
   produces correct numbers for both; it just can't currently distinguish "which named variant"
   a given Super Mega Raid boss is. Flagging only, per instruction not to propose a fix.
5. **Unity Raid (`RAID_LEVEL_COORDINATED_1/_2`) has no `RaidTier` member and should not get one**
   — this is the existing, deliberate exclusion in [[fact_unity_raid_distinct_system]] (structurally
   distinct battle system: auto-revive, crowd-charged Unity Attack, thousands-of-trainer no-flee
   lobby), reconfirmed this session, not a gap to close.

## Q5 — Elite Raid battle timer: CLOSED OUT, now sourced (previously unresolved across 2 prior passes)

**300 seconds**, same as an ordinary 5-Star/Legendary raid. Source: Bulbapedia's raw wikitext
(`action=raw` on `Raid_Battle_(GO)`) Difficulty table has a "Time limit(s)" column, and Elite Raid
sits in the SAME `rowspan="8"` group as the already-verified 0.79 attack/defense-multiplier
plateau — that entire 8-row group (Community Day/Mega Raid, 5-Star/Legendary, Elite, Primal,
Legendary Mega, Super Mega, Super Legendary Mega) shares one `rowspan="8" | 300` cell. [community-
consensus, Bulbapedia raw wikitext — same-quality source as the already-trusted HP/multiplier
numbers in [[fact_raid_boss_tier_stats_resolved]], fetched fresh this session]. **This closes the
Elite Raid timer question permanently** — it was NOT a hard-to-find number, just conflated twice
before with the 30/45-minute GYM AVAILABILITY window (how long the egg/boss sits at the gym before
expiring), which is a completely different figure from the IN-BATTLE fight clock. Do not re-open
without a literal contradicting primary source.

## Sources
- User-supplied raw GAME_MASTER excerpt (`RAID_CLIENT_SETTINGS`, full `RAID_LEVEL_*` identifier
  list), PokeMiners mirror, fetched by the user directly 2026-09-09 — the evidence this whole
  entry is built from.
- pokemongohub.net, "Shadow Raids discovered in Pokémon GO 0.265 update datamine" — corroborates
  Shadow Raid as a real datamined format with per-tier variants.
- pokemongohub.net, "Dataminers Discover New Texts For a New Raid Type: Unity Raids" — the
  `coordinated_*` resource-string naming link between Unity Raids and "Coordinated Raids."
- beebom.com, "Pokemon GO Leak Reveals Coordinated Raids Feature Coming Soon" — the original leak
  name and its own claim that this format is harder than Elite Raids.
- X/Twitter, Pokemod Group (@thepokemodgroup) datamine post naming "Mega Enhanced Raid Level 4 and
  Level 5" with entry-cost figures matching Super Mega Raid's known Link Charge currency.
- gonintendo.com / leekduck.com / pokemongohub.net, Super Mega Raid + Link Charge coverage —
  corroborates Link Charge as Super Mega Raid's real currency.
- WebSearch aggregate on Ultra Beast raid tier classification ("Ultra Beasts appear as Tier-5 Raid
  bosses").
- pokemongohub.net, "Pokémon GO removes Tier 2 and Tier 4 raids" — dates the Aug 2020 tier-4
  merge, corroborating existing memory.
- bulbapedia.bulbagarden.net, raw wikitext of "Raid Battle (GO)"'s Difficulty table, re-fetched
  2026-09-09 targeted at the "Time limit(s)" column specifically — source of the 300s Elite Raid
  timer close-out.
- Direct repo reads: `packages/engine/src/types.ts` (RaidTier union), `packages/engine/src/raidBoss.ts`
  (RAID_TIER_TABLE), `data/normalized/raidHistory.json` (grepped for legacy tier-4 labels, none found).
