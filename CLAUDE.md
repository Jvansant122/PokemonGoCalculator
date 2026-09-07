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
  the `add-scenario-assumption` skill whenever a new setting is added.
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
  `RELEASED_MEGA_PRIMAL_ALLOWLIST` in `scripts/sync-data.ts` is for — a hand-reviewed,
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
- `packages/web` — Vite + React + TypeScript UI, imports `@pogo-analyzer/engine` straight from
  its TS source. Owned by `web-developer` for features, `site-builder` for build/deploy. **Five**
  tab-switched views as of 2026-09-07 (`App.tsx`'s `view=` query param): the original two-candidate
  **Comparator**, the **Team Raid Simulator** (one trainer's own 6-slot sequential roster vs. a
  boss's real HP pool and countdown timer, with wipe-and-revive looping), the **Species
  Report** (one Pokémon ranked against every currently-active real raid boss), **IV
  Breakpoints** (one species/moveset compared across two IV spreads, per level, against a chosen
  raid boss — the IV/level-investment analogue of the ranking-flip thesis), and **Attack/Defense
  Breakpoints** (full IV × level damage grids, 0-15 IV × levels 50→25, for the species' own fast
  and charged moves or for the boss's incoming ones — the only tab with no simulation and no
  dodge model at all, deliberately: each cell *is* one hit). Each has its own shareable
  `Scenario`-family type and URL query param (`s` / `ts` / `sr` / `ivc` / `adb`) — don't conflate
  them.
- `data/` — the generalized game-data layer (`data/raw/`, `data/normalized/`), generated by
  `scripts/sync-data.ts`. Owned by `data-sync` — never hand-edit either directory. Since
  2026-09-06 the **primary** value source is a live GAME_MASTER dump (PokeMiners' mirror), not
  pogoapi.net; pogoapi's cached endpoints survive only as the released-content roster/allowlist
  and a per-species fallback. `scripts/sync-data.ts`'s own header comment is the authoritative
  description of that split — read it before assuming where a field comes from.

Deployed as a static site to **GitHub Pages** via `.github/workflows/deploy.yml`, live at
https://jvansant122.github.io/PokemonGoCalculator/. There is a **second** workflow —
`check-mega-gaps.yml`, a weekly diff of this project's mega/primal roster against Bulbapedia that
opens/updates a tracking issue on a detected gap. Scope any Actions API query to the specific
workflow (`actions/workflows/deploy.yml/runs`); an unscoped "latest run" can be the wrong one.

## Commands

```bash
npm install                          # from repo root, installs both workspaces
npm run test:engine                  # from repo root — runs packages/engine's vitest suite
npm run build --workspace=packages/web   # production build, verifies the deploy path
npm run sync-data                    # from repo root — refreshes data/raw + data/normalized
npm run check-scenario-roundtrip     # guards the "setting doesn't survive a shared link" bug class
npm run check-mega-gaps              # diffs the mega/primal roster against Bulbapedia (CI runs it weekly)
```

`check-scenario-roundtrip` is the mechanical half of the `add-scenario-assumption` skill: it
asserts every field of all five tabs' `Assumptions` interfaces appears in both round-trip
directions, and exits non-zero naming the field if not. Run it after adding any setting.

From inside `packages/engine` or `packages/web`: `npx tsc --noEmit -p tsconfig.json` to type-check.

**Windows/Node gotcha**: Node.js lives at `C:\Program Files\nodejs` but fresh shell processes in
this environment often don't have it on PATH. Prepend in PowerShell:
```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```
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

`.claude/skills/` has two project-specific skills: `verify-and-ship` (the test → typecheck →
build → commit → push → watch-deploy sequence run after every commit) and
`add-scenario-assumption` (the checklist referenced under "Standing decisions" above).
`.claude/settings.json` has one hook: a `PostToolUse` on `Edit|Write` that reruns
`npm run test:engine` automatically whenever the edited file is under
`packages/engine/src/**/*.ts`, surfacing a failure straight into the conversation.

## For session continuity

Four root-level docs, each with a distinct job — keep them in their lanes rather than letting one
absorb another:

- **`CLAUDE.md`** (this file) — durable architecture and standing decisions only. It's re-read by
  every session and every agent, so it pays its token cost constantly: keep the *rule*, cut the
  incident narrative once git history and `HANDOFF.md` own the story.
- **`HANDOFF.md`** — the point-in-time "what shipped, what's next," newest section first. Update
  it (don't just append) at the end of a session with meaningful unfinished work; it's the first
  place a fresh session looks.
- **`IDEAS.md`** — not-yet-scheduled feature ideas, barebones. Nothing here is committed work.
- **`PLAN_*.md`** — one self-contained implementation plan per not-yet-built feature, written for
  a fresh session to pick up cold. **Delete a `PLAN_*.md` once its feature ships** and record the
  resolution in `HANDOFF.md` — every one of these opens with "self-contained plan for a fresh
  session," so a shipped one left at the root reads as pending work.
