---
name: fact-elite-raid-tier-gap
description: Elite Raids are a real, distinct raid tier (20000 HP, 0.79 atk/def mult — NOT 1.00, that figure is debunked), still real/live in 2026, structurally excluded from this project's data today by a deliberate prior decision, not by accident
metadata:
  type: project
---

**SUPERSEDES this file's own 2026-09-08 (earlier same-day) version, which cited a ~1.00
attack/defense multiplier as community-consensus. That number did not hold up under a second,
deeper pass the same day — see "The 1.00 claim, re-examined" below. Treat 1.00 as debunked, not
merely unconfirmed.**

## Corrected numbers (researched 2026-09-08, second pass, for the multi-raid Power-Up Optimizer /
## `PLAN_multi_raid_roster_optimizer.md` decision)

- **Boss HP: 20,000.** [Bulbapedia raw wikitext, `action=raw` on `Raid_Battle_(GO)`, fetched
  directly this session with a literal-quote instruction — returned genuine wiki markup
  (`[[File:GO Elite Raid Egg.png|60px]]`, `rowspan="8"`, an inline HTML editor comment), strong
  evidence of a real literal quote, not a paraphrase]. Independently corroborated same-day by
  `scripts/sync-data.ts`'s own code comment (a DIFFERENT session, written before this research
  pass): "`RAID_LEVEL_ELITE_LEGACY` (Bulbapedia's Elite Raid difficulty table: 20000 HP)" — i.e.
  this project's own data-sync work already independently landed on the same figure from the same
  page. Also corroborated, lower-quality, by Sportskeeda's Hoopa Unbound Elite Raid article citing
  20,000 HP for a real named boss. **High confidence.**
- **Attack/Defense multiplier: 0.79, NOT ~1.00.** Same Bulbapedia raw-wikitext fetch: Elite Raid
  shares an explicit `rowspan="8" | 0.79` cell with Community Day Raid, Mega Raid, 5-Star/Legendary,
  Primal, Legendary Mega, and Super Mega/Super Legendary Mega — i.e. it sits on the exact same
  0.79 plateau this project's `RAID_TIER_TABLE` already trusts for 5 of its 6 existing rows (see
  [[fact-raid-boss-tier-stats-resolved]]). This is a SINGLE primary source (Bulbapedia), not two
  independent ones — falls short of the "two independent sources agree" bar for a fully confident
  build, but it is the only source this session that produced an actual traceable number, and it
  fits cleanly into an already-validated pattern rather than being an isolated outlier.

## The 1.00 claim, re-examined — now believe it is unconfirmable, possibly fabricated by
## AI-search-synthesis, not a real published figure

Re-checked all three originally-cited sources this session:
- **Deltia's Gaming** ("What Are Elite Raids in Pokemon GO"): re-searched directly — only says
  Elite Raid bosses have "higher attack and defense stats," gives NO specific multiplier number.
  Does not actually support "1.00" at all.
- **Fandom** ("Elite Raid Battle"): HTTP 402 on direct fetch this session (and historically,
  see [[proposal-historical-raid-bosses]]'s "Fandom wiki unverified" note) — cannot verify what it
  actually says.
- **TheGamer**: not re-fetched this session; unverified.
- A WebSearch AI-synthesis this session asserted "Elite Raid Bosses have an additional hidden
  Attack and Defense multiplier of 1.00" — the word "hidden" is itself a red flag (suggests
  back-derived/inferred, not a stated published number) and this exact search also garbled T1-T5
  multipliers as 0.61/0.67/0.73/0.79/0.79, inconsistent with the already-corroborated
  0.5974/0.73/0.79 progression — i.e. this search result mixed up multiple different "CPM"
  concepts. Best guess (labeled speculation, not confirmed): whoever originated "1.00" likely
  reverse-engineered it from a boss's displayed CP without knowing Bulbapedia's own explicit caveat
  that the CP-DISPLAY formula does NOT use the tier attack/defense multiplier at all (see
  [[fact-raid-boss-tier-stats-resolved]]) — the exact conflation error already caught once in this
  project's research history, likely recurring here in a different guise.

**Conclusion: 1.00 should be treated as debunked, not merely "unconfirmed."** 0.79 is the only
number with an actual traceable citation.

## Elite Raids are still real, ongoing content in 2026 — not discontinued

Bulbapedia's current-tense description ("Elite Raids... only appear during certain events," GO
Elite Raid Egg, up to 24h hatch, 30/45-min window, in-person only, no Remote Raid Pass) plus this
project's OWN 2026-09-08 data-sync session finding 4 raw `RAID_LEVEL_ELITE_LEGACY` entries in
Pokebattler's live feed confirms the tier is not a dead format. Could not pin an exact current
(Sept 2026) schedule or the identity of those 4 species — WebFetch on
`fight.pokebattler.com/raids` this session did not surface an `RAID_LEVEL_ELITE_LEGACY` key
(likely a payload-size/truncation limit of the fetch tool, not evidence the tier is gone — the
sync script's own code demonstrably parses it). Historical example bosses found via search:
Hoopa Unbound (Oct/Nov 2022), Regidrago (Mar 2023), Regieleki (Apr 2023), Enamorus, Mega Rayquaza
— none currently in `data/normalized/activeRaids.json` or `raidHistory.json`.

## Why this is genuinely moot for TODAY's boss pool, but only because of a prior deliberate choice

Grep-confirmed 2026-09-08: zero rows in `data/normalized/raidHistory.json` (764 rows) or
`activeRaids.json` (19 rows) mention "Elite" in any form. This is NOT because Elite Raids are
structurally invisible to the pipeline — `scripts/sync-data.ts` (~line 2560) shows Pokebattler's
feed DOES carry `RAID_LEVEL_ELITE_LEGACY` (4 raw entries, confirmed 2026-09-07 per an adjacent code
comment), and the pipeline deliberately excludes it via `POKEBATTLER_LEGACY_EXCLUDED_TIERS`
because no Elite-Raid `RaidTier` member exists yet ("never fabricate a tier" rule, same file). So
today's answer to "can an Elite Raid boss reach this tool's sweep" is genuinely **no** — but
that's a standing, already-recorded policy decision, not an inherent impossibility. If
`engine-developer` ever adds the `RaidTier` member, those 4 archive rows (species unknown to me)
plus any future live Elite Raid boss become reachable, and the sourced numbers above (HP 20000,
multiplier 0.79) are what should be used — NOT the debunked 1.00.

## Recommendation handed back 2026-09-08 (second pass, for the multi-raid optimizer PLAN)

Practical/for-today: **(c)-shaped** — nothing needs to change for a correct sweep right now, since
Elite Raid bosses are already filtered out upstream by an existing, intentional exclusion. Note
this explicitly as "excluded by policy today," not "cannot occur," so a future session doesn't
mistake the silence in `raidHistory.json` for proof the content doesn't exist.
For-the-record (if the `RaidTier` gap is ever closed): closest to **(a)**, but with an honest
caveat — HP=20000 clears a real two-independent-source bar; the 0.79 multiplier rests on one
strong primary source (Bulbapedia raw wikitext, internally consistent with 5 already-trusted
neighboring rows) rather than two independent ones, so it's short of the strictest bar even though
it's now the best-supported number available and the previously-cited alternative (1.00) does not
hold up.
