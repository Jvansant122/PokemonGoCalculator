---
name: proposal-third-raid-source
description: Search for a genuinely-independent third source for currently-live raid boss data, to cross-check ScrapedDuck (our only live source today)
metadata:
  type: project
---

Researched 2026-09-07, requested directly by the user after two prior factual errors about
Bulbapedia cost real time. Ground truth for "live today" checked against ScrapedDuck's
`raids.json` fetched fresh this session (2026-09-07): **19 entries** — 1-Star: Dratini, Honedge,
Tyrunt, Amaura, Shadow Slowpoke, Shadow Aipom, Shadow Croagunk, Shadow Grubbin; 3-Star: Hisuian
Sneasel, Hisuian Lilligant, Passimian, Shadow Snorlax, Shadow Hitmontop, Shadow Lampent; 5-Star:
Regirock, Regice, Registeel, Shadow Giratina (Altered); Mega: Mega Gyarados. No date field in the
payload itself (consistent with prior passes' notes).

## Candidates checked this pass

**Pokebattler `fight.pokebattler.com/raids`** [community-consensus, but strongest candidate found]
— a real, documented, first-party-to-Pokebattler JSON API. `/developers` page (fetched 2026-09-07)
explicitly documents it: `GET /raids` = *"The current raid rotation, grouped into tiers, plus
announced upcoming raids"* (separate from the counter-simulation endpoint
`/raids/defenders/{boss}/levels/{tier}/...`, which needs a boss already known and is not a
listing endpoint). Direct fetch of `https://fight.pokebattler.com/raids` returned structured tier
metadata (`RAID_LEVEL_1`..`RAID_LEVEL_6` with level/HP/players/soloable — HP values 600/1800/
3600/9000/15000/22500 lining up with this project's own `RAID_TIER_TABLE`) plus current bosses:
**Tier 1 (Amaura, Dratini, Honedge, Tyrunt), Tier 3 (Lilligant-Hisuian, Passimian,
Sneasel-Hisuian), Tier 5 (Regice, Regirock, Registeel)** — every one matches ScrapedDuck exactly.
The rendered `pokebattler.com/raids` page (same underlying data, human-facing) additionally showed
**Mega Gyarados** under "Mega Ascension Week (Until Sep 8, 2026)" and **Shadow Giratina** under
Tier 5 Legendary, both matching too, plus a genuinely useful bonus ScrapedDuck doesn't have:
dated **upcoming** raids (Mega Beedrill Sep 8-15, Zacian Sep 9-15, Shadow Thundurus Sep 9-Oct 6,
Mega Houndoom Sep 11-15, Mega Venusaur/Zamazenta Sep 16-22, Mega Staraptor Sep 19, Dynamax
Articuno/Moltres/Zapdos Sep 21-27, Mega Malamar/Buzzwole/Pheromosa/Xurkitree Sep 23-29, Mega
Victreebel/Xerneas Sep 30-Oct 6).
- **Freshness**: verified empirically, 4/4 tiers match today's live roster exactly — not taken on
  the endpoint's word.
- **Tier info**: yes, structural (`RAID_LEVEL_N` with real HP/player-count metadata attached).
- **Parse stability**: real JSON endpoint (not scraped HTML), no auth required.
- **First-party vs. community**: community-run (Pokebattler/Celandro), but a distinct,
  long-established operation (its own "Raid Research Update" article dates to 2017, its own
  Discord for mechanics research, its own API that a third party — PokeNavBot — explicitly asked
  permission to use for *"bootstrapping new bosses"*, i.e. as an alternate detection source, per
  `github.com/PokeNavBot/issue-tracker#320`). **I could not find an explicit statement of how
  Pokebattler itself detects a new raid rotation** (no methodology disclosure found on
  `/news` release notes or elsewhere this pass) — so "separately maintained from LeekDuck" is
  circumstantial (different company, different history, its own documented API used by other
  tools as an alternative to LeekDuck-based sources), not proven independent at the sourcing-method
  level. Flagging this honestly rather than overclaiming it.
- **Licensing/robots posture**: `pokebattler.com/robots.txt` (fetched 2026-09-07) uses Cloudflare's
  Content Signals format: default `search=yes,ai-train=no,use=reference` — explicitly blocks
  AI-training crawlers (ClaudeBot, GPTBot, Google-Extended) and spam/SEO crawlers (AhrefsBot,
  SemrushBot, Bytespider) citing "expensive backend simulations," but the robots.txt text itself
  *points third parties at `/developers` and `/llms.txt` for "structured API access"* — i.e. this
  is a site that wants automated API consumption, just not training-data scraping. A scheduled
  `data-sync` job hitting `/raids` on a low-frequency cadence (matching ScrapedDuck's own cadence)
  looks like exactly the "use=reference" case they carve out, but there is no explicit written
  ToS/license beyond that robots.txt signal — worth a direct confirmation-email/Discord ask before
  building on it, not just inferring permission from robots.txt.

**Pokémon GO Hub's `current-go-raids` guide page**
(`pokemongohub.net/post/guide/current-go-raids/`) [community-consensus, weaker candidate] —
fetched 2026-09-07, states **"Last update: September 7, 2026"** and **"updated live with every
rotation"** in its own text. Matched ScrapedDuck's roster **exactly, all 19/19 entries, every
tier** including the shadow sub-tiers. This is the closest full-roster match found. However: **no
source attribution anywhere on the page** (no LeekDuck credit, no methodology section) — for a
site this closely mirroring ScrapedDuck/LeekDuck's exact species+tier breakdown (down to the same
"Altered" Giratina phrasing), I cannot rule out that GO Hub is itself sourced from LeekDuck under
the hood, the same same-upstream problem the task flagged for LeekDuck/ScrapedDuck. Proving
independence would require diffing GO Hub against LeekDuck during a discrepancy event (e.g. one
lagging the other by hours at a rotation boundary) — not done this pass. **Do not present this as
independent corroboration without that check.** `pokemongohub.net/robots.txt` has no AI/crawler
restrictions beyond `/wp-admin/`, so no licensing obstacle either way.

**Serebii.net** (`serebii.net/pokemongo/raidbattles.shtml`) [checked, empirically stale for
fast-rotating tiers] — real page, does list current bosses by tier, dated "Duration: 25/8/26"
(25 Aug 2026, ~2 weeks stale relative to today 2026-09-07). Cross-checked against live roster:
**shadow-tier bosses matched exactly** (Shadow Snorlax/Hitmontop/Lampent in 3-star; Shadow
Slowpoke/Aipom/Croagunk/Grubbin in 1-star — identical to ScrapedDuck), but **non-shadow tiers did
not**: showed Pikachu/Impidimp for 1-star (ScrapedDuck: Dratini/Honedge/Tyrunt/Amaura), Mega
Swampert for Mega (ScrapedDuck: Mega Gyarados), Lunala for 5-star (ScrapedDuck:
Regirock/Regice/Registeel). This is a genuinely useful, concrete finding, not just "old": it
implies Serebii updates on a slower manual cadence than the live rotation for fast-changing
tiers, while shadow-raid rotations apparently persisted unchanged across both snapshots, making
the shadow section look falsely current. **Ruled out as a live cross-check** — same failure mode
as pogoapi's `current` block and the stale Bulbapedia template, just partially masked by shadow
raids' slower rotation cadence.

**pokemon-go-api (`pokemon-go-api.github.io/pokemon-go-api`)** [ruled out — confirmed
same-upstream] — deepwiki-sourced description confirms its `api/raidboss.json` endpoint is built
via an in-repo `LeekduckParser` (primary source) plus a `PokebattlerParser` for difficulty ratings
only. Since its raid *roster* comes from LeekDuck, this fails the task's own same-upstream
exclusion just like ScrapedDuck — not independent. (Its difficulty-rating cross-reference to
Pokebattler is a side detail, not a roster source.)

**`ccev/pogoinfo` / `ReuschelCGN/pogoinfo`** [ruled out — empirically stale, zero overlap] —
claims "up-to-date data... updated automatically" but `active/raids.json` fetched 2026-09-07
listed Tapu Fini, Galarian Ponyta, Hoothoot, Galarian Stunfisk, Druddigon, and a Mega Pinsir slot —
**zero species overlap** with today's live roster. Same red-flag pattern as pogoapi's `current`
block: looks structured and "live" by name, isn't. No source/date disclosure found either.

**A `pekingduck` GitHub Gist (`raid-bosses.json`)** [ruled out — frozen snapshot] — gist itself is
dated "Created November 13, 2023," no update mechanism, not live by construction.

**pokemongo.fandom.com** [confirmed hard block, not transient] — retried this session
(`/wiki/Raid_Battles`) and got the same **HTTP 402 Payment Required** as the prior pass. Two
independent attempts across two sessions both blocked identically — this reads as a persistent
anti-scraping/paywall measure on Fandom's side against this fetch tool, not a one-off. Downgrading
the earlier memory's "worth a follow-up, might be transient" framing to **confirmed non-viable via
this tool** (a different fetch mechanism, e.g. a real browser session, might still get through,
but two clean 402s is enough to stop treating this as "just try again").

**Pokebattler's own `/raids/all` and `/raidbosses.json` guesses** — both 404, confirming the real
endpoint is exactly `/raids` per the documented `/developers` page, not a guessable variant.

## Recommendation

**No source found meets a strict bar of *provably* independent sourcing-methodology** — none of
the candidates disclose how they detect a new rotation, so "not the same upstream as LeekDuck" is
demonstrated only for pokemon-go-api (which *does* disclose LeekDuck as its source, ruling it
out) and inferred circumstantially for Pokebattler and GO Hub (different companies, no LeekDuck
credit, GO Hub explicitly self-dated same-day). Given that ceiling, my actual recommendation:

**Add `fight.pokebattler.com/raids` as the practical second source**, not GO Hub, because:
1. It's a real structured JSON API (not HTML scraping), documented at a stable path, matching this
   project's existing scrape-a-JSON-feed pattern used for ScrapedDuck.
2. It carries independently useful tier metadata (HP/players/soloable per level) that could be
   cross-checked against `RAID_TIER_TABLE` as a bonus consistency check, not just a species list.
3. It empirically matched all 4 checked tiers of today's live roster.
4. Its robots.txt explicitly invites automated "reference" use via a documented API, which is a
   materially better licensing posture than scraping GO Hub's HTML page (which has no
   documentation and an unclear "is this just re-publishing LeekDuck" risk).
5. Bonus upcoming-raid schedule is new information ScrapedDuck doesn't carry at all — useful for
   `data-sync` even independent of the cross-check goal.

**What this recommendation is NOT**: proof that Pokebattler and LeekDuck have zero shared
upstream. If `data-sync` builds this, the honest framing is "a second actively-maintained,
separately-operated feed that currently agrees with ScrapedDuck," not "cryptographic proof of
independence" — and the two should be diffed over time; a future disagreement between them would
be the first real evidence of true independence (or of one lagging the other).

**If a stricter bar than "circumstantially separate operation" is required**: say so plainly —
under that bar, **no source qualifies**, and the honest statement is "our live roster is
single-sourced (ScrapedDuck/LeekDuck) and that is irreducible without a source disclosing its own
detection methodology, which none of the candidates checked do." I'm giving both framings rather
than picking the more convenient one.

## Standing-decision touches
- None. This is pure sourcing research — no Teambuilding Analyzer proposed, no fabrication
  proposed, nothing that touches the `1.3` boost or combat-phase decisions. If acted on, adding a
  second live feed is a `data-sync` schema/fetch change (new raw source alongside ScrapedDuck),
  not an engine or web change.

## Sources (all fetched/searched 2026-09-07)
- ScrapedDuck `raids.json` — direct fetch, ground-truth live roster for this pass.
- `fight.pokebattler.com/raids` — direct fetch, confirmed structure and current bosses.
- `pokebattler.com/raids` (rendered page) — direct fetch, confirmed Mega/5-star match + upcoming
  schedule.
- `pokebattler.com/developers` — direct fetch, confirmed `/raids` endpoint documentation text.
- `pokebattler.com/robots.txt` — direct fetch, Cloudflare Content Signals text.
- `pokebattler.com/news` — direct fetch, confirmed no sourcing-methodology disclosure.
- `github.com/PokeNavBot/issue-tracker/issues/320` — direct fetch, confirms Pokebattler API used
  by a third party as an alternate boss-detection source, not itself a sourcing-methodology proof.
- `pokemongohub.net/post/guide/current-go-raids/` — direct fetch (twice, once for content once for
  source-attribution check), confirmed exact roster match and "no source disclosed."
- `pokemongohub.net/robots.txt` — direct fetch, no AI/crawler restrictions found.
- `serebii.net/pokemongo/raidbattles.shtml` — direct fetch, confirmed partial staleness
  empirically against live roster.
- `deepwiki.com/pokemon-go-api/pokemon-go-api` — fetched, confirmed `LeekduckParser` as primary
  raid-boss source, ruling this candidate out as same-upstream.
- `raw.githubusercontent.com/ccev/pogoinfo/master/active/raids.json` and
  `github.com/ccev/pogoinfo` README — direct fetch, confirmed zero live-roster overlap and no
  source disclosure.
- `gist.github.com/pekingduck/...raid-bosses.json` — direct fetch, confirmed frozen 2023 snapshot.
- `pokemongo.fandom.com/wiki/Raid_Battles` — direct fetch, confirmed repeat HTTP 402.
- WebSearch, "Pokebattler API raid boss endpoint" / "Pokemon GO Hub current raid bosses API" /
  "Pokebattler raid boss data source" (2026-09-07, AI-summarized search results, cross-checked
  against direct fetches above rather than trusted standalone).
