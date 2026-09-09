---
name: fact-shadow-raid-enrage-state
description: Shadow raid enrage RESOLVED at 60% HP (not 67%), full mechanic quantified and Purified Gem countermeasure sourced; also resolves boss HP/stat-tier reuse and shadow-multiplier-on-boss questions; casts doubt on the separately-recorded 15%-HP "bug"
metadata:
  type: project
---

Researched 2026-09-08, RESOLVED and substantially extended 2026-09-09 (round 4) via Bulbapedia's
raw wikitext for `Shadow_Raid`, fetched twice independently (rendered page + `action=raw`) and
converging verbatim on the same numbers both times.

## 1. Enrage threshold: 60% HP, not ~67% — resolved

**60% remaining HP** is the correct, better-evidenced number. [community-consensus, Bulbapedia
`Shadow_Raid` raw wikitext, fetched 2026-09-09, quoted verbatim both fetches: "A Shadow Raid Boss
becomes enraged once its remaining HP falls to 60%, drastically increasing their base stats."]

The competing "~1/3 of HP lost" framing (which would put the threshold at ~67% remaining, not 60%)
traces to a Pokémon GO Hub comprehensive-guide summary that garbles its own numbers — the same
WebSearch pass that surfaced it also returned "This happens at around 60% HP" in the very next
sentence, i.e. it's an internally-inconsistent paraphrase of the same 60% fact, not a genuinely
competing number from a different primary source. Treat "loses a third of its HP" as informal,
imprecise phrasing for the 60%-remaining threshold, not a second data point.

## 2. Enrage stat formula — now precisely sourced, corroborating the earlier approximate figures

From the same raw-wikitext fetch, verbatim:
- `enragedAttack = (1.81 × baseAttack) + 15`
- `enragedDefense = (3 × baseDefense) + 15`

This is a near-exact match to the earlier (2026-09-08) community figures "attack ~1.81x base +15
flat, defense ~3x base +15 flat" sourced then only to switchbladegaming.com — now corroborated by
a second, independent source family (Bulbapedia) landing on the identical numbers. Upgrade
confidence from "approximate, one source" to "[community-consensus], two independently-sourced
converging figures."

**Duration**: enrage persists from 60% HP down to 15% HP (or until enough Purified Gems are used),
at which point the boss becomes "subdued" and **reverts to its normal (non-enraged) stats** — not
below-normal. See item 5 below; this "auto-subdue at 15%" is the documented, intended end of the
enrage window, and is a different thing from MECHANICS.md's separately-recorded "defense collapse"
bug entry.

The boss also "slowly regenerates HP over time" while enraged [WebSearch aggregate, several
guide sites, 2026-09-09; not independently verified against Bulbapedia's raw text this pass —
treat as community-consensus, second-order detail].

## 3. Purified Gems — full mechanic, sourced

[community-consensus, Bulbapedia raw wikitext + corroborating WebSearch aggregate, 2026-09-09]

- **8 Purified Gems, across all players in the lobby, fully subdue** an enraged boss (reverts it
  to normal stats immediately, same end-state as the natural 15%-HP auto-subdue).
- **Each individual player may bring/use up to 5 Purified Gems per raid** — so a solo player can
  never single-handedly subdue a boss (5 < 8); it takes at least 2 players cooperating.
  Consumable-item cap: a trainer can hold up to 10 in inventory, but only 5 count toward a given
  raid's usage cap.
  This is a real, hard structural fact for a hypothetical Shadow Raid feature in this tool: a
  Shadow Raid is NOT meaningfully soloable in the same sense a normal raid can be — the Purified
  Gem sub-mechanic requires multi-trainer cooperation independent of DPS, similar in flavor to the
  already-flagged Super Mega Raid shield/enrage multi-trainer mechanic.
- **5-second cooldown between each gem use** (any player) — WebSearch's "25 seconds to use all 5"
  is consistent arithmetic (5 gems × 5s cooldown = 25s) for one player alone using their full
  allotment, corroborating rather than conflicting.
- Mechanically, each gem is a step toward the 8-gem group threshold, not an instant/partial stat
  reduction on its own and not a boss-timer extension — no source found describing a "time bonus"
  effect. It's a counter toward a binary subdue-or-not state, not a continuous dial.
- **Verdict on modelling**: this sits mostly above the combat-math layer (a discrete state flip:
  enraged stats vs. normal stats, reached either by HP threshold or by gem-count threshold) rather
  than something a per-hit damage formula needs new terms for. If ever modelled, it would look
  like a scripted stat-swap mid-simulation (structurally the same kind of state-machine work
  flagged as needed for the enrage threshold itself below), gated by a group-cooperation input this
  engine has no comparable precedent for (its multi-trainer inputs today are all mega-boost-uptime
  style, not item-throwing mechanics).

## 4. Shadow raid boss HP/stat TIER — confirmed no separate table needed (closes item open since 2026-09-08)

**Confirmed directly**, not just inferred from the RAID_LEVEL_*_SHADOW identifier naming pattern
(see `fact_raid_level_identifier_mapping.md`): Bulbapedia's raw wikitext states verbatim, "Shadow
Raids use the same difficulty ratings and stats as standard Raid Battles." [community-consensus,
Bulbapedia raw wikitext, 2026-09-09]. This engine's `RaidTier` union correctly has no shadow rows
— a shadow boss reuses its base tier's `RAID_TIER_TABLE` entry (HP + attackDefenseMultiplier)
before the shadow multiplier and (separately) the enrage state modify its effective attack/defense.
Confirmed correct, not a gap.

## 5. Does a shadow raid BOSS get the 1.2x attack / 0.8333x defense shadow multiplier? YES — confirmed, and the engine already does this correctly

**Confirmed directly**: Bulbapedia's raw wikitext states verbatim, "Shadow Raid Bosses deal and
receive 20% increased damage, like other Shadow Pokémon." [community-consensus, Bulbapedia raw
wikitext, 2026-09-09]. "Deal 20% more" = Attack ×1.2 (linear in the damage formula). "Receive 20%
more" is exactly consistent with Defense ×(5/6): since damage scales as attack/defense, dividing
defense by 5/6 multiplies incoming damage by 6/5 = 1.2 exactly — the same fraction this engine
already uses (`SHADOW_DEFENSE_MULTIPLIER = 5/6` in `shadow.ts`), not the flatter 0.83 decimal some
other sources use.

**Engine status, checked directly this pass (`packages/engine/src/comparison.ts` lines 38-73,
`raidBoss.ts`)**: `bossEffectiveStats()` already calls `shadowAdjustedBaseStats(boss)` on the raw
base stats BEFORE applying the tier's `REAL_RAID_BOSS_IV`/`attackDefenseMultiplier` — i.e. a boss
species flagged `isShadow` already gets the 1.2x/5-6ths treatment in this engine today. **This is
a positive validation finding, not a bug**: the engine's existing behavior for shadow raid bosses
matches the real game's documented mechanic. (Separately unmodelled: the enrage state on top of
this, item 1 above — enrage is a mid-fight state change this engine's single-constant-stat-pair
model can't represent without new state-machine work in `simulate.ts`, same conclusion as the
2026-09-08 pass.)

## 6. The 15%-HP "defense collapse bug" (MECHANICS.md's "Known bugs in the real game") — casts real doubt on it being a bug at all

MECHANICS.md currently records: "Shadow raid bosses (T3/T5) lose almost all defense at 15% HP...
its defense drops to a very small non-zero value — weak moves like Lock-On then carve out huge
chunks. Suspected bug as of late September 2024." No inline citation is attached to that specific
bullet (the section's blanket citation, the Silph Road r/TheSilphRoad post `1fckfja`, covers the
whole "Raid boss behaviour" section's other claims — cadence/energy mechanics — and I could not
independently verify it also covers this specific bullet; Reddit itself is unfetchable in this
environment, `WebFetch` on reddit.com fails outright).

**What I found instead, corroborated across four independent sources this pass** (Bulbapedia raw
wikitext, Pokémon GO Hub, Dexerto, Switchblade Gaming, all 2026-09-09 WebSearch/WebFetch): at 15%
HP, an enraged boss becomes "subdued" and its Attack/Defense **revert to their normal
(non-enraged) values** — i.e. back to the ordinary tier's `RAID_TIER_TABLE` multiplier, not below
it. Nothing in any of these four sources describes defense dropping BELOW its normal tier value at
15% HP. Going from `(3×baseDefense)+15` back down to the tier-normal defense is still a large
*relative* swing (defense divided by roughly 3x), which is exactly the kind of thing that would
read as "defense suddenly collapsed" to a player mid-fight who had adjusted their expectations to
the enraged tankiness — a very plausible, if unconfirmed, origin story for how an *intended,
documented* mechanic (auto-subdue-at-15%) got recorded as a "suspected bug" in this project's own
notes.

**I cannot fully confirm or refute this** — I don't have access to whatever originally seeded the
MECHANICS.md bullet (likely a pre-2026-09 research pass whose source trail wasn't preserved
verbatim), and it's possible the original report genuinely described defense going below the
normal floor (not just reverting to it), which none of today's four sources corroborate one way or
the other since none discuss going below-normal. What I can say confidently: **no source found in
this pass, including a fresh raw-wikitext Bulbapedia fetch specifically aimed at this question,
describes a below-normal-defense state at 15% HP** — only the documented at-or-above-normal
enraged/subdued binary. This is a live, unresolved discrepancy between MECHANICS.md's existing
entry and what's independently findable today; recommend the entry either gets a citation
re-verification pass or gets softened/merged with the now-well-sourced "auto-subdue at 15%"
mechanic rather than standing as a separate "suspected bug." I am not editing MECHANICS.md myself
(out of role) — routing this back to the overseer.

## Engine status summary (all six items)

- Enrage state itself (60% trigger, 1.81x/+15 attack, 3x/+15 defense, 15%-HP-or-8-gems end):
  **not modelled** — genuinely needs simulate.ts state-machine work (a boss whose effective
  attack/defense change mid-fight based on HP threshold), not a data fix. Unchanged conclusion
  from 2026-09-08, now on much firmer sourcing.
- Shadow raid boss HP/tier reuse: **confirmed correct as-is**, no engine change needed.
- Shadow multiplier applied to a shadow BOSS species: **already implemented correctly**
  (`bossEffectiveStats` → `shadowAdjustedBaseStats`), newly validated against a primary-adjacent
  source this pass.
- Purified Gems: **not modelled**, and probably shouldn't be as a per-hit damage mechanic — it's a
  discrete multi-trainer state flip with a cooperation-gated threshold, closer in shape to the
  already-out-of-scope Teambuilding-Analyzer territory than to this tool's per-candidate combat
  math. Flagging, not proposing.
- 15%-HP "bug": **doubt cast on its status as a bug**, not resolved outright. MECHANICS.md's entry
  may be describing the same, intended auto-subdue mechanic now well-documented elsewhere.

## Sources
- bulbapedia.bulbagarden.net, `Shadow_Raid` article, both rendered (`WebFetch`) and raw wikitext
  (`action=raw`, `WebFetch`), fetched independently 2026-09-09, converging verbatim — the primary
  source for items 1, 2, 3, 4 above.
- WebSearch aggregate (multiple guide sites: Pokémon GO Hub, Dexerto, Switchblade Gaming,
  pkmbuy.com), 2026-09-09 — corroborating detail (HP regen during enrage, 15%-auto-subdue
  wording) and the source of the internally-inconsistent "~1/3 lost" framing addressed in item 1.
- Prior pass: switchbladegaming.com "Shadow Raid Guide" (2026-09-08) — original approximate
  enrage-multiplier figures, now corroborated rather than superseded.
- `packages/engine/src/comparison.ts`, `raidBoss.ts`, `shadow.ts` — direct code read, 2026-09-09,
  confirming current engine behavior for item 5.
- Reddit r/TheSilphRoad post `1fckfja` — NOT independently re-verified this pass (WebFetch fails
  outright on reddit.com in this environment); flagged as a citation gap for MECHANICS.md's 15%-bug
  entry specifically, not for the broader "Raid boss behaviour" section it's attached to.
