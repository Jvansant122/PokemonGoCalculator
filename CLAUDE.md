# Pokémon GO Scenario Comparator

Build spec: `C:\Users\Jack\Downloads\pogo-analyzer-spec.md` (or ask the user for it if missing).

A tool comparing hypothetical Pokémon GO mega forms, built around one thesis: **survivability
counted as team DPS**, not raw damage. Two mega forms rarely have a single "winner" — the
ranking flips depending on party size, dodge behavior, and combat phase. The product's headline
output is *where that ranking flips*, not which name is on top.

## Repo layout

npm workspaces monorepo, two packages:

- `packages/engine` — pure TypeScript, **no I/O, no UI**. Runs standalone from Node with no
  browser. All combat math, breakpoint solvers, and the Phase 5 simulator live here.
- `packages/web` — Vite + React + TypeScript UI. Imports `@pogo-analyzer/engine` directly from
  its TS source (via package.json `exports`). No charting library — the crossover chart is
  hand-rolled inline SVG.

Deployed as a static site to **GitHub Pages** via `.github/workflows/deploy.yml` (build on push
to `main`, Pages source is configured as "GitHub Actions" in repo settings). Live at
https://jvansant122.github.io/PokemonGoCalculator/. Vite `base` is `/PokemonGoCalculator/` when
`GITHUB_PAGES=true` (set by the workflow), `/` otherwise for local dev.

## Commands

```bash
npm install                          # from repo root, installs both workspaces
npm run test:engine                  # from repo root — runs packages/engine's vitest suite
npm run build --workspace=packages/web   # production build, verifies the deploy path
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

## Architecture (Phase 1-5, per the build spec)

- **Stats** (`stats.ts`): `effectiveStat(base, iv, cpm)` applies `FLOOR()` **exactly once** —
  this is the single most important invariant in the engine. A second flooring anywhere
  downstream silently skews breakpoint results low. If a numeric result looks slightly off,
  check here first.
- **Damage** (`damage.ts`): standard raid formula, all modifiers (STAB, type effectiveness,
  weather, mega boost, best-buddy) are named inputs — no magic numbers at call sites.
- **Energy** (`energy.ts`): energy comes from BOTH the attacker's own fast moves AND damage
  taken (`ENERGY_PER_DAMAGE_TAKEN = 0.5`). This is not optional — it's why a fragile attacker can
  land a charged attack purely from being hit.
- **Type chart** (`typeChart.ts`): dual-typing stacks multiplicatively across both of a
  defender's types (current-gen multipliers: 1.6 / 0.625 / 0.390625, not 2/0.5/0.25).
- **Raid bosses** (`raidBoss.ts`): modeled as species whose "base stats" are already their
  effective stats, combined with `iv=0` and `RAID_BOSS_CPM=1.0` — reuses the one stat pipeline
  instead of forking a second code path for bosses.
- **Combat** (`combat.ts`, Phase 1): `simulateOpeningBurst` — deterministic, boss uses only its
  fast move (the "opening burst" window before a boss starts throwing charged moves).
- **Breakpoints** (`breakpoints.ts`, Phase 2): `findFastMoveBreakpoints` (damage breakpoint
  table) and `timeToFaint`/`timeToFaintTable` (survivability, with a `DodgeBehavior` model).
  `DODGE_WINDOW_SECONDS = 0.7` documents that a dodge is a timed action, not a standing shield.
- **Uptime/crossover** (`uptime.ts`, Phase 3): `convertUptimeToTeamDamage` (default mega boost
  `1.3` — **load-bearing**, at `1.1` a real conclusion in this project has flipped) and
  `findCrossoverPartySize`.
- **Comparison** (`comparison.ts`): `runComparison` (opening-burst, single point estimate) and
  `runSustainedComparison` (Phase 5, returns a distribution). Single code path shared by tests
  and the web UI so "what the tool concludes" can't drift between the two.
- **Stepwise simulator** (`simulate.ts`, Phase 5): 100ms-tick simulator. Boss charged-move timing
  is randomized (`chargedMoveMeanIntervalSeconds` ± 40% jitter via a seeded mulberry32 PRNG, so
  runs are reproducible per-seed) — `runStepwiseDistribution` runs many seeds and reports a
  distribution (mean/median/p10/p90, fraction dying mid-animation), never a point estimate.
  **Any boss hit (fast or charged) landing while the attacker is mid-own-charged-move-animation
  always deals full damage, regardless of the configured `DodgeBehavior`** — a dodge can't be
  re-thrown mid-cast, and its ~0.7s window couldn't cover a multi-second animation anyway. Do
  not "fix" this by letting dodge reduce damage in that window; it was deliberately corrected
  from an earlier bug (see git history / HANDOFF.md).
- **GameMaster data loader** (`gamemaster.ts`): accepts pogoapi.net-shaped JSON
  (`pokemon_id`/`pokemon_name`/`base_attack`/`base_defense`/`base_stamina`/`form`) via
  `fromGameMaster`, plus a `SpeciesRegistry` that merges real and user-defined hypothetical
  entries (`registerHypothetical` flags them `isHypothetical: true`). **Not yet exercised
  against real fetched data or tested** — see HANDOFF.md.
- **Scenarios** (`scenario.ts`): the full input set (`candidates`, `target`, `level`, `ivs`,
  `dodgeModel`, `partySize`, `teammateDps`, `teammateTypeMatches`, `phase`) serializes to a
  base64url string in the URL. If you add a new user-facing assumption to the web UI, **you
  must add it to the `Scenario` interface too** — a missing field silently reverts to a default
  on a shared link instead of erroring (this exact bug happened once already).

## Fixtures (`fixtures/scenarioA.ts`)

All species are hypothetical (not live Pokémon GO content) — Mega Raichu X/Y, Primal Kyogre,
Mega Skarmory. Base stats were hand-derived to reproduce the spec's pinned acceptance numbers
exactly (see `test/scenarioA.test.ts` for the full derivation). **Do not casually change these
values** — if a refactor breaks the acceptance tests below, the flooring stage in `stats.ts` is
the first place to look, per the spec's own instruction.

### Pinned acceptance numbers (Scenario A: Mega Raichu X/Y vs Primal Kyogre, level 35, no dodge)
- Both ~130 HP at perfect stamina IV.
- Fast-move damage: X=4, Y=5, constant across attack IV 13-15.
- Both survive exactly 10.0s, land exactly 1 charged attack: X=190 damage, Y=221 damage
  (16.32% delta).

Mega Raichu X carries dual Electric/Steel typing (Y is pure Electric) — this doesn't touch a
single Scenario A number (Water is neutral to both types) but gives X a genuine, type-chart-
driven survivability edge against Flying attackers (Mega Skarmory, Scenario B), which is what
produces an actual crossover in the team-contribution chart.

## Custom subagents

`.claude/agents/` has 6 project-specific subagents (`assumption-auditor`, `data-sync`,
`engine-verifier`, `matchup-analyst`, `meta-architect`, `site-builder`) the user added mid-project.
**As of the last session, the user asked not to use them** — do product work directly unless
asked to route through them again. If asked to use them, they require a session
restart/resume to pick up newly-added or edited `.md` files (agent definitions load once at
session start, not live).

## For session continuity

See `HANDOFF.md` for the specific state of in-progress work as of the last session — update it
(don't just append) at the end of a session if there's meaningful unfinished work, since it's the
one place a fresh session will look first.
