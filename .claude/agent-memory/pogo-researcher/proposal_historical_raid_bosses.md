---
name: proposal-historical-raid-bosses
description: Research into sourcing a real historical raid-boss roster to replace the current 15-megas-only raidHistory.json backfill, plus the old/new raid-tier-label mapping problem
metadata:
  type: project
---

Researched 2026-09-07, requested by the user directly after the Species Report tab's new
"past/inactive raids" feature shipped with only 31 `data/normalized/raidHistory.json` entries (16
live-feed + 15 researched-tier, and **all 15 researched-tier entries are megas** — a direct
artifact of `RELEASED_MEGA_PRIMAL_ALLOWLIST`'s hand-research being the only backfill source; see
`scripts/sync-data.ts`'s `raidHistory` construction, ~line 1224 onward, and
[[proposal-default-raid-tier-fallback]] for the adjacent `lastKnownRaidTier`/tier-fallback work
this sits next to).

## 1. Candidate sources, assessed

**Bulbapedia's "List of Raid Boss changes" family** [community-consensus — community wiki, not
first-party] — the strongest structured source found, but with a hard coverage ceiling:
- Index page (`List of Raid Boss changes`, raw-wikitext-fetched 2026-09-07) links exactly 5
  year-pages: 2017-2018, 2019, 2020, 2021, 2022. **No year-page newer than 2022 exists.**
- A parallel "Season N" page series exists (Season 3 = Jun-Aug 2021, confirmed by fetch; a
  Season 8 page titled Sept-Nov 2022 was found by search but not independently fetched this pass)
  — this series appears to stop at the same ~late-2022 point. Bulbapedia's own dedicated
  raid-tracking apparatus was effectively **abandoned after 2022**, based on what's actually
  linked and fetchable today — it is not a maintained-to-present source, unlike the Mega Evolution
  (GO) page `check-mega-gaps.ts` already relies on.
- Structure (raw wikitext, confirmed by direct `action=raw` fetch of the 2017-2018 page): each
  page is split into dated sections (verbatim example: `==December 18, 2018 - January 3,
  2019==`), each containing tier sub-headers using a `{{lop/raid/GO-head|N}}` template (N = 1
  through 5, the **old numeric tier scheme** — see part 2), and each boss is one template call:
  `{{lop/raid/GO|090|Shellder|type1=Water|600|102|116|134|yes}}` (dex #, name, type(s), CP,
  Attack, Defense, HP, shiny-availability flag). This is stable, template-based, and parseable
  with the same raw-wikitext + regex approach `check-mega-gaps.ts` already uses successfully —
  **for 2017-2022 only**.
- The 2017-2018 page carries **no Mega/EX raid rows at all** (neither existed yet in that window).
  The Season 3 (2021) page **does** distinguish a Mega Raid icon in its sections, per fetch summary
  — Mega coverage exists from its 2020 introduction onward within this source, up to the ~2022
  cutoff.

**pokemongo.fandom.com's "List of Raid Bosses changes" family** [unverified this pass — access
blocked] — WebSearch results describe year-pages through **2026** (i.e., apparently maintained to
present, unlike Bulbapedia's), which would make it the best candidate for closing the 2023-2026
gap Bulbapedia leaves open. However, **every direct `WebFetch` attempt against
pokemongo.fandom.com this session returned HTTP 402 "Payment Required"** (both the 2026 page and
the family's index page, both with and without `?action=raw`) — this looks like an ad/interstitial
wall on Fandom's side blocking non-browser fetches from this tool, not a confirmed absence of the
resource. **I could not verify its structure, per-entry sourcing, or editorial reliability this
pass — do not treat "search snippets describe it" as equivalent to "I confirmed it."** Worth a
follow-up fetch attempt (different tool/session/User-Agent) before either relying on it or ruling
it out.

**pogoapi.net's `raid_bosses.json`** [confirmed via direct fetch, 2026-09-07; already partially
noted in [[proposal-default-raid-tier-fallback]]] — `current` + `previous` keys, each keyed by
**numeric** tier string (`"1"`-`"6"`, `"ex"`, `"mega"`, `"mega_legendary"` — NOT this project's
`RaidTier` string labels). `previous` held ~200+ entries at fetch time but **carries no date or
timestamp field whatsoever** — there is no way to tell from the data itself whether "previous"
means "one rotation ago" or something deeper, and the API maintainer's own docs don't say. Useful
only as a very-recent-rotation supplement, not a historical archive with dates.

**LeekDuck / ScrapedDuck** [confirmed via direct fetch] — by design, current-state-only. The
ScrapedDuck README describes routinely scraping LeekDuck's *live* page and pushing to a data
branch; no changelog, archive, or historical endpoint is described. Git commit history on that
branch could theoretically be mined for a timeline, but: (a) I could not check its actual depth or
commit frequency this session — the GitHub REST API returned `403` on an unauthenticated commits
query (the same 60/hr rate-limit class already noted in this project's own operational memory),
and (b) even if deep, mining it is a real reverse-engineering data-sync project (walking commits,
diffing a continuously-overwritten JSON file) — not "reading a source." Flagging as an unverified
possibility for `data-sync` to spike independently, not a recommendation.

**Serebii.net** [checked, not viable] — no dedicated structured raid-archive page found; only
per-month prose news pages (e.g. `serebii.net/news/2020/March.shtml`), which would require manual
parsing of narrative text per month with no consistent format. Not "reliably parseable."

**Sportskeeda / Dexerto / GO Hub "current raid bosses (Month Year)" articles** [speculative-tier
at best] — third-party journalism with dated URLs going back several years (confirmed titles for
March 2022, April 2022, December 2022, November 2023, etc. via search), which collectively could
function as a manual month-by-month index. But each is prose, inconsistently formatted across
outlets and authors, and turning "hundreds of monthly blog posts" into structured
species+tier+date rows would be large amounts of error-prone manual transcription on a field
(tier) this project has explicitly flagged as load-bearing. Not recommended as a bulk source; at
most a last-resort single-entry check when filling a specific, otherwise-uncited gap.

## 2. The tier-label mapping problem is real and only partially solvable

This project's `RaidTier` union (`packages/engine/src/types.ts`) is exactly the **current-era**
label set: `"1-Star Raids" | "3-Star Raids" | "Mega Raids" | "5-Star Raids" | "Legendary Mega
Raids" | "Super Mega Raids" | "Primal Raids"`. Historical sources do not speak this vocabulary
directly:

- **Pre-Aug 26, 2020**: raids used a numeric Tier 1-5 scheme (Bulbapedia's 2017-2022 pages use
  this). On Aug 26, 2020, Niantic officially merged Tier 2 into Tier 1 and Tier 4 into Tier 3 (the
  same day Mega Raids launched) — sourced to Niantic Support's own announcement, corroborated by
  multiple contemporaneous outlets (dotesports, mxdwn Games, Pokémon GO Hub, ComicBook.com, all
  reporting the same Aug 2020 date) [community-consensus corroborating an official Niantic
  statement, not independently re-quoted verbatim here]. That gives a **citable** mapping: old
  Tier 1 -> `"1-Star Raids"`, old Tier 2 -> `"1-Star Raids"` (post-merge only), old Tier 3 ->
  `"3-Star Raids"`, old Tier 4 -> `"3-Star Raids"` (post-merge only), old Tier 5 -> `"5-Star
  Raids"` (Tier 5 = "Legendary" was a cosmetic label change only, not a structural one).
- **EX Raids** (2017/2018-2021ish, Mewtwo/Deoxys forms, invite-only) have **no current `RaidTier`
  equivalent at all**. Their HP pool/multiplier were never confirmed to match any current tier row
  in `RAID_TIER_TABLE`, and I found no source pinning that down this pass. Recommend leaving
  EX-raid-era bosses **out entirely** rather than guessing which current tier they'd map to.
- **A species' historical tier and its current default tier are two different facts and must not
  be conflated.** Several species already in this project's data changed tier across eras — e.g.
  Mega Mewtwo X/Y and Mega Dragonite are `"Super Mega Raids"` in today's `raidHistory.json`
  (current era), but a 2020-era Bulbapedia entry for a pre-Super-Mega-tier boss would correctly
  show a different, older label for a different species/era entirely. This mostly isn't a
  same-species collision in practice (Super Mega Raids postdate Bulbapedia's 2022 cutoff for any
  species that debuted after it), but the *principle* matters for design: a backfilled historical
  entry represents "this species was this tier during this era," not "this is the tier to
  simulate this species at today." `lastKnownRaidTier`'s precedence chain
  (`raidBoss.ts`'s `defaultRaidTierForSpecies`) must keep pulling from the live/allowlist path it
  already uses, not from a historical-backfill table — flagging this explicitly so nobody wires a
  cheap historical tier into the live-simulation default by mistake.

## 3. Recommendation: scope down now, backfill narrowly and separately, be honest about the gap

Given the "never fabricate" constraint, I'd pick a **hybrid, split into two independent pieces**:

**(a) Immediate, cheap, no new sourcing required — fix the framing, not the data.** The feature's
own UI copy should say what it actually is: "raid bosses observed since Sept 7, 2026" (a real,
growing, timestamped, source-tagged data set with a live audit trail), not an implied "history of
raiding since 2017." This alone resolves the trust problem the user is reacting to, costs nothing
in new research, and is honest in the same register as this project's other "known-honest
placeholder" precedents (`DEFAULT_REAL_RAID_TIER`'s own doc comment, `teamRaid.ts`'s
`swapCostSeconds`/`reviveCostSeconds` defaulting to 0). This is a `web-developer` copy change, not
a data project.

**(b) A separate, explicitly-scoped, hand-cited backfill project, Bulbapedia 2017-2022 only** —
same discipline as `RELEASED_MEGA_PRIMAL_ALLOWLIST`: a new hand-reviewed table, each entry citing
its specific dated Bulbapedia section, with the Aug 2020 tier-merge mapping applied and EX raids
excluded. This is real, nontrivial labor (5 year-pages x up to 5 tiers x many rotations — likely
low hundreds of entries) and should be **sliced**, not attempted as one drop — e.g. "Tier 5
(Legendary) raids only, 2017-2022" as a bounded first slice, since that's the smallest, most
raid-report-relevant tier and the one where a wrong tier is most consequential (15,000 HP vs.
3,600). This needs a new `source` tag beyond today's closed `"live-feed" | "researched-tier"`
union in `scripts/sync-data/rawShapes.ts`'s `RaidHistoryEntry` (e.g. `"historical-backfill"`) so
the UI can keep being honest about a different, weaker-provenance data class from a live
observation — a real schema change, escalated to `engine-developer`/`data-sync`, not something I'd
present as free.

**(c) Do NOT bulk-mine ScrapedDuck git history or scrape Serebii/journalism prose as primary
sources** — unverified depth/reliability (former) or too unstructured and error-prone for a
load-bearing field (latter). If `data-sync` wants to spend a cheap spike confirming ScrapedDuck's
data-branch commit depth (once GitHub API rate limits clear), that's worth doing before ruling it
out entirely, but I would not commit to it as the plan today.

**(d) Follow up on the Fandom-wiki avenue before writing it off.** If it really is maintained
through 2026 as search results suggest, it's the only candidate that could close the 2023-2026 gap
Bulbapedia leaves, using the same per-era-table backfill pattern as (b). This pass could not
confirm it (blocked fetch) — that's a "go check again," not a "don't use it."

**What I would NOT do:** an ongoing scrape of a new source into `sync-data.ts` as the *primary*
fix. The project's own `raidHistory.json` append-only capture (already built, running since
2026-09-07) already is the ongoing-forward mechanism; duplicating that effort against a source with
no reliable date granularity (pogoapi) or design intent for archival (LeekDuck) doesn't solve the
backward-looking gap the user is actually pointing at.

## Standing-decision touches

- **None of this proposes a Teambuilding Analyzer** — this is entirely about single-species
  historical-tier data, not multi-trainer staggering.
- **No fabrication proposed anywhere** — the recommendation is explicitly to scope the UI down
  honestly (a) and/or do a narrow, per-entry-cited backfill (b), mirroring
  `RELEASED_MEGA_PRIMAL_ALLOWLIST`'s existing discipline. Eras/tiers without a real citable source
  (EX raids, 2023-2026 pending the Fandom-wiki check) are named as honest gaps, not filled in.
- **New field flag**: (b) implies a new `RaidHistoryEntry.source` value
  (`"historical-backfill"` or similar) beyond today's closed `"live-feed" | "researched-tier"`
  union — an explicit schema change for whoever picks this up, not an implicit one.
- Nothing here touches the `1.3` mega/primal boost constant or the no-combat-phase-toggle
  decision.

## Sources
- `scripts/check-mega-gaps.ts` (read directly) — the existing raw-wikitext parsing pattern this
  proposal's (b) would reuse.
- `scripts/sync-data.ts` (read directly, ~line 1224-1310) and `scripts/sync-data/rawShapes.ts`
  (read directly, `RaidHistoryEntry` interface) — grounded the current `raidHistory.json`
  construction and its closed `source` union.
- `packages/engine/src/raidBoss.ts`, `types.ts` (read directly) — `RaidTier` union,
  `RAID_TIER_TABLE`, `defaultRaidTierForSpecies` precedence.
- Bulbapedia, `List of Raid Boss changes` index — raw wikitext fetched 2026-09-07, confirms only
  5 year-pages (2017-2018 through 2022) are linked.
- Bulbapedia, `List of Raid Boss changes in 2017-2018` — raw wikitext fetched 2026-09-07, table
  structure/template format confirmed directly.
- Bulbapedia, `List of Raid Boss changes (Season 3)` — fetched 2026-09-07 (rendered, not raw),
  confirms Jun-Aug 2021 coverage and Mega Raid presence.
- WebSearch results (2026-09-07, AI-summarized, not independently re-verified for the Fandom
  claims specifically) — pointed at `pokemongo.fandom.com`'s year-pages through 2026 and a
  Bulbapedia "Season 8" page; the Fandom claim is unverified per above, the Season 8 existence
  claim is search-only (not independently fetched this pass).
- pogoapi.net `raid_bosses.json` — fetched 2026-09-07, shape and lack of date fields confirmed
  directly.
- WebSearch, "Tier 2 Tier 4 raids merged... August 2020" (2026-09-07) — multiple outlets
  (dotesports, mxdwn Games, Pokémon GO Hub, ComicBook.com) corroborating a Niantic Support
  announcement; official-statement-adjacent, not independently re-quoted verbatim from Niantic
  itself this pass.
- GitHub REST API (`api.github.com/repos/bigfoott/ScrapedDuck/commits`) — returned `403`
  (rate-limited), commit depth NOT verified this session.
- Serebii.net, Sportskeeda, Dexerto — checked via search only, judged unsuitable as bulk sources
  per above; not deeply fetched given that judgment.
