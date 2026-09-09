---
name: fact-external-output-validation-targets
description: Whether an independent third-party simulator's published DPS/TDO numbers could validate this engine's END-TO-END output (not just input constants) — surveys Pokebattler, GamePress/GoBattleSim, and doctorpokegogo.com
metadata:
  type: project
---

Researched 2026-09-09. Every MECHANICS.md entry checks one INPUT constant against a source; none
check the engine's OUTPUT (a computed DPS/TDO for a matchup) against an independent computation of
the same matchup. This pass looked for a source that could serve that role, building on
[[proposal_third_raid_source]] (roster-source independence, same "shared upstream" trap, different
axis) and [[fact_boss_cadence_hybrid_model_sourcing]] (GoBattleSim already assessed for boss-AI
mechanics, not for output numbers).

## Pokebattler — numeric output is login-gated, not publicly fetchable

`fight.pokebattler.com/raids` (documented, public, confirmed working in
[[proposal_third_raid_source]]) is a **roster listing** endpoint only. The actual counter/estimator
computation lives behind `pokebattler.com/raids/{BOSS}` (e.g. `.../REGICE`), fetched 2026-09-09:
the page server-renders the boss's own stats (Regice: Level 50, CP 42768, Attack 153, Defense 255,
HP 15000 — HP matches this project's own tier-5 `RAID_TIER_TABLE` value, a free bonus corroboration
of already-resolved [[fact_raid_boss_tier_stats_resolved]]) but explicitly states **"The best
Pokemon Go Regice counters are ???, ???, ???, ???, ??? & ???. Login to see your custom results!"**
— the ranked DPS/TDO/deaths/estimator table itself requires an authenticated session. Two direct
guesses at the underlying computation API (`fight.pokebattler.com/raids/defenders/REGICE/levels/
RAID_LEVEL_5[...]`) both 404'd; no public documentation of the real computation-endpoint shape was
found (`/developers` page is login/privacy boilerplate only, contra what its name implies).

Assumptions Pokebattler bakes in when a logged-in user DOES pull a number (per
`articles.pokebattler.com/raid-counter/`, fetched 2026-09-09): attacker level+IV pinned via a
"By Level" selector (generic 15/15/15 IVs at chosen level), **3 base dodge strategies** (No
Dodging / Dodge Specials PRO / Dodge All Weave) refined further by Perfect / Realistic (50-90%) /
25% dodge success rates, selectable friendship level, selectable weather (including "Extreme" =
no effect), and **party size fixed at 6 identical attackers per counter row**. That last point
means Pokebattler's per-row DPS/TDO is NOT the same shape as this project's team-DPS thesis
(6-of-the-same, not a mixed roster) — a comparison would need to isolate the single-attacker
number, which the assumptions above suggest it does compute per-slot before any aggregation.

The original open-source backend, `celandro/pokebattler-fight` (fetched 2026-09-09), is **not**
current production code — its own README states *"Pokebattler is no longer running off of this
code base"* and documents no raid-counter endpoints at all (only a trivial `/moves` example).
MIT-licensed but historical, not a window into the live calculator.

**Tag: [community-consensus] that Pokebattler computes something like this; [confirmed] that the
computed numbers are not publicly fetchable without a login, as of 2026-09-09.**

## GamePress DPS/TDO spreadsheet AND GoBattleSim's hosted app — both confirmed DEAD, 2026-09-09

This reverses what stale search-engine snippets suggest (many results still show old page titles
like "Comprehensive DPS/TDO Spreadsheet | Pokemon GO Wiki - GamePress"). Direct fetches this pass:
- `pokemongo.gamepress.gg/` and every path under it (`/comprehensive-dps-spreadsheet`,
  `/comprehensive-DPS-spreadsheet` with query params) all return **301 → `pokebase.app/pokemon-go`**
  — a blanket domain-wide redirect to a generic landing page, not per-page migrated content.
  `pokebase.app/pokemon-go` itself returned **403 Forbidden** to this fetch tool, so even the
  redirect target's content couldn't be inspected.
- `gamepress.gg/pokemongo/gobattlesim` and `gamepress.gg/pokemongo/comprehensive-dps-spreadsheet`
  (the exact URLs GoBattleSim's own README cites as its live host) both **404**.
- The older `pogo.gamepress.gg` subdomain fails DNS resolution entirely (`ENOTFOUND`, confirmed
  this pass and in the prior [[proposal_third_raid_source]] pass for a different page).
- `web.archive.org` is not fetchable by this tool at all ("unable to fetch from web.archive.org"),
  so a frozen historical snapshot of the spreadsheet's numbers could not be retrieved either.

Whether GamePress's content survives under new ownership at PokeBase (the redirect target) is
**unknown and unverified** — the 403 blocked inspection. Do not assume PokeBase is a working
successor without a fresh check; do not assume it is dead either. **Tag: [confirmed] that every
GamePress-hosted URL checked this pass is currently unreachable as documented, 2026-09-09.**

## GoBattleSim / GoBattleSim-Engine — open-source, buildable, but no live hosted numbers found

`biowpn/GoBattleSim-Engine` (fetched 2026-09-09): no archival notice visible, CMake + C++11 build,
CLI `gbs {input.json} [game_master.json]` producing JSON output, plus a C API (`GBS_prepare`,
`GBS_run`, `GBS_collect`). This means a determined implementer COULD build and run it locally to
generate an independent reference number — but nothing hosted publishes one today, since its
documented host (GamePress) is the confirmed-dead domain above. **This is a real, if
labor-intensive, path to an independent output number** — the strongest one found this pass in
terms of assumption-transparency (the source is readable), the weakest in terms of "already
computed and citable."

**Important for the independence question (item 5 below): GoBattleSim's own README explicitly
states the GamePress "Comprehensive DPS Spreadsheet" is GoBattleSim's own extension tool that
"became a standalone application."** GamePress's DPS/TDO numbers and GoBattleSim are **the same
engine under two frontends, not two independent sources** — agreement between them would prove
nothing beyond internal self-consistency. This is exactly the same-upstream trap the task asked to
watch for, now confirmed for the output-comparison axis, not just the roster-feed axis.

## doctorpokegogo.com — live, numeric, per-boss tables with stated per-page assumptions

The one candidate found this pass with an actually-fetchable, numeric, assumption-labeled table.
Fetched `doctorpokegogo.com/en/raid_mewtwo_armored/` (2026-09-09) — a real ranked table:

| Rank | Pokémon | Moveset | DPS | TDO |
|---|---|---|---|---|
| 1 | Necrozma Dawn Wings | Shadow Claw / Moongeist Beam | 26.4 | 1225.7 |
| 8 | Shadow Tyranitar | Bite / Brutal Swing | 20.8 | 1284.5 |

Page states: *"Attackers assumed at Level 50 IV15, including Shadow attack bonus; no weather/aura
boost applied."* The site's separate methodology page (`doctorpokegogo.com/en/rating-methodology/`,
fetched 2026-09-09) states its own formula independently — *"combo DPS: the cycle-average damage
rate of a fast + charge move pair"* at PL50/IV15/CPM 0.8403 — and explicitly references PvPoke
(MIT-licensed, open-source) only for its **separate PvP** battle-league simulator, not for raid
TDO. No GamePress or Pokebattler attribution found anywhere on either page. **This reads as a
plausibly third, independent methodology** — but it is closed-source (unlike GoBattleSim), so
"independent" rests on absence of attribution, not on readable proof the way GoBattleSim's
open-source status allows. No operator/about page checked this pass, no site-history check, no
"last updated" date found on the boss page itself — a real risk that the table could change
silently on a re-check with no version marker to notice by.

**Gaps versus what a tight comparison needs**: dodge strategy and friendship level are NOT stated
on the boss page itself; only inferable from the methodology page's silence on both ("no dodge,
friendship boost, or weather modifiers are mentioned in the core formulas") as an implicit
zero/none default — not a confirmed pinned assumption. **Tag: [community-consensus, single-source,
assumptions partially inferred rather than fully stated].**

## Item 4 — the single best-defined comparison case found

**Shadow Tyranitar (Bite / Brutal Swing) vs. Armored Mewtwo, Level 50, IV 15/15/15, Shadow attack
bonus applied, no weather → DPS 20.8, TDO 1284.5.** Source: `doctorpokegogo.com/en/
raid_mewtwo_armored/`, fetched 2026-09-09, no page date. This is offered as the best AVAILABLE
case, not a fully airtight one — the honest caveats:
- Dodge strategy and friendship level are inferred-none, not explicitly stated on the page.
- No version/date marker means a future re-fetch could silently disagree with today's numbers for
  reasons having nothing to do with this engine.
- Armored Mewtwo is a **discontinued** boss (2019 Team GO Rocket special research / July 2019 5-star
  rotation) — whether this project's data (`raidHistory.json` or a hand-pinned boss stat entry) can
  even represent it wasn't checked this pass; that's a `data-sync`/`engine-developer` feasibility
  question, not something I resolved.
- Single-source: no second independent site was found publishing the identical matchup to
  cross-check doctorpokegogo's own number against.

**If a stricter bar is wanted** — a number independently confirmed by two methodologically-separate
sources, with dodge/friendship/party-size all explicitly pinned on both — **no such case was found
this pass.** Every fetchable numeric table found has at least one unstated assumption or is
single-sourced. Saying this plainly per the task's own instruction: a comparison built on the
Armored Mewtwo/Shadow Tyranitar number would be "matches one community calculator's number under
mostly-stated, partly-inferred assumptions," not "matches an independently-verified ground truth."

## Item 5 — independence map

- **Pokebattler's engine** (closed-source now; open-source ancestor `celandro/pokebattler-fight`
  abandoned) — its own family, distinct from the below.
- **GoBattleSim + GamePress's DPS/TDO spreadsheet** — **the same family**, confirmed by
  GoBattleSim's own README (GamePress's spreadsheet is GoBattleSim's own tool, standalone-ified).
  Do not treat agreement between these two as corroboration.
- **doctorpokegogo.com** — plausibly a third, separate family (own stated formula, no GamePress/
  Pokebattler attribution found), but closed-source so this is circumstantial, same evidentiary
  ceiling [[proposal_third_raid_source]] already applied to Pokebattler/GO Hub roster-independence.
- **PvPoke** — irrelevant to this question; PvP-only, never modelled raids (per
  [[fact_boss_cadence_hybrid_model_sourcing]]), doctorpokegogo cites it only for its own separate
  PvP simulator.

So: at most **two-and-a-half** genuinely distinct calculator lineages were found in the whole
survey (Pokebattler; GoBattleSim/GamePress as one; doctorpokegogo circumstantially separate) — not
the many-independent-sources picture the sheer number of raid-tier-list sites might suggest.

## Standing-decision touches
None. Pure research; no comparison code proposed or written, per the task's own scope limit. If
ever acted on, building a comparison harness would be cross-cutting (engine output + a hand-pinned
external-reference fixture) — a call for the overseer to route, not something to quietly build here.

## Sources (all fetched/searched 2026-09-09 unless noted)
- `fight.pokebattler.com/raids`, `pokebattler.com/raids/REGICE`, `pokebattler.com/developers`,
  `articles.pokebattler.com/raid-counter/`, `pokebattler.com/raids/guides/REGICE` — direct fetches.
- `github.com/celandro/pokebattler-fight` — direct fetch, README.
- `pokemongo.gamepress.gg/*` (multiple paths), `gamepress.gg/pokemongo/*`, `pogo.gamepress.gg/*`,
  `pokebase.app/pokemon-go` — direct fetches, all dead/blocked as described above.
- `github.com/biowpn/GoBattleSim`, `github.com/biowpn/GoBattleSim-Engine` — direct fetches, READMEs.
- `doctorpokegogo.com/en/rating-methodology/`, `doctorpokegogo.com/en/raid_mewtwo_armored/` —
  direct fetches.
- WebSearch: "Pokebattler raid counters API DPS TDO estimator endpoint JSON", "GamePress Pokemon GO
  DPS TDO methodology raid attacker rankings", "gamepress.gg pokemongo site status 2026",
  "GoBattleSim web app biowpn play online raid simulator", "biowpn GoBattleSim-Engine github last
  commit archived", "doctorpokegogo.com raid counters DPS TDO table" — AI-summarized, cross-checked
  against direct fetches above, not trusted standalone.
- MECHANICS.md lines 810-816 (this project's own "matches the formula, not the game" ceiling
  statement) — read directly, not fetched.
