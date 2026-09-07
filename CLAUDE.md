# Pokémon GO Scenario Comparator

Build spec: `C:\Users\Jack\Downloads\pogo-analyzer-spec.md` (or ask the user for it if missing).

A tool comparing hypothetical Pokémon GO mega forms, built around one thesis: **survivability
counted as team DPS**, not raw damage. Two mega forms rarely have a single "winner" — the
ranking flips depending on party size, dodge behavior, and team composition. The product's
headline output is *where that ranking flips*, not which name is on top. Protect this thesis
regardless of who implements a given change — it's the one thing every agent below must agree on.

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
  **Correction (2026-09-06, same day):** Mega Raichu X/Y is NOT hypothetical — Raichu got a real
  Mega Evolution via *Pokémon Legends: Z-A*'s "Mega Dimension" DLC, and it already debuted in
  Pokémon GO on 2026-07-18 via a Super Mega Raid Day. It was wrongly assumed fan-made when the 4
  fixtures above were deleted; the assumption was wrong, not the deletion (getting fabricated
  stats out of the live picker was still correct) — the fix is real synced data, not restoring the
  hand-authored fixture. It's absent from the picker only because it fell through a real gap:
  pogoapi.net's `mega_pokemon.json` hasn't added it, and it's no longer a *currently active* raid
  (one-day event, already over) so the existing GAME_MASTER gap-fill — gated on "is this raid live
  right now" — never fires for it. `data-sync` is adding it as real data (GAME_MASTER already has
  well-formed stats for it: Mega X 277/203/155 atk/def/sta, Mega Y 339/157/155, both pure Electric,
  300 first-time/60 subsequent mega energy). Mega Skarmory and Primal Kyogre were never actually
  affected by this mistake — both already flow through as real species via the normal
  mega_pokemon.json/GAME_MASTER pipeline independent of their same-named test fixtures.
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
  its TS source. Owned by `web-developer` for features, `site-builder` for build/deploy. Four
  tab-switched views as of 2026-09-06 (`App.tsx`'s `view=` query param): the original two-candidate
  **Comparator**, the **Team Raid Simulator** (one trainer's own 6-slot sequential roster vs. a
  boss's real HP pool and countdown timer, with wipe-and-revive looping), the **Species
  Report** (one Pokémon ranked against every currently-active real raid boss), and **IV
  Breakpoints** (one species/moveset compared across two IV spreads, per level, against a chosen
  raid boss — the IV/level-investment analogue of the ranking-flip thesis). Each has its own
  shareable `Scenario`-family type and URL query param (`s` / `ts` / `sr` / `ivc`) — don't conflate
  them.
- `data/` — the generalized game-data layer (`data/raw/`, `data/normalized/`), generated by
  `scripts/sync-data.ts`. Owned by `data-sync` — never hand-edit either directory.

Deployed as a static site to **GitHub Pages** via `.github/workflows/deploy.yml`, live at
https://jvansant122.github.io/PokemonGoCalculator/.

## Commands

```bash
npm install                          # from repo root, installs both workspaces
npm run test:engine                  # from repo root — runs packages/engine's vitest suite
npm run build --workspace=packages/web   # production build, verifies the deploy path
npm run sync-data                    # from repo root — refreshes data/raw + data/normalized
```

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
  (`SpeciesDefinition`/moves/`Scenario`), or the hypothetical fixtures. Implements *and* writes
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
- **`skeptic`** — an independent, read-only pass over the *live, rendered* app: visually drives all
  four tabs and cross-checks what's on screen against `data/normalized/` and real game facts,
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

See `HANDOFF.md` for the specific state of in-progress work as of the last session — update it
(don't just append) at the end of a session if there's meaningful unfinished work, since it's the
one place a fresh session will look first.
