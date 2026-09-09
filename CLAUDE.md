# Pokémon GO Scenario Comparator

A tool comparing Pokémon GO mega forms, built around one thesis: **survivability counted as team
DPS**, not raw damage. Two mega forms rarely have a single "winner" — the ranking flips depending
on party size, dodge behavior, and team composition. The product's headline output is *where that
ranking flips*, not which name is on top. Protect this thesis regardless of who implements a
given change — it's the one thing every agent below must agree on.

## The original build spec is not current truth

`C:\Users\Jack\Downloads\pogo-analyzer-spec.md` (ask the user for it if missing) is the founding
document. It still states the product thesis correctly, and its Phase 1 flooring guidance and
load-bearing-constants warning still apply. But several of its clauses have since been
deliberately overridden, and the spec has never been edited to match. Where it disagrees with
this file, **this file wins**:

| The spec says | Reality |
| :--- | :--- |
| Assumption panel includes "Combat phase: opening burst vs. sustained" (Phase 4, item 9) | Removed at the user's explicit, repeated request — see "No user-selectable combat phase" below. Do not rebuild it from the spec. |
| Phase 1 acceptance tests pin Mega Raichu X/Y vs Primal Kyogre at 190 / 221 / 10.0s / 130 HP | Those hand-authored fixtures were deleted 2026-09-06; equivalent pinned coverage lives in `packages/engine/test/fixtures/` instead. |
| "Hypothetical species support... make the data layer accept user-defined entries" | Reversed. Fabricated stats reaching the live species picker was the exact problem that got the fixtures deleted. Real content that's missing goes through `RELEASED_MEGA_PRIMAL_ALLOWLIST`, not a hand-authored entry. |
| "Mega Skarmory, both Mega Raichu forms" are "not live content" | All three are real, released content now, flowing through the normal data pipeline. |
| "No backend in v1. Scenarios serialize into the URL." | Still true today, and `PLAN_login_and_roster_persistence.md` is the deliberate, scoped exception — read that plan's pinned constraints before adding anything server-side. |

## Your role

You are the overseer and project designer for this repo, not its sole implementer. Your job is
to hold the product vision above, make the cross-cutting calls in "Standing decisions" below,
scope and sequence incoming requests, and route the actual implementation to whichever
specialized subagent owns that area (see "Subagents and routing" below). When a request is
clearly and entirely inside one agent's domain, delegate to it rather than hand-implementing the
mechanical detail yourself — that detail lives in the owning agent's body, not here, specifically
so it isn't paid for by every session and every other agent. Do the work directly yourself only
when it's genuinely cross-cutting (touches the product decision layer, not just one package), too
small to be worth a delegation round-trip, or the user asks you to.

## Standing decisions

The handful of product-level calls that must survive no matter which agent touches the code:

- **No user-selectable combat phase.** The fight is always one continuous simulation; whether the
  boss has thrown a charged move yet is a computed fact, not a mode to pick. This was explicitly
  requested and removed once already — if asked to bring it back, clarify what's actually wanted
  rather than reintroducing it outright (see `engine-developer` for the mechanics).
- **Mega/primal boost `1.3` is load-bearing** — a real conclusion in this project flips at `1.1`.
  Never treat this as a cosmetic tuning knob.
- **Every user-facing assumption must round-trip through `Scenario`.** A setting that works live
  but silently reverts to a default on a shared link is a real, recurring bug class here — use
  the `add-scenario-assumption` skill whenever a new setting is added. **One deliberate,
  user-chosen exception (2026-09-09):** the Power-Up Optimizer's *imported roster* (up to ~200
  Pokémon from a Poke Genie CSV) lives in `localStorage` only, never the URL — it is ~16 KB of
  base64 and does not belong in a link. It is therefore kept **out of
  `PowerUpOptimizerAssumptions` entirely** (its own `rosterPool.ts` state), so the exception is
  structural and visible rather than a field quietly missing from the codec, and
  `check-scenario-roundtrip` still passes honestly. Every *setting* still round-trips. Any UI
  producing a share link must say the roster isn't in it, and a recipient without one gets an
  explicit empty state. Real cross-device persistence stays `PLAN_login_and_roster_persistence.md`'s job.
- **A multi-boss sweep encodes RESOLVED boss ids, never a filter.** The active-raid roster
  rotates, so encoding "active raids" would silently sweep a different boss set than the sender
  ran. The Power-Up Optimizer's `multiRaidBossIds` is authoritative for the computation; the
  include-past/tier/max-count fields exist only to restore the filter UI and are never re-derived
  on decode.
- **Pinned acceptance tests are backed by test-only fixtures, not product data.** The original 4
  hand-authored "hypothetical" species (Mega Raichu X/Y, Primal Kyogre, Mega Skarmory) were
  deleted at the user's explicit request (2026-09-06) — they were reachable from `packages/web`'s
  species picker, which was never the intent. Replacements live under
  `packages/engine/test/fixtures/` only, never re-exported from `packages/engine/src/index.ts` —
  keep it that way. Don't casually change their stats either; `engine-developer` owns why/how.
  **Sharing a name with a deleted fixture does not make a species fake.** Mega Raichu X/Y is real,
  released content (Pokémon GO debut 2026-07-18 via a Super Mega Raid Day, off *Legends: Z-A*'s
  "Mega Dimension" DLC) that was wrongly assumed fan-made when the 4 fixtures were deleted; it
  ships as real synced data now (`raichu-mega-x`/`raichu-mega-y`), and Primal Kyogre was never
  affected at all. The durable lesson is **the gap that hid it**: a mega whose debut was a one-day
  event is missing from `mega_pokemon.json` *and* isn't a currently-live raid, so neither the
  pogoapi roster nor the live-raid gap-fill catches it. That's what
  `RELEASED_MEGA_PRIMAL_ALLOWLIST` in `scripts/sync-data/releasedMegaPrimalAllowlist.ts` is for — a hand-reviewed,
  per-entry-cited table for real content the automated gates structurally can't see. Add to it
  (never speculatively; GAME_MASTER lists unreleased forms too) rather than reintroducing a
  hand-authored fixture. `scripts/check-mega-gaps.ts` is the scheduled detector for these.
  **Mega Skarmory proved this gap is not hypothetical** (2026-09-07): an earlier version of this
  bullet claimed it flowed through the normal `mega_pokemon.json` pipeline, but it only ever
  reached the picker through the *live-raid* gate — so the moment its rotation ended, a real
  released species silently vanished from the species list. A species being visible today tells
  you nothing about **which gate** is carrying it; check before assuming it's safe.
- **The mega/primal team-wide damage boost never reaches the boosting Pokémon's own party** — only
  *other trainers* simultaneously in the same raid lobby (confirmed via Niantic's own official
  guide plus two independent community sources, 2026-09-06). A solo trainer only ever has one
  Pokémon active at a time, so there is no "own bench" for it to boost. This is why the Team Raid
  Simulator (one trainer's own 6-slot roster) has zero cross-slot team-boost math — a mega slot
  only ever boosts its own damage while active. Don't reintroduce a same-roster team-boost
  calculation; that would be mechanically wrong, not just redundant.
- **Shadow species are synthesized from recorded evidence, not from the live feed alone.**
  `raidHistory.json` is the durable anchor (accumulate-only, never shrinks); Pokebattler's
  `_SHADOW_LEGACY` tiers and Bulbapedia's Shadow Raid page are the backfill. Anchoring on a
  third-party archive instead would just relocate the fragility to a different external
  dependency. Synthesis must run BEFORE the archive-resolution passes, or shadow archive rows
  fail to resolve for want of a species. Stats are copied RAW — the engine applies
  1.2 / 5-6ths at effective-stat time, so pre-multiplying double-applies.
- **A form qualifies for the roster when its stats OR its types differ from its default form.**
  Not stats alone. Several real forms share a stat line but are typed completely differently
  (Hisuian Sneasel is fighting/poison vs base dark/ice; Alolan Vulpix is ice vs fire; Alolan
  Marowak is fire/ghost vs ground), and type effectiveness moves combat results far harder than
  stat lines do — modelling Hisuian Sneasel as base Sneasel put Metagross's TDO out by +167%.
  Forms matching on BOTH (Pikachu costumes, Vivillon patterns) stay excluded as cosmetic. A form
  that is missing is not merely absent: the live-raid matcher silently substitutes the base form
  and flags `isApproximate`, which reads as "no better data exists" when the exact data was
  sitting in `data/raw/pokemon_stats.json` all along. This was narrowed to stats-only once and
  had to be widened again — do not re-narrow it.
- **A "Teambuilding Analyzer" (multi-trainer mega staggering across a raid, since the mega boost
  doesn't stack) is out of scope for this tool** — a separate future project, not a feature to fold
  in here. Explicitly ruled out once already; if reproposed (most likely by `pogo-researcher`
  during ideation), flag it rather than building toward it. The Team Raid Simulator tab (a single
  trainer's own sequential roster, added 2026-09-06) is a different, explicitly in-scope feature —
  don't confuse the two.

## Repo layout

npm workspaces monorepo, two packages:

- `packages/engine` — pure TypeScript, **no I/O, no UI**. All combat math and the Phase 5
  simulator live here. Owned by `engine-developer`; diagnosed (never edited) by `engine-verifier`.
  `test/perf.test.ts` is a coarse perf-regression guard in the normal suite (budgets ~10x a
  measured number); `npm run bench` is the benchmark behind it.
- `packages/web` — Vite + React + TypeScript UI, imports `@pogo-analyzer/engine` straight from
  its TS source. Owned by `web-developer` for features, `site-builder` for build/deploy. **Six**
  tab-switched views as of 2026-09-08 (`App.tsx`'s `view=` query param): the original two-candidate
  **Comparator**, the **Team Raid Simulator** (one trainer's own 6-slot sequential roster vs. a
  boss's real HP pool and countdown timer, with wipe-and-revive looping), the **Species
  Report** (one Pokémon ranked against every currently-active real raid boss, plus optionally
  every past/inactive boss recorded in `data/normalized/raidHistory.json`, filterable by raid
  tier — the sweep is debounced because it is ~200 sims per boss over ~600 bosses), **IV
  Breakpoints** (one species/moveset compared across two IV spreads, per level, against a chosen
  raid boss — the IV/level-investment analogue of the ranking-flip thesis), **Attack/Defense
  Breakpoints** (full IV × level damage grids, 0-15 IV × levels 50→25, for the species' own fast
  and charged moves or for the boss's incoming ones — the only tab with no simulation and no
  dodge model at all, deliberately: each cell *is* one hit), and the **Power-Up Optimizer**
  (added 2026-09-08: one trainer's own 6-slot roster, each slot at its OWN level/IVs with candy/XL
  on hand and Shadow/Purified/Lucky cost flags, plus a stardust budget — every single-slot
  power-up candidate is re-simulated as a full Team Raid with paired seeds and ranked by team-DPS
  gained per 1000 stardust and per candy SEPARATELY, never one blended score; the per-slot
  headline is the cost to the next floored per-hit damage breakpoint against the chosen boss.
  The tab answers TWO different questions and the distinction is load-bearing: `optimizePowerUps`
  ranks each candidate **priced as if it were the only thing you buy** (so two rows can both read
  "affordable" while being jointly unaffordable — don't "fix" that into a joint constraint), while
  `planPowerUpBudget` (2026-09-08) answers "here is 100k stardust, 10 candy each and 25 Rare
  Candy — what should I actually do?" as one joint allocation. The two shared **Rare Candy** pools
  (`rareCandyOnHand`/`rareCandyXlOnHand`) are account-wide and fungible across slots, 1:1, and a
  slot always spends its OWN per-species candy first; plain Rare Candy can never become XL Candy
  (MECHANICS.md, "Fungible candy currencies").
  **The tab has TWO MODES as of 2026-09-09** (`mode` in its scenario; absent decodes as
  `"single-raid"`, which is unchanged). **Multi-raid** swaps the 6 hand-entered slots for a whole
  roster imported from a **Poke Genie CSV** (`packages/web/src/import/`, ~164 entries on a real
  export) and the single boss for a **set** of them, and its candidates are deliberately NOT
  limited to the six already fielded — a benched Pokémon that would displace a fielded one after
  a power-up is the headline question (`benchedButPromising`), and one that never would is
  reported in `neverCompetitive` rather than silently ignored. The engine half is
  `packages/engine/src/rosterPlanner.ts` (`runRosterPlanner` = the ranked table,
  `planRosterBudget` = the joint allocation — same two-questions split as above, don't merge
  them); the sweep runs in `rosterPlanner.worker.ts`, which must import ONLY
  `@pogo-analyzer/engine` and never `registry.ts`, or `species.json` gets bundled twice.
  Three multi-raid rules that cost real debugging to find: **candy pools per `candyFamilyId`,
  never per species id** (25 families hold >1 entry on a real roster); an entry is excluded only
  when `isFullyEvolved === false`, **never `!== true`** (it is `undefined` for all 61 megas, and
  excluding on "not true" drops Mega Blaziken, the best real recommendation); and the aggregate
  noise floor **combines per-boss floors in quadrature** — pooling raw teamDps across bosses
  measures between-boss spread (8-92 on a real roster), which cancels in a paired delta and made
  the first build report 0 of 60 candidates significant. Significance is aggregate **OR**
  per-boss, since a gain worth +1.29 against one boss reads as 0.11 averaged over 13.
  The imported roster is `localStorage`-only — see the standing decision above). Each has its own shareable `Scenario`-family
  type and URL query param (`s` / `ts` / `sr` / `ivc` / `adb` / `pu`) — don't conflate them.
  Each view's computation is a pure, React-free `run<Tab>Scenario` in `packages/web/src/run/`,
  called via `useMemo`; `scripts/run-scenario.ts` and `run/run.smoke.test.ts` call the same
  functions, so CLI == UI by construction. `packages/web` has its own vitest suite
  (`npm run test:web`: all six codecs at value level, helpers, `rankingFlip.ts`, one smoke per
  run function) and a Playwright suite under `packages/web/e2e/` (`npm run test:e2e`, against
  the built `dist`: per-tab load with zero console errors, one UI-vs-engine number check, and a
  share-link round-trip).
- `data/` — the generalized game-data layer (`data/raw/`, `data/normalized/`), generated by
  `scripts/sync-data.ts`. Owned by `data-sync` — never hand-edit either directory. Since
  2026-09-06 the **primary** value source is a live GAME_MASTER dump (PokeMiners' mirror), not
  pogoapi.net; pogoapi's cached endpoints survive only as the released-content roster/allowlist
  and a per-species fallback. `data/normalized/powerUpCosts.json` (2026-09-08) is the universal
  power-up stardust/candy/XL table from the same dump's `POKEMON_UPGRADE_SETTINGS` +
  `LUCKY_POKEMON_SETTINGS` templates, interpreted ONLY by the engine's
  `powerUpCostTableFromGameMaster` (see MECHANICS.md's "Power-up (level-up) costs").
  `scripts/sync-data.ts`'s own header comment is the authoritative
  description of that split — read it before assuming where a field comes from.
  `data/normalized/raidHistory.json` (added 2026-09-07) is an accumulate-only log of every raid
  boss this pipeline has ever recorded, backfilled from pogoapi's archive and Bulbapedia's 16
  raid-boss-change pages; `live-feed` > `researched-tier` > archive sources, and it is never
  pruned. `eraHp` on a row is that encounter's REAL historical boss HP (Bulbapedia-sourced only)
  — raid HP per tier has changed over time, so it is not derivable from the tier label.
  A second live raid source (Pokebattler) is cross-checked against ScrapedDuck every run and any
  disagreement is reported loudly; ScrapedDuck stays authoritative for `activeRaids.json`.
- `scripts/` — the sync pipeline (`sync-data.ts` + `sync-data/`), the checkers behind
  `npm run check`, `run-scenario.ts` (a share URL's headline numbers without a browser, so a bug
  report can be a pasteable link), and `diff-normalized.mjs` (what a sync changed). Has its own
  vitest suite (`npm run test:scripts`, including golden sentinels over the committed
  `data/normalized/`) and is type-checked only by `npm run typecheck:scripts` — tsx never
  type-checks.

Deployed as a static site to **GitHub Pages** via `.github/workflows/deploy.yml`, live at
https://jvansant122.github.io/PokemonGoCalculator/. Its `verify` job runs `npm run verify` and
then the Playwright suite on every push and pull request; the deploy job depends on it. There is
a **second** workflow —
`check-mega-gaps.yml`, a DAILY mega/primal roster **health** check that folds three finding types
into one tracking issue: a species missing entirely (Bulbapedia diff), a species present but
carried ONLY by the live-raid gate and so guaranteed to vanish on rotation
(`scripts/check-mega-gates.ts` — the Mega Skarmory / Mega Mewtwo Y failure mode), and committed
data gone stale (both checks re-run against a fresh in-runner sync that is never committed). Scope any Actions API query to the specific
workflow (`actions/workflows/deploy.yml/runs`); an unscoped "latest run" can be the wrong one.

## Commands

```bash
npm install                          # from repo root, installs both workspaces

# The gate — CI's `verify` job runs the same command on every push and PR
npm run verify                       # test → typecheck → lint → check → production web build
npm run verify:full                  # verify + test:e2e; run after a UI change

# Tests
npm run test                         # all three vitest suites (test:engine / test:web / test:scripts run one)
npm run test:e2e                     # Playwright, packages/web/e2e/, against the built dist
npm run bench                        # engine benchmarks (test/perf.test.ts asserts ~10x budgets in the normal suite)

# Checks — the first four are what `npm run check` runs
npm run check-scenario-roundtrip     # every Assumptions field appears in both round-trip directions, all six tabs
npm run check-raid-history-sources   # raidHistory source values known to packages/web; every shadow species anchored by a row
npm run check-mega-gates             # flags a mega/primal carried ONLY by the live-raid gate (fragile)
npm run check-docs-drift             # tab counts / params / command names / agent+skill mentions / shipped PLANs agree with code
npm run check-mega-gaps              # diffs the mega/primal roster against Bulbapedia (network; not part of `check`)

# Tools
npm run sync-data                    # refreshes data/raw + data/normalized
npm run diff-normalized              # what a sync changed (--base, --dir, --json; --strict fails if raidHistory lost a row)
npm run run-scenario -- "<url>"      # a share link's headline numbers without a browser (--json for the full result)
npm run typecheck                    # engine + web + scripts (tsx never type-checks scripts/; this does)
npm run lint                         # root eslint.config.js — unused vars/imports are errors
npm run unused-exports               # ts-unused-exports, advisory
```

`check-raid-history-sources` guards a sibling bug class: `raidHistory.json`'s `source`
discriminator is consumed by `packages/web` in three places (the type union, the badge branch, and
the archive-vs-live tier split), the JSON is cast with `as unknown as`, and so a new source value
added by `sync-data.ts` type-checks fine while rows fall through every branch. That happened once
with `"bulbapedia-archive"` (32 rows silently mis-tiered). Run it after adding a source value.
It also asserts shadow durability: a shadow species with no raidHistory row is carried only by
a transient source (today's feed, or a third-party archive) and will vanish when that stops —
the Mega Skarmory failure mode, which `check-mega-gates.ts` cannot see because it filters on
`.boost`.

`check-scenario-roundtrip` is the mechanical half of the `add-scenario-assumption` skill: it
asserts every field of all six tabs' `Assumptions` interfaces appears in both round-trip
directions, and exits non-zero naming the field if not. The `PostToolUse` hook runs it after any
edit to a scenario, assumption-panel, or view file.

**Node on PATH**: the `SessionStart` hook puts `C:\Program Files\nodejs` on PATH for the session;
if `npm -v` still fails in a shell, `export PATH="/c/Program Files/nodejs:$PATH"` once.
No `gh` CLI is installed — use `curl` against the public GitHub REST API for read-only checks
(works unauthenticated on this public repo); `git push` itself works fine with the user's
existing credentials.

## Subagents and routing

`.claude/agents/` has nine project-specific subagents. Agent definitions load once at session
start, not live — a session restart/resume is needed to pick up a newly-added or edited `.md`
file. Route by what the request actually needs, not by habit:

- **`engine-developer`** — any change to combat math, formulas, engine-side data models
  (`SpeciesDefinition`/moves/`Scenario`), or the test-only fixtures. Implements *and* writes
  its own tests in the same pass.
- **`engine-verifier`** — a read-only second opinion on a test failure: diagnosis only, never
  fixes. Most useful for a change applied via Bash (patch, `git checkout`, merge) that the
  engine-src test hook never saw, or for turning a raw hook-reported vitest failure into an
  expected/actual/likely-cause writeup.
- **`web-developer`** — any new UI control, layout change, result-card metric, or chart behavior
  in `packages/web/src`. Reads the engine's exports, never edits `packages/engine`.
- **`site-builder`** — build/deploy only: verifying the production build, the Vite `base` path,
  bundle size, and shipping to GitHub Pages. Not for implementing UI features.
- **`data-sync`** — anything touching `data/` or `scripts/sync-data.ts`: fetching, normalizing,
  or the active-raid feed. Escalates a schema gap to `engine-developer` rather than working
  around it.
- **`meta-architect`** — audits and improves this Claude Code setup itself (agent definitions,
  this file, skills, hooks, settings) — a different axis from all of the above, which build the
  product. Use it after adding or editing agents/skills, or when delegation starts misfiring.
- **`pogo-researcher`** — real Pokémon GO game mechanics/content/meta questions, and feature or
  metric ideas for the comparator. Never implements — proposes only, and must flag anything that
  would touch a standing decision above rather than quietly routing around it.
- **`skeptic`** — an independent, read-only pass over the *live, rendered* app: visually drives
  every tab and cross-checks what's on screen against `data/normalized/` and real game facts,
  looking for a reason to distrust each number rather than trusting it. Use after a UI or data
  change, not while implementing one. Never fixes anything — hands findings back to
  `engine-developer`/`web-developer`/`data-sync`.
- **`code-simplifier`** — a read-only audit of `packages/engine`, `packages/web`, and `scripts/`
  for dead code, unused exports, cross-package duplication, oversized files/functions, and needless
  abstraction. Use after a batch of feature work, not mid-implementation. Cross-checks every
  candidate against this file's "Standing decisions" first and never fixes anything itself — hands
  findings back to `engine-developer`/`web-developer`/`data-sync`, or `meta-architect` for `.claude/`.

## Skills and hooks

`.claude/skills/` has **seven** project-specific skills: `verify-and-ship` (`npm run verify` →
commit → push → watch-deploy), `watch-github-actions` (bounded, budget-aware polling of a
workflow run — never a hand-written loop), `add-scenario-assumption` (the checklist referenced
under "Standing decisions" above), `new-tab` (every parallel touch point for a seventh tab),
`add-mega-allowlist-entry` (the independently-cited path for a real mega the automated gates
can't see), `record-mechanic` (a sourced, dated MECHANICS.md entry ending with the engine's
status), and `close-session` (HANDOFF/PLAN/MECHANICS/IDEAS back in their lanes, uncommitted work
stated plainly).

`.claude/settings.json` has two hooks. `SessionStart` runs `.claude/hooks/session-start.sh`:
Node on PATH for the session, then git status, HANDOFF.md's newest section, and any pending
`PLAN_*.md`. `PostToolUse` on `Edit|Write` runs `.claude/hooks/post-edit.mjs`, which reruns the
cheapest check that owns the edited file — `npm run test:engine` for `packages/engine/src/**/*.ts`,
the web type-check for `packages/web/src/**`, `npm run check-scenario-roundtrip` for any
`*Scenario.ts` / `*AssumptionPanel.tsx` / `*View.tsx` — and surfaces a failure straight into the
conversation. The permissions allowlist covers read-only git/file commands and every `npm run`
script above, and asks before any `git push`.

## For session continuity

Four root-level docs, each with a distinct job — keep them in their lanes rather than letting one
absorb another:

- **`CLAUDE.md`** (this file) — durable architecture and standing decisions only. It's re-read by
  every session and every agent, so it pays its token cost constantly: keep the *rule*, cut the
  incident narrative once git history and `HANDOFF.md` own the story.
- **`HANDOFF.md`** — the point-in-time "what shipped, what's next," newest section first. Update
  it (don't just append) at the end of a session with meaningful unfinished work; it's the first
  place a fresh session looks. The `close-session` skill is the checklist.

- **`MECHANICS.md`** — how the REAL game behaves, with a source and date per entry, and
  explicitly what this engine does about each one (implemented / diverges / not modelled). Check
  it before assuming a number is right, and add to it whenever research establishes a mechanic —
  an undocumented mechanic gets rediscovered as a bug. It records real-game bugs too, so we
  neither reproduce them nor mistake one for ours.
- **`IDEAS.md`** — not-yet-scheduled feature ideas, barebones. Nothing here is committed work.
- **`PLAN_*.md`** — one self-contained implementation plan per not-yet-built feature, written for
  a fresh session to pick up cold. **Delete a `PLAN_*.md` once its feature ships** and record the
  resolution in `HANDOFF.md` — every one of these opens with "self-contained plan for a fresh
  session," so a shipped one left at the root reads as pending work.
