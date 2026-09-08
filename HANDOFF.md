# Handoff

Last updated: 2026-09-08. Read `CLAUDE.md` first for durable project architecture/conventions —
this file is the point-in-time "what's done, what's next."

## 2026-09-08: real raid-boss mechanics — MECHANICS.md, and an energy-driven boss model

The user supplied the Silph Road analysis of Niantic's September 2024 raid rework, which
answered several things our own research could not reach.

### MECHANICS.md (new, root)

How the REAL game behaves, sourced and dated, with **what this engine does about each entry**
(implemented / diverges / not modelled). Add to it whenever research establishes a mechanic —
an undocumented mechanic gets rediscovered as a bug. It records real-game bugs too, so we
neither reproduce them nor mistake one for ours.

### Energy-driven boss cadence (shipped, OFF by default)

Real bosses gain 0.5 energy per HP lost — most of their energy comes from **being attacked** —
so a higher-DPS attacker makes the boss fire charged moves faster. We modelled none of that.
Now available as `bossChargedMoveCadence: "fixed-interval" | "energy-driven"` on the three
tabs that actually simulate (Comparator, Team Raid, Species Report). IV Breakpoints and
Attack/Defense do per-hit math and were correctly left alone.

Measured (real species, L40 15/15/15 vs Regirock 5-Star): Kartana -34%, Gengar -34%,
Metagross -26%, Blissey -15% survival. On Species Report it **reorders the rankings** — Shadow
Croagunk drops out of the top three entirely. That is the thesis, not a rescale.

**Default stays fixed-interval.** The 0.5 energy/HP rate is independently corroborated
(Bulbapedia), but the 50% charged-move roll is single-sourced and ~2 years old, and its
*denominator* is undocumented — our move-boundary trigger is a reasoned inference, labelled
`[speculative]` in MECHANICS.md. Flipping the default would silently re-baseline every number
and every shared link on a claim the sourcing does not support.

### Two bugs found by verifying rather than trusting

1. **Boss froze at full energy.** The first implementation re-rolled only when energy *changed*;
   energy caps at 100, so a boss pinned at the cap whose roll failed never rolled again — 101 of
   200 seeded 60s runs never fired a charged move. Found because the user asked what governs
   firing once the bar is full. Now triggered on boss move-completion boundaries.
2. **A reported "sign flip" was an artifact.** I reported bulky attackers *improving* under the
   model and called it correct emergent behaviour. It was the deadlock — long-surviving attackers
   spent more of the run against a frozen boss. Post-fix every attacker is penalised, glass
   cannons worst. Corrected.

### Also

- Boss charged-move cadence now has a physical floor (cannot recast before the previous cast
  ends), which is what AUDIT finding 5 asked for. Sourced: bosses genuinely do fire back-to-back.
- Struggle investigated and closed as NOT a defect — 0 energy in raids, 100 in PvP, two separate
  Bulbapedia fields. pogoapi was right.
- Team Raid carries boss **energy** across slot handoffs and wipes under the new model. Verified
  directly; a silent reset there would have made the model more forgiving than the one it
  replaces.

### Shipped and deployed

Pushed 2026-09-08 (`ecbc578..ea0e6be`, 9 commits). GitHub Pages run #32 succeeded in 1m 2s, and
the live bundle was verified to actually contain this work — not just the workflow's word.

The audit is closed: every finding is either fixed or consciously closed with a recorded reason,
so `AUDIT_2026-09-08.md` now carries a CLOSED banner. It is deliberately kept rather than deleted:
six code comments in `scripts/` cite its defect numbers as their rationale, and its dated filename
reads as a record rather than as pending work. The table below is the summary; durable
game-mechanics facts live in `MECHANICS.md`.

Findings and outcomes:

| # | Finding | Outcome |
| :--- | :--- | :--- |
| 0 | Ranking-flip marker showed the first, non-decisive crossing | fixed |
| 0b | Form ingestion keyed on stats alone, so type-distinct forms stayed wrong | fixed |
| 1 | 52 mechanically-distinct forms missing from the roster | fixed |
| 2 | Pokebattler cross-check reported ~11 phantom disagreements | fixed |
| 2b | Accumulate-only history preserved stale mis-resolutions | fixed |
| 2c | Historical rows use today's attack/defense multiplier (~8%, 35 species) | won't fix |
| 3 | Attack/Defense floored (GO floors only HP) | won't fix, known precision limit |
| 4 | STRUGGLE energyCost 0 | NOT a defect — 0 in raids, 100 in PvP |
| 5 | Dodge silently saturated below the boss charged-move duration | fixed |
| 6 | Team Raid never explained "approximate" | fixed |

### Still genuinely open

- `raidHistory.json` archive rows carry no dates, so past bosses cannot be ordered or filtered by
  era. Bulbapedia coverage ends 2023 and pogoapi's archive is undated.
- Nothing corroborates the CURRENT 2026 roster except Pokebattler, and its agreement with
  ScrapedDuck is circumstantial rather than proven independence.
- One real cross-check disagreement stands: Shadow Grubbin (ScrapedDuck only).
- Two Alolan shadow forms (`SANDSHREW_ALOLA_SHADOW_FORM`, `MAROWAK_ALOLA_SHADOW_FORM`) do not
  resolve — shadow synthesis resolves to base species, not regional forms.
- The energy-driven boss cadence ships OFF by default. See `MECHANICS.md` for what would need to
  be established before flipping it.

---
## 2026-09-08 (overnight): Species Report expansion + comprehensive audit

Started as "review the Species Report tab, add raid-tier filters and past raids." Grew into a
full audit after the user reported data-quality and calculation issues that had survived several
previous fix attempts. Full findings: `AUDIT_2026-09-08.md` — now CLOSED, all findings resolved.

### Shipped

- **Species Report**: raid-tier checkbox filter (cuts the simulated set, not just the rendered
  rows), past/inactive raids (15 -> ~585), debounced sweep with a visible pending indicator, a
  "Boss HP" column labelled sourced-vs-tier-default, and four provenance badges.
- **Data layer**: `data/normalized/raidHistory.json`, accumulate-only, backfilled from pogoapi's
  archive + Bulbapedia's 16 raid-boss-change pages. Pokebattler added as a second LIVE source,
  cross-checked against ScrapedDuck every run.
- **Engine**: `bossMaxHpOverride` on `SpeciesReportBossTarget`, `sustained.bossMaxHp` on results.
  Additive; 174 -> 186 tests.
- **Detector**: `scripts/check-mega-gates.ts` — flags a mega carried ONLY by the live-raid gate
  while it is still present, instead of after it vanishes. `check-mega-gaps.yml` is now a daily
  roster health check reporting missing / fragile / stale-data findings.

### Two HIGH bugs found and fixed

1. **The ranking-flip marker was wrong** — the product's headline output. The crossing scan
   stopped at the FIRST lead change while `finalLeader` came from final totals, so on a
   double-crossing the marker and its own sentence disagreed. Reproduced on the default
   Comparator view (~5.4s marked, ~7.0s correct). Now derived from one source.
2. **Wrong types on a live raid boss.** Hisuian Sneasel (fighting/poison) was modelled as base
   Sneasel (dark/ice). This inverted a real ranking: Machamp 778 > Metagross 715 became
   Metagross 1276 > Machamp 347. Root cause was form ingestion keyed on stats alone; 57 forms
   shared a stat line but differed in typing (Alolan Vulpix fire->ice, Alolan Marowak
   ground->fire/ghost). Rule is now stats OR types — see the standing decision in CLAUDE.md.

3. **Accumulate-only history preserved a stale mis-resolution.** Found only by driving the live
   app: Hisuian Sneasel rendered twice, the second row really being base Sneasel under the
   Hisuian name. `raidHistory.json` never revisited rows, so the pre-fix mapping survived and
   reintroduced the bug of (2) through the data file. Rows are now re-resolved and merged each
   sync. Removing the two stale rows also recovered a real fact they had been masking (base
   Sneasel's own 1-Star appearance, eraHp 1800), so the count went 604 -> 603, not 602.

### Shadow durability + Pokebattler archive (2026-09-08, later)

- Pokebattler's legacy archive imported: `raidHistory.json` 603 -> **764**, adding 161
  `pokebattler-legacy` rows. Excluded Elite Raids (20000 HP has no `RaidTier` equivalent) and
  Ultra Beast (15000 numerically matches 5-Star, but Ultra Wormhole was Special-Research-gated,
  not standard raid-egg content — an HP coincidence is not confirmation). `eraHp` stays
  Bulbapedia-only and held at exactly 553 throughout.
- **Shadow species are now durable**: 8 -> **104**, species 1238 -> **1334**. Previously they
  were synthesized only inside the active-raid loop, so each one vanished on rotation. Now
  anchored on `raidHistory.json`. Proven by disabling both external evidence sources and
  re-running: all 104 regenerated, `species.json` byte-identical. 96 of them are not currently
  raiding and could not have existed before. Side benefit: shadow variants are now selectable as
  attackers, not just bosses.
- `check-raid-history-sources` (new) caught the `pokebattler-legacy` web-layer gap on its first
  real use — 26 of 65 rows would have been mis-tiered (Archen et al. at 3600 HP instead of 600).
  It now also asserts shadow durability. Both failure paths were verified by making them fail.
- Known gap, 2 entries: `SANDSHREW_ALOLA_SHADOW_FORM` / `MAROWAK_ALOLA_SHADOW_FORM` do not
  resolve. The base regional forms exist; shadow synthesis resolves to base species only, not to
  regional forms. Small and deliberate to leave.
- The era attack/defense multiplier discrepancy (~8% on ~35 old-tier-4 species) is **closed,
  won't fix** by user decision 2026-09-08 — see AUDIT finding 2c.

### Regression that started it

`mewtwo-mega-y` silently vanished from `species.json` mid-session: `mega_pokemon.json` has no
Mewtwo rows at all, so it was carried solely by the live-raid gate and dropped when its rotation
ended — the identical Mega Skarmory failure. Allowlisted. The gate audit exists so the next one
is caught while still visible.

### Verified clean (do not re-audit without cause)

Damage formula, CPM table, type chart, every modifier constant, boss stat derivation,
Comparator-vs-Species-Report agreement (0.0), base stats 21/21 vs real GO, all five scenario
codecs round-tripping VALUES (67 fields — the existing guard only checks name presence), and
zero NaN/infinite/negative across 1092 attackers x 19 bosses.

### Open at the time — all since resolved, see the 2026-09-08 section above

- ~~Pokebattler's LEGACY archive not imported~~ — imported later the same day (161 rows).
- ~~Three LOW findings unfixed~~ — all closed: atk/def flooring accepted as a known precision
  limit; STRUGGLE verified NOT a defect (0 in raids, 100 in PvP); dodge saturation fixed with a
  physical cadence floor.
- `raidHistory.json` has no dates on archive rows, so past bosses cannot be ordered or filtered
  by era. Bulbapedia coverage ends 2023; nothing corroborates the 2026 roster except Pokebattler.
- One real cross-check disagreement stands: Shadow Grubbin, ScrapedDuck only.

---
## 2026-09-07, later still: code review, live audit, and two real bugs found

A `skeptic` pass over the live app plus my own correctness review. **Two confirmed user-facing
bugs were found and fixed, and running the data sync exposed two further regressions** — details
in the two subsections below. In both cases the reported root cause turned out to be incomplete or
wrong, and verifying it directly rather than accepting it changed the fix:

- **Mobile: the whole page scrolls horizontally, on every tab.** Never checked before — the app
  went from 2 tabs to 5 across four desktop-only sessions. `skeptic` attributed it solely to
  `.tab-switcher`. Measuring it myself at 375px found **two independent causes**: the tab nav
  (`display: flex`, no `flex-wrap`, no `overflow-x` — last button's right edge at 480px on every
  tab) *and*, separately, `.time-series-table` rendering ~600px wide as a direct child of `.panel`
  with `overflow-x: visible` all the way to `<body>` (Team Raid worst at 639px). Fixing only the
  nav would have left Team Raid broken. The Attack/Defense tab's 51-column `.breakpoint-table` is
  **not** at fault — it already has a scoped scroll container, and is the pattern the fix copies.
  **Fixed**: `.tab-switcher` gained `overflow-x: auto`, `.tab-button` gained
  `white-space: nowrap; flex-shrink: 0`, and the two `.time-series-table` call sites that lacked a
  wrapper (`TeamRaidBreakdownTable.tsx`, `SpeciesReportView.tsx`) got the same wrapper div the
  other four call sites already used. Deliberately **not** `overflow-x: auto` on `.panel` — setting
  one axis to `auto` forces the other from `visible` to `auto`, which would clip the species-picker
  dropdowns.
  **Measured by the overseer in the browser afterwards**, because `web-developer` reported plainly
  that it had no browser tool and could not confirm the rendered numbers — a gap worth respecting
  rather than papering over. All five tabs at 375px now report `scrollWidth === clientWidth === 375`
  (Team Raid 639 → 375). The nav scrolls within itself (335 visible / 804 content) instead of
  dragging the page, the Attack/Defense tab's inner mode toggle — which also uses `.tab-switcher`,
  so it inherited the fix — scrolls rather than clipping, and desktop is unchanged (nav fits at
  1060/1060, no page overflow). Dev server logs and console are clean on a fresh start.
- **The Species Report was showing last week's mega raid bosses.** `skeptic` called this a
  "mega-raid ingestion" bug scoped to that part of the feed. It isn't: I checked
  `data/raw/raids.json` against a live upstream fetch and found normalized output matching raw
  *exactly*. Ingestion is correct — the data was simply **stale**, since the rotation flipped
  after the 05:01 UTC sync. The fix was to run `npm run sync-data`, not to change any code. Worth
  remembering as a diagnostic habit: before believing a transform is wrong, check whether its
  input was just old.

### Running the sync then exposed two genuine regressions — both now fixed

Neither was caused by the sync — both were latent, and the first real rotation since `8d6fd08`
surfaced them. Both were fixed in `scripts/sync-data.ts` and the data regenerated:

1. **`lastKnownRaidTier` never actually persisted, which was its entire purpose.** `steelix-mega`,
   `aggron-mega` and `glalie-mega` all went `"Mega Raids"` → `undefined` the moment they rotated
   out. `8d6fd08` was built expressly "so this data isn't lost again once a species rotates out,"
   and it failed at that on its first real rotation: the field is only ever written from a live
   observation or the hand-researched allowlist, and **nothing carries forward the previous run's
   value**, so each sync rebuilds it from scratch. (`raichu-mega-y` going "Super Mega Raids" →
   "Mega Raids" is *correct* and documented — a live observation legitimately outranks a
   historical debut record. Don't "fix" that one.)
   **Fix**: a carry-forward step, inserted after `previousSpecies` is loaded (reusing the read
   `diffSpecies` already does) and before the diff runs. Precedence is now
   **live-this-run > allowlist > carried-forward > undefined**, with every carry-forward reported
   in `WARNINGS` rather than happening silently. A first-ever run with no previous file is a
   no-op, not a crash.
2. **`skarmory-mega` silently disappeared** — species count 1092 → 1091. It was reaching the
   picker *only* through the live-raid gate, so the rotation ending deleted a real, released
   species from the app. This is exactly the blind spot `RELEASED_MEGA_PRIMAL_ALLOWLIST` exists to
   cover. It also falsified a `CLAUDE.md` standing-decision claim that Skarmory "already flows
   through as real species via the normal mega_pokemon.json/GAME_MASTER pipeline" — it never did.
   That line is now corrected, with the general lesson attached: **a species being visible today
   tells you nothing about which gate is carrying it.**
   **Fix**: a `Mega Skarmory` allowlist entry, cited to this pipeline's own 05:01 UTC cached
   `raids.json` observation — first-hand evidence from our own feed, independent of GAME_MASTER,
   which satisfies the allowlist's own cross-check rule.

**Verified independently by the overseer**, not taken from the agent's report: 1092 species (0
added, 0 removed vs. the committed file), `skarmory-mega` back with `"Mega Raids"`,
`steelix-mega`/`aggron-mega`/`glalie-mega` all **retaining** `"Mega Raids"` instead of going
`undefined`, `sableye-mega`/`mawile-mega`/`audino-mega` picking up `"Mega Raids"` fresh from the
live feed, and — checked across every species and every field — **`lastKnownRaidTier` is the only
field that moved anywhere in the file.** Also confirmed live in the browser: the Species Report
now lists Sableye and Mawile and no longer lists Steelix.

One process note worth keeping: the sync had already overwritten `species.json` with the buggy
output before the fix existed, so the carry-forward had no correct baseline left to read. The
recovery was `git show HEAD:<path> > <path>` to restore the committed state first, then re-run.
Committed data is the backup that makes a regenerable artifact safely regenerable — which is an
argument for committing a good sync promptly, not sitting on it.

### Correctness review of the engine, data layer, and round-trips

Verification baseline afterwards: **174/174
engine tests** (up from 150), both packages type-check clean, production build succeeds in **both**
modes — plain (`base: "/"`) and `GITHUB_PAGES=true` (`base: "/PokemonGoCalculator/"`, the one that
actually matters for deploy, and which a plain local build does *not* reproduce).

**Verified sound, by reading the code rather than trusting the tests:**

- `stats.ts`'s `effectiveStat` floors exactly once, at `(base + iv) * cpm`, and `shadow.ts`'s
  multipliers are applied to the **raw** base stat before that single floor — so the project's
  documented "nested FLOOR()" failure mode is genuinely avoided, not just commented about.
- `damage.ts` implements `floor(0.5 · power · atk/def · modifiers) + 1` correctly, with every
  modifier a named input and no inline magic numbers.
- `ENERGY_PER_DAMAGE_TAKEN = 0.5`, `MAX_ENERGY = 100`, and the type chart's 1.6 / 0.625 /
  0.390625 all match real current-generation Pokémon GO values.
- `ownBoostMultiplier` correctly gates the mega/primal self-boost on the move's type matching the
  boost's `boostedType`, and `resolveBoost` is the single choke point so the disable toggle can't
  be partially applied.
- Both non-null assertions in `simulate.ts` (lines 329, 335) are properly guarded — the
  `nextBossChargedMoveAt !== null` branch is only reachable when `boss.chargedMove` exists.
- Zero `TODO`/`FIXME`/`@ts-ignore`/`as any` anywhere in `packages/engine/src`, `packages/web/src`,
  or `scripts/`. One `eslint-disable` (`ComparatorView.tsx:270`), deliberate.

**Data layer independently validated** (script over `data/normalized/`, not the sync script's own
self-report): 1092 species, **0** duplicate ids, 0 with non-positive stats, 0 missing types, 0
missing fast or charged moves, 0 moves with bad duration/power. All 61 mega/primal forms carry a
`boost` field — the 2026-09-04 bug where 48 megas synced with no boost (silently simulating at 1x)
would be caught by this check today. The only boost multiplier present anywhere is `1.3`, the
load-bearing value. All 14 active raids resolve to a real species, all tiers valid.

**The recurring Scenario bug class is currently clean, checked statically across all five tabs.**
Extracted every field of each tab's `Assumptions` interface and confirmed each one appears in both
`assumptionsToScenario` and `scenarioToAssumptions`: Comparator 26 fields, Team Raid 18, Species
Report 12, IV Breakpoints 10, Attack/Defense 9 — **75 total, none missing in either direction.**

That check is now a permanent repo script rather than a one-off: `npm run
check-scenario-roundtrip` (`scripts/check-scenario-roundtrip.mjs`), wired into the
`add-scenario-assumption` skill's finish step as the mechanical half of its checklist. It was
validated by deliberately deleting the Attack/Defense tab's `mode` field from
`assumptionsToScenario` and confirming it failed with exit 1 naming that exact field, then
restoring the file to a byte-identical state — a checker that has only ever passed proves nothing.
It's a name-level smoke test, not a type check (it proves a field is *mentioned* in both
directions, not that it's mapped correctly), and it's deliberately dependency-free plain Node so
it can't rot. Note it is currently the **only** automated coverage of the three web-only Scenario
types, since `packages/web` has no vitest setup.

**Gap found and closed:** `gamemaster.ts` — `fromGameMaster` / `fromGameMasterMove` /
`speciesIdFor`, the single on-ramp `scripts/sync-data.ts` uses to build all 1092 species — had
**zero test coverage**, with no `gamemaster.test.ts` at all. The least-guarded load-bearing path in
the engine, and materially more important since `5887d69` moved the pipeline onto GAME_MASTER.
`engine-developer` added 24 tests (`packages/engine/test/gamemaster.test.ts`), pinning the energy
sign convention, `toPokemonType` normalization, form-suffix id/name rules, `SpeciesRegistry`
behavior, and — deliberately, using a non-integer stat like `270.5` — that `fromGameMaster` applies
**no** rounding of its own, so a second floor can never creep in outside `stats.ts`. No `src/` file
was changed. Verified independently: 174/174 green, and the new file is substantive, not padding.

**Two findings recorded, deliberately not acted on:**

1. **`vulnerableWindowSeconds` is dead.** It's a **required** field on `FastMove`/`ChargedMove`
   (`types.ts:78`), set by `fromGameMasterMove` to the move's full duration, and supplied at ~40
   test sites — but **no production code anywhere reads it**. The "died mid-animation" failure mode
   it was meant to model is really implemented via `simulate.ts`'s
   `diedDuringOwnChargedMoveAnimation`. So this is mandatory ceremony with no consumer: either wire
   it up or drop it and make the ~40 fixtures simpler. `code-simplifier`/`engine-developer` call —
   not touched here because removing a required field edits the type and every fixture, which is
   well beyond a review.
2. **`speciesIdFor` doesn't hyphenate a multi-word form** — `form: "Mega X"` yields
   `"raichu-mega x"`, with a literal space. Harmless today and confirmed so: every real `form`
   value in the pipeline is a bare single-word suffix, and every synced id in
   `data/normalized/species.json` is clean. It's latent, not live; now pinned by a test so the
   behavior can't change unnoticed.

## 2026-09-07, later: documentation reconciliation pass (no product code changed)

The user asked for a review of the repo's `.md` specs. No engine, web, or data code was touched;
150/150 engine tests, both type-checks, and the production build were re-run afterwards and are
all green. What the review found:

- **⚠️ `6a698e7` is committed locally but was never pushed.** Confirmed with a real `git fetch`:
  local `main` is 1 ahead of `origin/main`, and `deploy.yml` has no run for that SHA. The
  Power-Up Optimizer research and `PLAN_login_and_roster_persistence.md` therefore exist **only
  on this machine** — they are not on GitHub and not backed up anywhere. Nothing is broken (it's
  a docs-only commit, so the deployed site is correct), but this is the first thing to resolve
  next session.
- **`HANDOFF.md` had skipped five shipped commits entirely** — backfilled as its own section
  below (`5435935`, `6507695`, `5887d69`, `b4e5999`, `d9d5447`). The biggest of these,
  `5887d69`, moved the whole species pipeline off pogoapi.net onto live GAME_MASTER, which
  nothing in the docs reflected.
- **`CLAUDE.md` still said "four tab-switched views"** — there are five (`adb` / Attack-Defense
  Breakpoints shipped in `6507695`). Fixed, along with the `data/` section, which still implied
  pogoapi was the primary source.
- **The founding build spec is actively misleading now, and `CLAUDE.md` pointed at it with no
  caveat.** `Downloads/pogo-analyzer-spec.md` still instructs building the combat-phase toggle
  (removed at the user's explicit, repeated request), still pins acceptance tests to the four
  deleted hypothetical fixtures, and still asks for a data layer that accepts user-defined
  species — the exact thing that got those fixtures deleted. The spec file itself was left
  untouched (it's the user's own founding artifact); instead `CLAUDE.md` now opens with a table
  of precisely where the spec has been overridden, and says this file wins on conflict.
- **`PLAN_attack_defense_breakpoints.md` was deleted** — it shipped in full as `6507695`, and
  every one of its "open questions to resolve during implementation" was in fact resolved and
  documented in the code itself (`AttackDefenseBreakpointsView.tsx`'s caveats panel and
  `attackDefenseBreakpointsScenario.ts`'s doc comment): no dodge control (each cell *is* one hit,
  so there's no "over time" for dodge to apply to), no mega/primal own-boost multiplier (same
  stance the IV Breakpoints tab takes), and breakpoint cells highlighted by background color.
  Since every `PLAN_*.md` opens with "self-contained plan for a fresh session," leaving a shipped
  one at the root reads as pending work — `CLAUDE.md` now states the delete-on-ship rule.
- **`add-scenario-assumption` was still a Comparator-only checklist**, pointing at `App.tsx` for
  round-trip functions that have since moved into per-tab `*View.tsx` files. Rewritten with a
  five-tab routing table up front. It also now names an unflattering fact instead of hiding it:
  three of the five Scenario types (`speciesReportScenario`, `ivBreakpointsScenario`,
  `attackDefenseBreakpointsScenario`) are web-only and have **no tests at all**, since
  `packages/web` has no vitest setup — a real hole in exactly the bug class that skill exists to
  prevent. The skill now requires a manual share-link round-trip and an explicit statement that
  no test covered it.
- **`verify-and-ship` had a genuine bug**: its deploy-watch step polls
  `actions/runs?per_page=1`, but this repo grew a second workflow (`check-mega-gaps.yml`,
  weekly), so an unscoped query can return that run and report the wrong conclusion. Now scoped
  to `workflows/deploy.yml/runs`, verified working against the live API. Its "short `sleep 15`
  loop" suggestion was also replaced with background polling, matching the user's standing
  preference against blocking sleep loops.
- **Bundle size re-measured: 1,457.67 kB raw / 184.97 kB gzipped**, up from the ~1.16 MB figure
  this file still carried. Recorded in `PLAN_login_and_roster_persistence.md`'s step 5, since
  that's the number the "lazy-load Firebase?" decision starts from.
- **`PLAN_login_and_roster_persistence.md` gained two pinned product-level constraints** rather
  than leaving them to be discovered mid-implementation: signed-out must stay fully functional on
  every tab (this is a zero-account calculator and a shared link must work for a recipient who
  never signs in — so roster UI runs on local state with Firestore syncing *on top*, never as its
  state store), and storing user data means owning its deletion (sign-out is not delete; a real
  delete path and a plain statement of what's stored ship with it). Also corrected: Firebase
  authorized-domains takes a bare domain, not an origin, and `localhost` is authorized by default
  — which is exactly why that gotcha only bites after the first deploy.
- **`meta-architect` swept all nine agent bodies** (routed per `CLAUDE.md`, since `.claude/` is
  its domain); 7 of 9 needed corrections, `meta-architect.md` and `pogo-researcher.md` verified
  clean. The severe one, **independently re-verified by the overseer against
  `test/scenarioA.test.ts` rather than taken on the agent's word**: `engine-verifier.md`'s
  "anchor tests" — the numbers that are its entire reason to exist, and which it is instructed to
  treat as real regressions rather than stale expectations — still pinned the *deleted* fixtures'
  values (10.0s / 190 / 221 / 130 HP). The real assertions are 7.5s / 171 / 189 / 150 HP against
  `test/fixtures/hypotheticalDuo.ts`. A verifier with wrong anchors reports **false regressions
  on a healthy engine**, which is worse than no verifier; it had been wrong since 2026-09-06.
  Also fixed: three agents still routed work to the deleted `src/fixtures/scenarioA.ts`, three
  hardcoded a stale tab count, `data-sync.md`'s entire "Source" section still presented pogoapi
  as primary (including one row, `type_effectiveness`, that was never fetched at all — the type
  chart is hardcoded in `typeChart.ts`), and `engine-developer.md` claimed all four test fixtures
  carry `statsArePrecomputed: true` when only the two bosses do.
- **Three follow-ups the agent flagged but deliberately left, closed afterwards** (each verified
  against source first): `RAID_TIER_TABLE` was enumerated in two agent bodies as six HP values for
  "1-star through Primal" when there are **seven** tiers — Legendary Mega and Primal legitimately
  share 22500/0.79, so a six-value list silently loses a tier; `data-sync.md` never mentioned
  `check-mega-gaps.ts` or its weekly workflow at all despite owning them, and now documents the
  structural blind spot they exist to cover plus the two hard rules for
  `RELEASED_MEGA_PRIMAL_ALLOWLIST` (independent cross-check, never speculative); and
  `packages/web/src/registry.ts:53` still claimed "no real synced species carries `isShadow` yet"
  when 8 do (verified by counting `data/normalized/species.json`) — a one-line comment fix, done
  directly rather than delegated.
- Leftover empty directory `packages/engine/src/fixtures/` removed (git doesn't track empty dirs,
  so it was a local-only artifact of the 2026-09-06 fixture deletion).

**The pattern worth carrying forward**: every one of these is the same failure — a doc describing
a world that no longer exists, surviving because nothing re-reads it against source. Two files
(`engine-verifier.md`'s anchors, `verify-and-ship`'s deploy poll) were not merely stale but
actively wrong in a way that would have produced a confident false report. Docs in this repo need
the same "verify against real numbers before concluding" discipline the code already gets.

## 2026-09-07: raid-tier reconciliation shipped; Power-Up Optimizer researched; login/persistence spec written for next session

- **`lastKnownRaidTier` shipped** (`8d6fd08`, deployed, confirmed via GitHub Actions API): a real
  observed raid tier, now persisted on `SpeciesDefinition` and preferred by
  `defaultRaidTierForSpecies()` over its old per-rarity guess. Two sources populate it: `data-sync`
  now writes it automatically whenever a species matches a currently-live raid (so this data isn't
  lost again once a species rotates out — verified live this session via Mega Mewtwo Y picking up
  "Super Mega Raids" purely from today's feed), plus a researched backfill for 7 of the 11
  previously-added allowlist megas (Raichu X/Y, Victreebel, Dragonite, Malamar, Mewtwo X, Starmie).
  A pre-existing uncommitted fix (Legendary-rarity megas defaulting to "Legendary Mega Raids" instead
  of generic "Mega Raids") was found blocking this work and committed standalone first (`28bad88`) —
  see the code's own commit history for how that was resolved (preserved, not discarded, per this
  session's git-safety practice). 150/150 engine tests, clean typecheck both packages, clean build.
- **`pogo-researcher` fleshed out the "Power-Up Optimizer" idea in `IDEAS.md`** (committed in
  `6a698e7` along with the login plan — it is tracked now, unlike in earlier sessions): real
  stardust/candy cost data exists at pogoapi.net's `pokemon_powerup_requirements.json` (not yet
  fetched by `sync-data.ts` — real `data-sync` work needed, not a hand-typed table), and a sharper
  mechanical argument than "team DPS > raw CP" in the abstract — damage is floored to an integer per
  hit, so a power-up can raise ATK with zero actual DPS change until it crosses the next real
  breakpoint against a specific boss's Defense (same concept the IV Breakpoints tab already uses).
  It flagged one open scope question rather than assuming an answer: no-login `Scenario`-URL roster
  vs. real auth+persistence.
- **That scope question is now resolved**: the user chose real login. Full architecture spec written
  to `PLAN_login_and_roster_persistence.md` (Firebase Auth with Google Sign-In only + Cloud
  Firestore — no server, no change to GitHub Pages hosting, no password handling since it's pure
  OAuth delegation). This is the project's first-ever backend dependency; the plan explicitly flags
  that no existing subagent owns "auth infrastructure" and recommends the overseer session wire it
  directly (Firebase project setup itself needs the **user**, not an agent — creating the project and
  enabling Google Sign-In requires their own Google account sign-in, which this assistant can't do
  for them). **Not yet started** — this is a plan for a fresh session to pick up, per the user's
  explicit request this session ("write out a spec ... i will use it in a new session"). Read that
  plan's "Step 1: Firebase project setup" first — it's a checklist for the user, not code.
- `IDEAS.md` updated to point at the new plan from the Optimizer's own step list (sequenced before
  the Optimizer's roster-data-model step, not folded into it — login is app-wide infra, not
  Optimizer-specific).

## 2026-09-06, later the same day: five commits this file never recorded (backfilled 2026-09-07)

A documentation-reconciliation pass on 2026-09-07 found this file had **skipped five shipped
commits entirely** — it jumped from the "two new tabs" session below straight to the 2026-09-07
entry above. All five are on `main` and deployed. Backfilled here so the continuity record
matches `git log`; each is summarized from its own commit message and diff, not re-derived:

- **`5435935` — per-rarity raid-tier default.** `DEFAULT_REAL_RAID_TIER` had been modeling *every*
  real species of unknown tier as a Legendary-tier boss. Replaced with a rarity-keyed default
  (Standard → 3-Star, mega/primal → Mega Raids, 5-Star kept for Legendary and as the last-resort
  fallback for Mythic/Ultra Beast/unknown). This is the guess that `8d6fd08`'s `lastKnownRaidTier`
  later learned to override with a real observation.
- **`6507695` — the Attack/Defense Breakpoints tab (the fifth tab).** Implements
  `PLAN_attack_defense_breakpoints.md` in full; that plan file was deleted on 2026-09-07 as
  superseded (see the section above this one for the resolutions it recorded). Full IV × level
  damage grids (0-15 IV × levels 50→25, 51 columns), split into fast/charged sheets, in both an
  Attack and a Defense mode, with its own `adb` query param. Also shipped app-wide in the same
  commit: type-colored swatches on every move dropdown, via the one shared `MoveSelect`.
- **`5887d69` — the species pipeline moved off pogoapi.net onto live GAME_MASTER.** This is the
  single biggest change in this batch and the one most likely to trip a future session that still
  assumes pogoapi is the source of truth. Base stats/types/movesets/rarity now come from
  PokeMiners' GAME_MASTER mirror, fetched fresh every run; pogoapi's cached endpoints stay on only
  as the released-content roster/allowlist plus a per-species/per-move fallback, and
  `pokemon_rarity.json` is gone (GAME_MASTER's own `pokemonClass` replaces it exactly).
  Cross-validated against the previous pogoapi values across all 1024 species and 48 mega/primal
  entries with **zero** stat/type mismatches, species count unchanged at 1081 — and it immediately
  recovered real data the old path was missing (Mewtwo's legacy Counter). `scripts/sync-data.ts`'s
  header comment documents the resulting split authoritatively; prefer it over any summary.
- **`b4e5999` — 11 real megas that had fallen through every gate, plus a scheduled detector.**
  Mega Raichu X/Y and 9 others (Victreebel, Dragonite, Malamar, Falinks, Mewtwo X, Starmie,
  Chesnaught, Delphox, Greninja) were real released content missing from the picker because
  `mega_pokemon.json` lacked them *and* none were in the live raid rotation. Added via
  `RELEASED_MEGA_PRIMAL_ALLOWLIST`, each entry cross-checked against a source independent of
  GAME_MASTER. The durable half is the new weekly `.github/workflows/check-mega-gaps.yml`, which
  diffs this roster against Bulbapedia and opens/updates a tracking issue — so the next gap is
  caught automatically instead of waiting for the user to notice. This commit is also where
  `CLAUDE.md` got its Mega-Raichu-isn't-hypothetical correction.
- **`d9d5447` — general Shadow toggle on every attacker picker.** A Shadow species previously only
  existed in the registry when it happened to be a live Shadow raid target, so a trainer's own
  Shadow Pokémon was unselectable the rest of the time. Now a checkbox on all four attacker
  pickers, disabled when the species already carries a mega/primal boost (mutually exclusive in
  the real game), round-tripping through each tab's own Scenario type. **This also silently
  resolved the open question logged in the 2026-09-05 section below**: the Shadow defense
  multiplier is now `5 / 6` in `shadow.ts`, not the previously-chosen `0.83`, matching the
  external calculator this project cross-checked against.

## 2026-09-06: two new tabs (Team Raid Simulator, Species Report), a real boss-stats bug fixed, hypothetical fixtures deleted

Large session, several independent threads landed in sequence. Everything below was independently
re-verified by the overseer (tests/typecheck/build plus live browser checks), not just trusted from
subagent self-reports — two subagent tasks this session were cut off mid-run by a session rate
limit, and both times the actual completed code on disk was verified directly rather than assumed
good or bad.

- **Visual QA pass + 5 UI bugs, shipped** (`25dbf01`, deployed): an "unfamiliar user" screenshot
  walkthrough of the whole page found the shrunk Attack/Defense/Stamina IV boxes had no visible
  digit and could silently change value on click (native number-spinner arrows overlapping an
  invisible digit at `4ch` width — fixed by suppressing the spinner and widening slightly), move
  dropdowns truncating before the DPS figure, an unexplained "also active, no data yet" caption,
  and the share-link input forcing page-level horizontal scroll at some viewport widths (missing
  `min-width: 0` on a flex child). Default matchup also changed to real species (Kartana vs.
  Rayquaza vs. Mega Latios) instead of the hypothetical Raichu/Kyogre fixtures.
- **Mega-boost scope corrected — a real, corroborated finding, not a guess**: the mega/primal
  team-wide damage boost never applies to the boosting Pokémon's own party — only to *other
  trainers* simultaneously in the same raid lobby (a solo trainer only has one Pokémon active at a
  time, so there's no "own bench" to boost). Confirmed via 3 independent sources including Niantic/
  TPC's own official Mega Evolution guide, not just a community wiki. The shipped tool's copy had
  this backwards ("Teammates (not counting this candidate)", "your party's teammates") — reworded
  across `AssumptionPanel.tsx`/`App.tsx`/`DamageOverTimeChart.tsx`/`sensitivity.ts`/
  `BossMovesetSweep.tsx` to "other trainers also in this raid." Pure copy/doc-comment fix, no math
  changed. This finding also directly shaped the Team Raid Simulator's design (see below) — a
  same-roster team-boost calculation would be mechanically wrong, not just redundant, so it has
  none.
- **UI simplification + new move metrics**: the "other trainers" input fields and the per-candidate
  team-damage-boost row now disappear entirely (not just show "N/A") whenever neither candidate has
  an active boost; the damage-over-time table and boss-moveset-sweep table drop their now-redundant
  "Total damage"/"Own+team" columns in that same state. `MoveSelect.tsx` gained two new derived
  metrics: energy-per-second on fast moves, and a labeled composite "Efficiency: DPS×DPE" on
  charged moves (this tool's own derived stat, explicitly not claimed as an official/community one).
- **Real raid-boss stats bug found and fixed** — a real correctness bug that was already live in the
  shipped comparator, not a new-feature gap: `RAID_BOSS_CPM = 1.0` treated a boss's base stats as
  already boss-effective, which is only true for the (now-deleted) hand-authored hypothetical
  fixtures. Any **real** synced species used as a live raid target (already selectable via
  `activeRaidBossOptions()`) was getting ~200 HP and no stat multiplier instead of its real
  multi-thousand HP pool and tier CP multiplier. Fixed: `raidBoss.ts` gained a real per-tier HP
  table (600/3600/9000/15000/22500/25000 for 1-star through Primal — literal Bulbapedia wikitext
  quote, 3 independent fetches agree) and per-tier Attack/Defense multiplier (0.5974/0.73/0.79),
  applied via the existing `effectiveStat()` helper for Attack/Defense but as a flat table lookup
  for HP (HP is *not* CPM-scaled — a real, easy-to-get-wrong distinction, now covered by a
  regression test). A new `SpeciesDefinition.statsArePrecomputed` flag branches real-species-math vs.
  already-final hand-tuned fixtures, so pinned test numbers didn't need to move. Live-verified: the
  same default matchup's survival numbers changed (Kartana 10.0s→12.0s, Rayquaza 6.5s→7.5s) once the
  fix landed, confirming it actually took effect, not just compiled.
- **The 4 hand-authored hypothetical fixtures were fully deleted, at the user's explicit request**
  (`MEGA_RAICHU_X`/`Y`, `PRIMAL_KYOGRE`, `MEGA_SKARMORY` — `packages/engine/src/fixtures/
  scenarioA.ts` no longer exists). The user was asked to clarify scope first (UI-picker-only hide
  vs. full deletion including the pinned tests that depended on them) and chose full deletion, then
  separately asked that the pinned tests be *replaced* with suitable new coverage rather than just
  removed — done: new test-only fixtures live under `packages/engine/test/fixtures/
  hypotheticalDuo.ts`, deliberately **not** under `src/` and **not** re-exported, since being
  reachable from `packages/web`'s species picker was the root problem with the original 4 (they
  were never supposed to be user-selectable "real" options). Every pinned number in the rewritten
  tests was verified by actually running the engine's own code, not hand arithmetic. `packages/web`
  broke as expected (4 dangling imports in `registry.ts`) and was fixed in a follow-up pass — the
  real synced "Primal Kyogre" species (a real raid boss, unrelated to the deleted engine constant of
  the same display name) is unaffected and still selectable, confirmed live.
- **Team Raid Simulator tab, new** — one trainer's own 6-Pokémon sequential lineup against a raid
  boss's real HP pool and countdown timer. Grounded in real-game research, not assumed: a full
  6-Pokémon wipe is **not** a hard loss in the real game — you're bounced to the lobby, heal with Bag
  items (a real resource cost, assumed-unlimited for v1, named as such), and can rejoin the *same*
  raid attempt repeatedly with only one shared clock running across attempts; the only real loss
  condition is the raid timer expiring. Engine side (`teamRaid.ts`/`teamScenario.ts`): `runTeamRaid`
  loops per-slot fights (reusing the existing stepwise simulator directly, no new combat math),
  paying a `reviveCostSeconds` and restarting from slot 1 on a full wipe (capped at
  `MAX_TEAM_RAID_CYCLES = 1000`, an engineering safety guard only — the real game imposes no cap).
  `swapCostSeconds`/`reviveCostSeconds` both default to 0 (no confirmed real value exists for
  either); a labeled ~13s community-estimate preset is offered for the revive cost only. Web side:
  this app's **first tab-switcher** (`App.tsx`'s `view=` query param + a `.tab-switcher` nav — the
  Species Report tab below reuses this same scaffold), a 6-slot roster builder, real per-tier boss
  HP/timer wired through, a wipe/revive-aware damage chart, and its own shareable `TeamScenario`
  (`?ts=`). Fully live-verified: default roster, a real "timer expired, wipe count 4" run, the full
  per-cycle/per-slot breakdown table, and a share-link round-trip that correctly restores the exact
  tab and roster. **Known gap, not a bug in what's built**: the `isMega` flag is UI bookkeeping only
  — the engine doesn't stop a roster containing two different mega-capable species (no real-game
  analogue, since only one Pokémon can be mega-evolved account-wide at a time). Nobody's hit it
  yet since the default roster only has one; worth a stricter engine-side check someday.
- **Species Report tab, new** — pick one Pokémon, see it ranked against every currently-active real
  raid boss (not "every boss ever" — no such tagged dataset exists yet), by the same real stepwise/
  dodge/randomized-cadence simulator the comparator uses (survival-weighted, not flat power/duration
  DPS), plus a cheap no-simulation "type-matchup percentile" sanity-check column that's explicitly
  labeled separately so it's never confused with the simulated ranking. Deliberately has **no**
  synthetic "other trainers" team-boost modeling — there's no second party to attribute it to in a
  single-species view, and inventing one would drift toward the out-of-scope Teambuilding Analyzer.
  Each row hands off to the two-candidate comparator (pre-fills candidate A + target, switches tabs)
  via a new `comparatorPrefill.ts`. Its own shareable `SpeciesReportScenario` (`?sr=`). Live-verified
  end to end: a real ranked table for Kartana across 12 bosses, the row hand-off correctly landing
  on the comparator tab with the right species/target selected, and a share-link round-trip.
  **Known gap, named rather than faked**: "boss starts primed" was deliberately left out of this
  tab's assumptions — a single shared absolute-energy value doesn't generalize correctly across 12
  bosses with different charged-move costs the way the other two tabs' fraction-based version does;
  would need a per-target override or a boss-invariant definition if wanted later.
- **Recurring stray-memory-directory bug hit twice more this session** (`packages/.claude/agent-
  memory/engine-developer/...` and `packages/engine/.claude/agent-memory/engine-developer/...`
  instead of the repo root) — same root cause as before (a subagent's own build/test commands drift
  its CWD mid-task). Manually merged into `.claude/agent-memory/engine-developer/` and the stray
  directories deleted. The `web-developer.md` fix applied in an earlier session didn't carry over to
  `engine-developer.md` — worth adding the same instruction there too, next time agent definitions
  are touched.
- Two agent tasks were cut off mid-run by a session rate limit this session (once building the Team
  Raid Simulator engine primitives, once cleaning up the fixture-deletion's web-side references) —
  both times, a fresh dispatch (or, for the second, the overseer's own direct verification) confirmed
  the actual code already on disk was complete and correct before continuing, rather than assuming
  either way from the interrupted self-report.
- Working tree is uncommitted as of this writing — about to be committed and shipped in one push.

## 2026-09-05, same session continued: two ideation passes routed and landed, sensitivity panel rebuilt

- **First ideation pass** (2 proposals) landed via `engine-developer` + follow-up `data-sync`/
  `web-developer` tasks: `SpeciesDefinition.boost.persistsThroughFaint` (Primal Groudon/Kyogre,
  Mega Rayquaza — real-game exception where the mega/primal team boost outlives the boosting
  Pokémon's own fainting) and real Shadow attack/defense multipliers (`shadow.ts`,
  `SHADOW_ATTACK_MULTIPLIER = 1.2` / `SHADOW_DEFENSE_MULTIPLIER = 0.83`, mutually exclusive with
  the mega/primal `boost` field — enforced by throwing, not silently allowed). Both fully wired
  into the UI (a "persists past faint" badge + explanatory sentence, a Shadow species badge
  reusing the existing `isHypothetical`/`isApproximate` pattern) and **verified live in the browser
  this session** — selecting the `PRIMAL_KYOGRE` fixture as a candidate against Mega Raichu Y shows
  the badge, the explanatory sentence, and a real crossover marker on the chart (~2.3s in) despite
  Raichu surviving ~10s longer in isolation — a clean live demonstration of the product's own
  thesis. `data-sync` also synthesized 8 real Shadow raid-boss species (e.g.
  `giratina-altered-shadow`) from the ScrapedDuck feed instead of the previous blunt
  "strip prefix, approximate with unboosted base stats" behavior; spot-checked to apply the
  multiplier exactly once (no double-application with `stats.ts`'s single-floor invariant).
- **Numbers cross-checked against an external source**: formula, STAB/type-effectiveness/weather/
  mega-boost constants, and Mewtwo's real move data (Psycho Cut, Psystrike) all independently
  confirmed correct and current against a public raid-DPS calculator's own written methodology.
  One small real discrepancy found: that source's Shadow defense penalty is 5/6≈0.8333 vs this
  project's `0.83`. **Resolved since** — `shadow.ts` now uses `5 / 6` (landed as part of `d9d5447`,
  see the 2026-09-06 backfill section above).
- **Second ideation pass** (3 more proposals) uncovered a real architectural gap while being
  routed: `packages/web/src/sensitivity.ts` was running on the engine's *deterministic*
  `runComparison` path, where boss-charged-move dodging is documented as inert and boss cadence
  isn't a modeled concept at all — meaning the pre-existing "Dodging" sensitivity check had almost
  certainly always silently reported "no flip," regardless of the real scenario, and 2 of the 3 new
  proposals were flatly impossible to implement against that path. Fixed by switching
  `sensitivity.ts` to the same stepwise `runSustainedComparison` path the live result cards
  actually use (at a reduced `SENSITIVITY_ITERATIONS = 25` instead of the display path's 200, an
  explicit documented precision-for-speed tradeoff). The panel now has 7 checks total: the
  original 5 (now running on the correct model) plus **Average teammate DPS** and **Boss
  charged-move cadence** (new), and the old binary "Dodging" check was replaced with a continuous
  **Dodge accuracy (boss charged attacks)** scan. **This task was interrupted mid-run by the user
  (an unrelated request was cancelled) before it could self-verify or report back** — the overseer
  independently re-verified after the fact: 67/67 engine tests, clean `packages/web` typecheck,
  clean production build, and all three new checks confirmed rendering correctly live in the
  browser with no console errors. The implementation is complete and correct despite the
  interrupted report.
- A related finding, **not applied on purpose**: `uptime.ts`'s `findCrossoverPartySize` (the
  engine's own dedicated party-size crossover function, literally described in its own doc comment
  as "the headline output of Phase 3") still has zero call sites in `packages/web` —
  `sensitivity.ts`'s party-size check keeps its own local scan instead, with a code comment
  explaining why swapping to that function isn't obviously correct (it anchors to wherever the
  sweep's own leader first changes from party size 1, not to the specific configured party size's
  actual current winner — usually the same, not guaranteed). Worth a closer look someday, not
  blocking.
- **Explicitly deferred**: researching "charged-move animation lockout" (the user asked, then
  cancelled it mid-request to conserve session budget) — not investigated at all this session.
- Working tree is still uncommitted as of this writing — `verify-and-ship` is being run now to
  land everything above in one push.

## 2026-09-05, push guardrail, raid-data accuracy pass, new `pogo-researcher` agent

Working tree is **not** clean — several things below are uncommitted, ask before pushing (this
session did not commit or push anything itself).

- **Push guardrail added**: `.claude/settings.json` now has `"permissions": {"ask":
  ["Bash(git push:*)"]}` alongside the existing test hook — any `git push`, from any agent or the
  main thread, now prompts for confirmation. Closes an item `meta-architect` had flagged twice
  without applying (project-wide permissions change, needed the user's sign-off — got it this
  session). Two other `meta-architect` findings from the prior session's audit
  (`sprite-mechanism-dropped`, `web-developer-tool-mismatch`) turned out to be false positives —
  both fixes were already present in `d1305f6` itself, `git log` confirmed no edits since; the
  memory files were corrected rather than re-fixing something that wasn't broken.
- **Raid data was stale, and re-syncing surfaced a real, bigger-than-expected bug.** `data-sync`
  found the cached `data/raw/raids.json` reflecting a rotation that no longer exists (Mega Raichu
  X/Y, Mega Latias/Latios — not real current raids); re-fetched live from ScrapedDuck and
  re-synced. While spot-checking the result, it found Shadow Giratina (Altered) resolving to
  `speciesId: null` — not an approximate-match problem, Giratina was **entirely absent** from
  `data/normalized/species.json`. Root cause (found by a follow-up `data-sync` task): `scripts/
  sync-data.ts` only ever picked a species' form literally labeled `"Normal"` out of
  `pokemon_stats.json`; any species without one was silently dropped, no warning. **This affected
  59 species**, not just Giratina (Unown, Spinda, Zygarde, Tornadus/Thundurus/Landorus, Aegislash,
  Zacian/Zamazenta, Koraidon/Miraidon, and more — full list in the agent's task output). Fixed:
  added a per-species `defaultFormByPokemonId` fallback (prefers `"Normal"`, else that species'
  first-listed form), reused consistently across the stats/types/moves lookups so a fallback
  species doesn't get its stats and moveset picked by mismatched logic. **Caveat, not fully
  verified**: "first-listed form" is a heuristic, spot-checked correct for Giratina/Tornadus/
  Thundurus/Landorus/Enamorus/Keldeo/Meloetta but *not* checked for all 59 — flagged example:
  Zygarde's first-listed row is `"Complete"`, not its real in-game default `"Fifty_percent"`. Worth
  a closer pass before trusting every one of the 59 at a glance. Still-open, upstream-only gaps
  (nothing to fix code-side): Mega Mewtwo X and Armored Mewtwo have no matching data source at all
  in pogoapi.net; Mega Victreebel falls back to unboosted base-Victreebel stats under the existing
  documented `isApproximate: true` convention (working as designed, just a materially weaker
  approximation than the Shadow-variant case that convention was written for).
- **New subagent**: `.claude/agents/pogo-researcher.md`, at the user's explicit request — real
  Pokémon GO mechanics/content/meta research plus comparator feature ideas grounded in the
  survivability-as-team-DPS thesis, never implements. `CLAUDE.md`'s routing table updated (six
  agents → seven). A `meta-architect` sanity pass on this specific addition was launched the same
  session — check whether it landed and read its findings before assuming the addition is clean
  (routing overlap with `data-sync`/`engine-developer` and tool-grant justification were the two
  things asked about).
- **Files touched, uncommitted as of this writing**: `.claude/settings.json`,
  `.claude/agent-memory/meta-architect/*.md` (3 files corrected), `.claude/agents/
  pogo-researcher.md` (new), `.claude/agent-memory/pogo-researcher/MEMORY.md` (new), `CLAUDE.md`,
  `HANDOFF.md` (this file), `data/raw/raids.json`, `data/raw/_meta.json`, `scripts/sync-data.ts`,
  `data/normalized/species.json`, `data/normalized/activeRaids.json`.

## 2026-09-05, config restructured around specialized subagents (prior session)

Went from 4 to 6 agents and rewrote `CLAUDE.md` from ~272 lines to ~110 at the user's request —
CLAUDE.md now reads as instructions for an **overseer/project-designer** role (product vision,
standing decisions, routing) rather than containing all the deep mechanical "how to implement X"
content itself. New: `.claude/agents/engine-developer.md` (absorbed the old "Architecture
(Phase 1-5)" and "Fixtures" sections — implements `packages/engine`, writes its own tests) and
`.claude/agents/web-developer.md` (absorbed `site-builder`'s old UI-feature charter — implements
`packages/web` UI). `site-builder` was narrowed to build/deploy only. `engine-verifier` and
`data-sync` each got a one-line addition pointing at `engine-developer` for anything they
shouldn't be deciding themselves (a fix vs. a diagnosis; a schema change vs. a fetch/normalize
job). Both new agents got `memory: project` with seeded-empty `MEMORY.md` files, matching
`meta-architect`'s existing pattern. **Agent definitions load once at session start — this
restructuring needs a session restart/resume before the new/edited agents are actually usable.**
A `meta-architect` validation pass was launched on this restructuring itself (routing overlap
between engine-developer/engine-verifier and web-developer/site-builder specifically, whether
CLAUDE.md's new routing table has enough signal, real context-cost numbers, and a spot-check that
no real technical content got garbled in the move). **Checked 2026-09-05 (overseer session):** it
landed clean — routing has no overlap, CLAUDE.md cut ~62%. It flagged two findings as "not fixed,"
but both turned out to be false positives: `data-sync.md`'s sprite section and
`web-developer.md`'s tool-availability hedging were already present in `d1305f6` itself; `git log`
confirms neither file was edited after that commit. Both memory files
(`.claude/agent-memory/meta-architect/sprite-mechanism-dropped.md` and
`.claude/agent-memory/meta-architect/web-developer-tool-mismatch.md`) were corrected to say so.
One real, still-open item from that audit: `site-builder-push-guardrail.md` — no `settings.json`
permission rule or hook stops an accidental `git push`, only `site-builder.md`'s prose. Deliberately
not applied twice now without the user's explicit sign-off (it'd be a project-wide permissions
change, not scoped to one agent) — raise it next time push/deploy comes up.

## 2026-09-05, moveset selection, dodge-feasibility gating, new metrics, chart death markers

Committed and pushed (`cd8e04b`), deploy succeeded. Full test suite (53, up from 50) and both
packages' type-checks pass; the
whole feature was also exercised live in the Browser pane, not just via tests.

- **Moveset pickers**: `packages/web/src/MoveSelect.tsx` (new) — a plain `<select>` per fast/
  charged slot, six total (candidate A/B fast+charged, boss fast+charged), added to
  `AssumptionPanel.tsx`. Each option's text shows approximate DPS (`power/durationSeconds`,
  intentionally not folding in STAB/type-effectiveness — a property of the move, not the
  matchup) plus duration/energy/damage. **Real bug found and fixed while building this**: every
  synced move object carries BOTH `energyGain` and `energyCost` (see `gamemaster.ts`'s
  `fromGameMasterMove` — whichever doesn't apply is just 0), so a structural `"energyCost" in
  move` type-guard is always true and can't tell fast from charged. Fixed by having the caller
  pass an explicit `kind: "fast" | "charged"` prop instead of sniffing the object shape.
- **Engine wiring**: `comparison.ts` gained a `resolveMove` helper and optional
  `candidateFastMoveIds`/`candidateChargedMoveIds`/`bossFastMoveId`/`bossChargedMoveId` on both
  `ComparisonInputs` and `SustainedComparisonInputs`, falling back to `moves[0]` exactly like
  before when omitted — every existing test/call site needed zero changes. Threaded through
  `sensitivity.ts` too, so the sensitivity panel can't silently disagree with the main result by
  using a stale moveset.
- **Dodge feasibility**: new optional `ChargedMove.perfectlyDodgeable` (default `true`).
  Confirmed live this session that pogoapi.net has no frame-level "damage window" timing at all
  (checked `charged_moves.json`'s actual fields), so this is a hand-authored flag, not derived
  data — every real synced move stays `true`/unaffected. `dodgeMultiplierForHit` takes it as a
  third arg and forces full damage when `false`, regardless of `DodgeBehavior`. The
  `holdChargedMoveUntilSafe` UI hint text is now dynamic: says outright whether the safe-window
  trigger is actually active right now (needs `dodge: "perfect"` AND a dodgeable move) or degraded
  to energy-cap-only, instead of one static description.
- **New per-candidate metrics**: "Own damage per second" and "Own + team damage from boost" rows
  on each result card, plus a ratio sentence comparing the two candidates for each metric.
- **Chart death markers**: `DamageOverTimeChart.tsx` now splits each candidate's line into a
  solid segment up to its death time and a dashed tail past it (when the displayed window
  extends beyond that death — e.g. the other candidate survives longer, or `minFightLengthSeconds`
  stretches it), with a small marker + "died ~Xs" label at the death point. Fixed a related
  inconsistency while at it: the chart's `secondsSurvivedCutoff` was fed each candidate's *mean*
  survival across 200 runs, but the actual plotted trajectory belongs to one specific run
  (`representativeRun`) — now uses that run's own `faintedAtSeconds` instead, so the marker
  reflects the exact run being charted.
- **Design decision, resolved with the user via AskUserQuestion during planning**: given no real
  per-move damage-window data exists, three options were on the table (hand-authored flag /
  duration-based heuristic / no per-move modeling at all) — the user picked the hand-authored-flag
  approach explicitly, so don't revisit this as an open question.

## 2026-09-05 session: Claude Code workflow tooling (skills + hook), not product code

No product-code changes this session. Added two skills and one hook to make recurring workflows
automatic instead of relying on memory:

- **`.claude/skills/verify-and-ship`**: the test → typecheck (both packages) → build → commit →
  push → watch-deploy sequence that's been run by hand after every commit so far. Trigger it (or
  it should self-trigger) whenever a change is about to be committed/pushed, or the user says
  "verify"/"ship"/"deploy".
- **`.claude/skills/add-scenario-assumption`**: a 7-step checklist for adding a new user-facing
  setting to the web UI, specifically to stop the "forgot to add the field to `Scenario`" bug from
  recurring a third time (it's hit twice already — `teammateTypeMatches`, then
  `bossChargedMoveFrequencySeconds`).
- **`.claude/settings.json`** (new file): a `PostToolUse` hook on `Edit|Write` that runs
  `npm run test:engine` automatically whenever the edited file is under
  `packages/engine/src/**/*.ts`, and surfaces a failure straight into the conversation (exit code
  2 + the failing test output on stderr) rather than blocking the edit. This automates
  `engine-verifier.md`'s own stated charter ("use proactively after any change to stat, damage,
  energy, or breakpoint code"). Verified live in-session: fires correctly on a passing edit
  (silent success) and on a real induced regression (surfaced the exact failing assertions).
  No `jq` is installed in this environment, so the hook's JSON-parsing/glob-matching logic is
  written in Node (`node -e`) instead of a `jq` pipeline — worth remembering if adding more hooks
  here, since `jq` won't work as a starting point to copy from.

A `meta-architect` audit of the whole Claude Code setup (agents, CLAUDE.md, the two new skills,
the new hook) was re-launched this session after an earlier attempt hit a rate limit mid-run —
check whether it landed and what it found; don't assume it agrees with the above until you've
read its actual output/memory file (`.claude/agent-memory/meta-architect/MEMORY.md`).

## Status as of the last product-code session (2026-09-04): generalized, rebuilt the combat model, added images, fixed a real data bug

Four commits landed and deployed this session, in order: `9af7ef0` (real-data generalization +
damage-over-time chart), `c4c3d12` (dodge/energy model overhaul), `8607734` (species images),
`8e607b9` (Mega Skarmory data-bug fix). Working tree is clean — `git status` has nothing pending.

- **All 50 engine tests pass** (`npm run test:engine`), up from 35 at the start of the session.
- Type-check clean in both packages; `npm run build --workspace=packages/web` succeeds.
- Every change was verified live in the Browser pane, not just via tests — see specifics below.

## What changed, in order

### 1. Real data + damage-over-time chart (`9af7ef0`)
Generalized the tool beyond its 3 hardcoded fixture species: `scripts/sync-data.ts` now pulls
1012 real species from pogoapi.net (964 Normal-form + 48 real mega/primal attackers) plus the
current 12 active raid bosses from a live community feed, into `data/normalized/`. The headline
chart was redesigned from "team contribution vs party size" to "own damage + attributable team
damage vs time" (`DamageOverTimeChart.tsx`), and opening-burst/warmup timing became derived from
a boss's own energy economy (`bossChargedMoveReadySeconds`) instead of user-typed numbers.

### 2. Dodge/energy model overhaul (`c4c3d12`)
Driven by a long sequence of detailed user feedback (including a literal spreadsheet showing a
fast/charge/combined-damage/avg-DPS model). In one pass:

- **`DodgeBehavior` now governs the boss's charged attacks only.** A separate
  `dodgeFastAttacks: boolean` (no percentage variant) covers fast attacks. Real consequence: the
  deterministic opening-burst model (`combat.ts`) has no boss charged move at all, so `dodge` is
  a no-op there — `dodgeFastAttacks` is what extends survival in that phase.
- **Dodging costs `DODGE_COST_SECONDS = 0.5`** per attempt (hit or miss), pushing the attacker's
  own next fast move later. `simulateOpeningBurst` was rewritten from a precomputed-and-sorted
  event array to a 2-pointer merge to support this — verified behavior-preserving for the
  default (no-dodge) path against every pinned test before adding anything new.
- **`holdChargedMoveUntilSafe`**: hold the charged move (energy capped at `MAX_ENERGY=100`) until
  a dodged boss charged hit or the energy cap forces it. UI shows each candidate's energy buffer.
- **Two real bugs found while adding fast-move damage tracking**: (a) the attacker's fast move
  never dealt any damage to the boss at all — only its energy gain was modeled; (b) the charged
  move's damage was computed using the FAST move's STAB/type-effectiveness, not its own —
  invisible in every fixture because Scenario A's two moves are both Electric, but wrong for real
  species with differing move types. Fixed by splitting `fastDamageOut`/`chargedDamageOut`
  everywhere; `ownDamageTrajectory` is now the combined fast+charged total.
- **Off-type mega-boost bug fixed**: off-type teammates got `1x` (no boost); the real mechanic is
  a flat `OFF_TYPE_MEGA_BOOST_MULTIPLIER = 1.1` for everyone, full `boostMultiplier` only for
  type-matching teammates. `matchingTeammateCount` (a slider) replaced the old all-or-nothing
  `teammateTypeMatches: boolean`.
- **Combat-phase toggle removed entirely**, per explicit repeated request: "opening burst" isn't
  a mode to pick, it's a computed fact. The UI now always runs `runSustainedComparison` (one
  continuous simulation); the deterministic path still exists and backs the pinned tests, just
  isn't wired into the live UI.
- **Extend-only fight-length control** (`minFightLengthSeconds`), explicit charged/fast/total/
  team damage breakdown in the result cards (resolved a "why does median damage show 0" question
  — it was charged-only, and glass cannons dying mid-cast land 0 charged damage but still deal
  real fast-move damage), and real axis tick labels on the chart.

### 3. Species images (`8607734`)
Added `imageUrl?: string` to `SpeciesDefinition`, sourced from the PokeAPI sprites mirror on
GitHub. Real Normal-form species use their national dex id directly (free); the 48 real
mega/primal species needed one PokeAPI name-lookup each (cached to
`data/raw/mega_sprite_urls.json`). Genuinely surprising finding: PokeAPI has real sprite data
even for the hypothetical fixtures (`raichu-mega-x`/`raichu-mega-y`/`skarmory-mega`/
`kyogre-primal`) despite those forms being unreleased — all 48/48 mega lookups resolved after
fixing one id-collision edge case (`kyogre-primal-attacker`'s sprite needs the pre-rename name).
Wired into the species pickers, page header, result cards, and chart legend.

### 4. Mega Skarmory data bug fixed (`8e607b9`)
User noticed Mega Skarmory dealing implausibly large damage and asked why. Root cause:
`MEGA_SKARMORY.baseAttack` was `2000` — an 8x outlier against every other boss-mode fixture
(`PRIMAL_KYOGRE.baseAttack` is `250`), and since raid bosses in this engine treat `baseAttack` as
their literal effective attack stat (no CPM/IV scaling), `2000` meant ~8x any realistic boss's
damage. Almost certainly a CP-vs-base-attack-stat mix-up from hand-authoring. Fixed to `250`;
verified live (Raichu X/Y survival against Skarmory went from ~6.6s/4.4s to ~37.6s/28.6s).
Re-derived `scenarioB.test.ts`'s window (180s) and crossover teammate-DPS (1) empirically against
the corrected stat — the tests' actual claims are unchanged, just at different numbers. Audited
the rest of the hand-authored fixture and the full 1012-species synced dataset for similar
issues (duplicate/zero/negative stats, duplicate ids, empty movesets, vulnerable-window
mismatches, off-spec boost multipliers, raid-to-species matching) — nothing else found.

## Not yet done / candidates for next session

1. ~~Mobile-width visual check~~ — **done 2026-09-07**, and it found a real page-level horizontal
   scroll on all five tabs (see the code-review section above). Now fixed and measured at 375px.
   Note what was *not* covered: only the 375px width and only the overflow axis were checked. Touch
   targets, the charts' behavior at narrow widths, and landscape were not examined.
2. **Bundle size is now 1.46 MB raw / 185 kB gzipped** (measured 2026-09-07, up from ~1.16 MB —
   species.json plus the growing engine surface). Still a warning, not an error, and the gzipped
   figure is what users actually download, so this is not urgent. It *is* directly relevant to
   `PLAN_login_and_roster_persistence.md`'s step 5, which asks whether to lazy-load the Firebase
   SDK: the answer starts from this number, not the old one.
3. The "Teambuilding Analyzer" idea (multi-trainer mega staggering across a raid, since the mega
   boost doesn't stack) is explicitly out of scope for this tool — a separate future project.
4. Regional/costume forms are still not modeled in the data layer (only Normal-form + mega/primal
   are synced). Shadow *is* modeled properly now — real multipliers in `shadow.ts` (1.2x Attack,
   5/6 Defense) plus a general toggle on every attacker picker as of `d9d5447`; the old
   "documented approximation" caveat no longer applies to attackers.
5. `uptime.ts`'s `findCrossoverPartySize` — the engine's own dedicated party-size crossover
   function, described in its own doc comment as "the headline output of Phase 3" — still has zero
   call sites in `packages/web`. Carried over unresolved from the 2026-09-05 section below, where
   the reasoning for not swapping `sensitivity.ts` onto it is written out. Worth a look someday.

## Preferences / gotchas for whoever picks this up

- This user gives extremely precise, mechanically-literal feedback — exact formulas, specific
  numbers, and once a literal spreadsheet. Implement close to literally rather than
  simplifying/interpreting loosely; they've usually already thought through the edge cases. See
  the memory file on this if picking up mid-thread.
- When a user-visible number looks wrong ("why does X show 0", "why is X so high"), check whether
  the underlying metric's *definition* is narrower than what's displayed, or whether a hand-typed
  data value is the actual culprit — but always verify with real numbers before concluding either
  way. This session found three real bugs exactly this way (missing fast-move damage; charged
  move using the fast move's type-effectiveness; Mega Skarmory's 8x-outlier attack stat).
- Whenever changing `DodgeBehavior`/dodge semantics or a hand-authored fixture stat, re-run the
  FULL test suite immediately and expect some existing tests' *setup* (not their claims) to need
  re-deriving — this session hit that twice (the dodge charged/fast split, and the Skarmory fix)
  and each time the fix was to empirically re-derive new window/threshold values, not to weaken
  the assertions.
- Custom agents are back in use (data-sync, site-builder, engine-verifier, meta-architect) — this
  session's engine work was done directly rather than delegated, given how interdependent and
  correctness-sensitive the changes were; that was a deliberate per-task choice, not a reversal.
