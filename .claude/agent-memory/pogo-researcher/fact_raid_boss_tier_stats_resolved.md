---
name: fact-raid-boss-tier-stats-resolved
description: Resolved, precisely-cited raid boss HP pool + Attack/Defense multiplier per tier, and the real formula split (CP-display formula vs battle-stat formula) that explains the earlier apparent contradiction between two AI-paraphrased fetches
metadata:
  type: project
---

Resolved 2026-09-05, superseding the "internally inconsistent across two fetches" flag in
[[proposal-species-reverse-lookup]]. Obtained via raw wikitext fetch (`action=raw` on the
Bulbapedia URL), which returns literal source text rather than a rendered-page AI summary — much
higher confidence than the earlier two paraphrased fetches.

## The two earlier fetches were not actually contradicting each other — they were reading two
## different formulas on the same page

Bulbapedia's "Raid Battle (GO)" article states plainly, verbatim from raw wikitext: **"A Raid
Boss's CP, as displayed during the raid, is determined using the standard CP formula. Note that
the Attack and Defense multipliers are not factored into this calculation."** — followed by
`CP = floor( sqrt(HP) * Attack * sqrt(Defense) / 10 )`, where `Attack = base Attack + 15`,
`Defense = base Defense + 15`, and `HP` is described only as "a fixed Boss HP value based on the
raid level" (a separate, much smaller number used ONLY for the displayed CP, distinct from the
boss's real battle HP pool below).

- The fetch that reported "all raid boss CP multipliers are 1" and HP 600/1800/3000/7500/12500
  (traced this session to pokemongohub.net's "How does Raid Boss CP work?" article, confirmed by
  direct fetch) was describing **this CP-display formula only** — correct in its own narrow
  context (the multiplier genuinely isn't used in the CP-display math), but NOT the boss's real
  battle Attack/Defense/HP.
- The fetch that reported HP 600/3600/9000/15000/22500 and multipliers 0.5974/0.73/0.79 was
  reading the article's separate **Difficulty table**, which describes the boss's actual
  in-battle stats. This is the one that matters for combat math.

## Real battle HP pool + Attack/Defense multiplier per tier (Bulbapedia raw wikitext, verbatim
## table, fetched 2026-09-05 via `action=raw` — highest-confidence fetch this session)

| Tier (icon count / label) | Real battle HP (fixed, NOT derived from species baseStamina) | Attack/Defense multiplier |
|---|---|---|
| 1 icon / "One-star Raid" / live-feed label `"1-Star Raids"` | 600 | 0.5974 |
| 3 icons / "Three-star Raid" / live-feed label `"3-Star Raids"` | 3600 | 0.73 |
| 4 icons / "Mega Raid" (historically "Community Day Raid") / live-feed label `"Mega Raids"` | 9000 | 0.79 |
| 5 icons / "Legendary"/"Five-star Raid" / live-feed label `"5-Star Raids"` | 15000 | 0.79 |
| 5 icons + mega egg / "Legendary Mega Raid" (six-star) | 22500 | 0.79 |
| 7 icons / "Super Mega Raid" / live-feed label `"Super Mega Raids"` | 25000 | 0.79 (shared plateau value, quoted separately as a rowspan in the same table) |
| 7 icons / "Super Legendary Mega Raid" | 25000 (shares the same rowspan cell as Super Mega Raid) | 0.79 |
| "Primal Raid" | 22500 — verbatim: "Primal Raids feature Primal Groudon or Primal Kyogre. Despite having the same HP as six-star Mega Raid Bosses, they are classified as five-star raids." (i.e. same HP as the Legendary Mega row above) | 0.79 (by the same plateau pattern; not separately re-quoted for Primal specifically) |

Tag: **[community-consensus]** — Bulbapedia is a community wiki, not an official Niantic source;
no official Niantic blog/patch-note stating these exact numbers was found. But this is now a
literal verbatim quote of the page's own wikitext table (not an AI paraphrase of a paraphrase),
and it's the third independent fetch across sessions to land on the same 600/3600/9000/15000/22500
HP progression (this session's raw-wikitext fetch, this session's rendered-page fetch, and the
earlier fetch recorded in [[proposal-raid-clear-timer-hp]]) — treat this table as settled unless a
future fetch produces yet another literal-quoted contradiction.

Every tier from "Mega Raid" (4 icons) upward shares the same 0.79 multiplier plateau — only Tier 1
(0.5974) and Tier 3 (0.73) differ from it. The current live raid feed (`data/normalized/activeRaids.json`)
only uses 5 tier label strings today (`"1-Star Raids"`, `"3-Star Raids"`, `"Mega Raids"`,
`"5-Star Raids"`, `"Super Mega Raids"`) — all 5 map cleanly onto rows in the table above with no
gaps, confirmed by direct grep of the file this session.

## Is the raid boss CPM applied like a normal wild Pokémon's level CPM?

**Yes, for Attack/Defense — [community-consensus, corroborated but not from one single verbatim
primary source].** General web-search corroboration (pokemongohub.net's CP-rework article +
general community summaries, not independently re-quoted verbatim this session) states raid
bosses always carry perfect Attack/Defense IVs of 15, and the real battle-effective stat is
`floor((baseStat + 15) * tierMultiplier)` — i.e. the exact same `effectiveStat(baseStat, iv, cpm)`
function already implemented in `packages/engine/src/stats.ts` (`Math.floor((baseStat + iv) * cpm)`),
just called with `iv = 15` and `cpm = tierMultiplier` instead of the current `iv = 0, cpm = 1.0`.
No new formula needs inventing — this is a parameter change to an existing, already-tested
function.

**No — for HP/stamina, this is the critical asymmetry.** The boss's real battle HP is a **flat,
fixed pool set directly per tier** (the table above), completely decoupled from the species' own
`baseStamina` stat — Bulbapedia's own text calls it "a fixed Boss HP value based on the raid
level," not a function of the species at all. Applying `effectiveStat(baseStamina, 15, cpm)` to a
real species' own stamina stat would NOT reproduce these numbers and must not be the fix path for
HP — it needs a separate tier-keyed lookup table, not a CPM multiply.

## Cross-check against this project's 4 hand-authored hypothetical fixtures — confirms they must
## NOT be touched by a blanket formula change

Read directly, `packages/engine/src/fixtures/scenarioA.ts`: `PRIMAL_KYOGRE` (`baseAttack: 250,
baseDefense: 200, baseStamina: 15000`) and `MEGA_SKARMORY` (`baseAttack: 250, baseDefense: 250,
baseStamina: 12000`) both carry code comments stating explicitly these fields are "already its
effective stats" / boss-effective-by-construction, hand-tuned to reproduce a specific pinned test
derivation (Scenario A's exact 10.0s-survival numbers), not meant to mirror real Bulbapedia
figures. Confirmed they don't: real Mega Skarmory (a real "Mega Raids"-tier boss) should be HP
9000 per the table above, not the fixture's 12000; real Primal Kyogre should be HP 22500, not the
fixture's 15000. **This confirms the fix path must branch**: real synced species get real
tier-keyed CPM (attack/defense) + fixed HP lookup (stamina) applied fresh from their own base
stats; the 4 hand-tuned hypothetical fixtures keep today's `RAID_BOSS_CPM = 1.0` / `iv = 0`
pass-through exactly as-is, since their base-stat fields are already final numbers by design and
re-deriving them would silently break the pinned Scenario A/B tests. Note: only `MEGA_RAICHU_X`/
`MEGA_RAICHU_Y` currently carry an explicit `isHypothetical: true` flag in this file —
`PRIMAL_KYOGRE`/`MEGA_SKARMORY` (used only in the boss role) do not, so whichever mechanism
distinguishes "already-final boss fixture" from "real species needing the real formula" needs a
data-model decision that doesn't fully exist yet — naming this as a real, unresolved fork point
for `engine-developer`, not resolving it myself.

## Sources
- Bulbapedia, "Raid Battle (GO)" raw wikitext —
  https://bulbapedia.bulbagarden.net/w/index.php?title=Raid_Battle_(GO)&action=raw (fetched
  2026-09-05, multiple targeted extractions): literal Difficulty-table HP/multiplier values, the
  CP-display formula and its "Attack/Defense multipliers not factored in" caveat, the Primal Raid
  HP-equivalence sentence, and the Super Mega/Super Legendary Mega Raid 25000 HP row.
- pokemongohub.net, "How does Raid Boss CP work?" (fetched 2026-09-05): source of the
  600/1800/3000/7500/12500 "stamina" figures and "all raid boss CP multipliers are 1" claim —
  now identified as describing the CP-DISPLAY formula specifically, not battle stats. Both figures
  and claim are accurate in that narrow context, not a bad source.
- WebSearch summaries (not independently re-quoted verbatim), 2026-09-05: general corroboration
  that raid bosses carry perfect Attack/Defense IV 15 and that `(base+IV)*CPM` is the applicable
  battle-stat formula — community-consensus, lower confidence than the Bulbapedia raw-wikitext
  quotes above since these were AI-summarized search results, not a single primary verbatim source.
- Direct reads (not web sources): `packages/engine/src/raidBoss.ts`, `stats.ts`,
  `fixtures/scenarioA.ts`, `data/normalized/activeRaids.json` — grounded the fixture cross-check
  and live tier-label feasibility claims in actual current code/data.
