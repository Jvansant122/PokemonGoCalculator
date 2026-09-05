# Pokémon GO Scenario Comparator

Build spec: `C:\Users\Jack\Downloads\pogo-analyzer-spec.md` (or ask the user for it if missing).

A tool comparing hypothetical Pokémon GO mega forms, built around one thesis: **survivability
counted as team DPS**, not raw damage. Two mega forms rarely have a single "winner" — the
ranking flips depending on party size, dodge behavior, and team composition. The product's
headline output is *where that ranking flips*, not which name is on top.

There is no user-selectable "combat phase" (opening-burst vs sustained) in the web UI — every
fight is one continuous simulation (`runSustainedComparison`), and whether the boss has thrown a
charged move yet is a computed fact (`bossChargedMoveReadySeconds`), not a mode to pick. An
earlier version exposed that as a toggle; it was removed on request ("should be insinuated in
calculations based on energy... not a tab toggle-able by user input"). The deterministic
opening-burst-only engine path (`combat.ts`'s `simulateOpeningBurst`, `comparison.ts`'s
`runComparison`) still exists and is still what the pinned Scenario A acceptance numbers are
tested against — it's just not wired into the live web UI anymore.

## Repo layout

npm workspaces monorepo, two packages:

- `packages/engine` — pure TypeScript, **no I/O, no UI**. Runs standalone from Node with no
  browser. All combat math, breakpoint solvers, and the Phase 5 simulator live here.
- `packages/web` — Vite + React + TypeScript UI. Imports `@pogo-analyzer/engine` directly from
  its TS source (via package.json `exports`). No charting library — all charts are hand-rolled
  inline SVG.
- `data/` — the generalized game-data layer (see "Data layer" below): `data/raw/` (cached
  fetch responses) and `data/normalized/` (`species.json`, `activeRaids.json`, consumed by
  `packages/web/src/registry.ts`). Regenerate with `npm run sync-data` (root); never hand-edit.
- `scripts/sync-data.ts` — the fetch/normalize script (run via `tsx`), importing
  `fromGameMaster`/`fromGameMasterMove` from `@pogo-analyzer/engine` so there's one transform,
  not a duplicated one in the script.

Deployed as a static site to **GitHub Pages** via `.github/workflows/deploy.yml` (build on push
to `main`, Pages source is configured as "GitHub Actions" in repo settings). Live at
https://jvansant122.github.io/PokemonGoCalculator/. Vite `base` is `/PokemonGoCalculator/` when
`GITHUB_PAGES=true` (set by the workflow), `/` otherwise for local dev.

## Commands

```bash
npm install                          # from repo root, installs both workspaces
npm run test:engine                  # from repo root — runs packages/engine's vitest suite
npm run build --workspace=packages/web   # production build, verifies the deploy path
npm run sync-data                    # from repo root — refreshes data/raw + data/normalized from pogoapi.net/ScrapedDuck
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
  fast move (the "opening burst" window before a boss starts throwing charged moves), and
  returns `ownDamageTrajectory` (cumulative own damage over time, not just a final total) for
  the web UI's damage-over-time chart. Also exports `bossChargedMoveReadySeconds(fastMove,
  chargedMove, startingEnergy?)` — the single source of truth for how long a boss's own fast
  move takes to generate enough energy for its first charged move (a **lower bound**: it doesn't
  model bosses gaining energy from damage taken, so real timing can only be sooner, never
  later). `runComparison`/`runSustainedComparison` (comparison.ts) both default to this instead
  of a fixed number — do not reintroduce a fixed opening-burst-window default; it was replaced
  because a small hardcoded/user-typed window both misrepresented the mechanic and caused
  degenerate all-zero sustained-fight output. `startingEnergy` models a mega tagging in
  mid-fight against a boss an earlier trainer left partway charged (the web UI's "boss starts
  primed" toggle).
- **Breakpoints** (`breakpoints.ts`, Phase 2): `findFastMoveBreakpoints` (damage breakpoint
  table) and `timeToFaint`/`timeToFaintTable` (survivability, with a `DodgeBehavior` model).
  `DODGE_WINDOW_SECONDS = 0.7` documents that a dodge is a timed action, not a standing shield.
  `DodgeBehavior` (`none`/`perfect`/`percentage-missed`) governs dodging the boss's **CHARGED**
  attacks only — dodging fast attacks is a separate plain boolean (`dodgeFastAttacks`, no
  percentage-missed variant) wherever `DodgeBehavior` is consumed, since "dodge every fast
  attack" is a yes/no decision, not a skill dial. **`DODGE_COST_SECONDS = 0.5`**: every dodge
  *attempt* (hit or miss, either kind) costs this much of the attacker's own attack cycle,
  pushing its next fast move later — dodging is not free, and dodging fast attacks especially
  is usually not worth the DPS loss. No attempt (and no cost) happens while mid-own-animation.
- **Uptime/crossover** (`uptime.ts`, Phase 3): `convertUptimeToTeamDamage` (default mega boost
  `1.3` — **load-bearing**, at `1.1` a real conclusion in this project has flipped) and
  `findCrossoverPartySize`. The mega/primal boost is **not all-or-nothing by type**: every
  teammate gets at least `OFF_TYPE_MEGA_BOOST_MULTIPLIER = 1.1` regardless of type match; only
  teammates matching the boosted type get the full `boostMultiplier`. An earlier version gave
  off-type teammates `1` (no boost at all) — a real bug, fixed. `matchingTeammateCount` (an
  absolute count, 0..`teammateCount`) replaced a single party-wide `typeMatches: boolean`, since
  real teams are rarely all-or-nothing on type. `findCrossoverPartySize` takes a *fraction*
  instead (it sweeps party size, where an absolute count doesn't scale sensibly).
- **Comparison** (`comparison.ts`): `runComparison` (opening-burst, single point estimate,
  **not used by the live web UI**, only tests) and `runSustainedComparison` (Phase 5, returns a
  distribution — the only path the web UI drives). Both take `dodgeFastAttacks?: boolean`
  alongside `dodge`; `runSustainedComparison` also takes `holdChargedMoveUntilSafe?: boolean`
  (see below). Each candidate's own fast move ALSO deals damage to the boss now, tracked as
  `ownFastMoveDamage`/`totalFastMoveDamage` alongside the existing charged-only
  `ownChargedDamage`/`totalChargedDamage` — `ownTotalDamage` (charged+fast combined) is what
  feeds `uptime.ts`'s crossover/team-contribution math and the damage-over-time chart, not
  charged-only. **Fast and charged moves get their own `fastDamageOut`/`chargedDamageOut`** (STAB
  + type-effectiveness computed per-move-type) — an earlier version shared one `damageOut` built
  from the fast move's type for both, invisible in every fixture because Scenario A's fast and
  charged moves happen to both be Electric, but wrong for any species whose two moves differ in
  type (very common on real species). Single code path shared by tests and the web UI so "what
  the tool concludes" can't drift between the two.
- **Stepwise simulator** (`simulate.ts`, Phase 5): 100ms-tick simulator. Boss charged-move timing
  is randomized (`chargedMoveMeanIntervalSeconds` ± 40% jitter via a seeded mulberry32 PRNG, so
  runs are reproducible per-seed) — `runStepwiseDistribution` runs many seeds and reports a
  distribution (mean/median/p10/p90, fraction dying mid-animation), never a point estimate, plus
  `representativeRun` (the seed-1 run, full `StepwiseRunResult` including `ownDamageTrajectory`)
  so the UI has one concrete reproducible trajectory to chart alongside the distribution.
  `DEFAULT_STEPWISE_MAX_SECONDS = 180` is the single source of truth for how long a run
  simulates when not overridden — raised from an earlier 60 specifically so this can't silently
  truncate a real fight; there is no user-facing "simulated fight length" input anymore, it's
  computed from the results (longest-surviving candidate) for display instead.
  **Any boss hit (fast or charged) landing while the attacker is mid-own-charged-move-animation
  always deals full damage, regardless of the configured `DodgeBehavior`** — a dodge can't be
  re-thrown mid-cast, and its ~0.7s window couldn't cover a multi-second animation anyway. Do
  not "fix" this by letting dodge reduce damage in that window; it was deliberately corrected
  from an earlier bug (see git history / HANDOFF.md).
  `StepwiseAttacker.holdChargedMoveUntilSafe` (default false): instead of firing the instant
  energy allows, hold it (energy capped at `MAX_ENERGY = 100`, see `energy.ts`, while waiting)
  until either the attacker just successfully dodged one of the boss's **charged** hits (the
  safe-window trigger — least likely for your cast to overlap the boss's next hit right after
  you've just avoided the last one) or energy hits the cap (forced, so further fast-move energy
  gain isn't wasted). With no dodging configured, only the cap-forced path ever fires it.
- **GameMaster data loader** (`gamemaster.ts`): accepts pogoapi.net-shaped JSON
  (`pokemon_id`/`pokemon_name`/`base_attack`/`base_defense`/`base_stamina`/`form`) via
  `fromGameMaster`, plus a `SpeciesRegistry` that merges real and user-defined hypothetical
  entries (`registerHypothetical` flags them `isHypothetical: true`). Now exercised for real:
  `scripts/sync-data.ts` calls it against live pogoapi.net data to build `data/normalized/
  species.json` (1000+ real species, including 48 real mega/primal attackers from
  `mega_pokemon.json` — **every one of those must have `boost` set explicitly**, since
  `comparison.ts` only applies the mega multiplier when `species.boost` is present; the fallback
  is 1, not `DEFAULT_MEGA_BOOST_MULTIPLIER` — this bit the first sync pass and was fixed in
  `scripts/sync-data.ts`, not silently worked around). `packages/web/src/registry.ts` merges
  this with the hand-defined hypothetical fixtures at app startup.
- **Scenarios** (`scenario.ts`): the full input set (`candidates`, `target`, `level`, `ivs`,
  `dodgeModel`, `dodgeFastAttacks`, `holdChargedMoveUntilSafe`, `minFightLengthSeconds`,
  `partySize`, `teammateDps`, `matchingTeammateCount`, `bossChargedMoveFrequencySeconds`,
  `bossStartsPrimed`, `bossStartingEnergyFraction`) serializes to a base64url string in the URL.
  No `phase` field — see the combat-phase note at the top of this file. If you add a new
  user-facing assumption to the web UI, **you must add it to the `Scenario` interface too** — a
  missing field silently reverts to a default on a shared link instead of erroring (this exact
  bug happened more than once: `teammateTypeMatches`'s successor `matchingTeammateCount`, and
  `bossChargedMoveFrequencySeconds`).

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
produces an actual crossover in the damage-over-time chart at some assumption combinations (not
all — the sensitivity panel reports "no flip" when the current inputs are far from one).

These 4 species are no longer the *only* candidates/targets — see "Data layer" below. They stay
as-is and remain the default scenario on first load; the web UI's species pickers draw from a
merged registry of these hypothetical fixtures plus 1000+ real species.

## Data layer

`data/raw/` (cached pogoapi.net + ScrapedDuck responses) and `data/normalized/species.json` /
`activeRaids.json` are generated by `scripts/sync-data.ts` (`npm run sync-data`) — never hand-edit
either directory, rerun the script instead. `pokemon_stats.json`/`pokemon_types.json` etc. only
cover **Normal-form** species (regional/costume/event forms are out of scope); real mega/primal
attacker stats come from the separate `mega_pokemon.json` endpoint (48 entries) — pogoapi has
**no raid-boss roster**, so `activeRaids.json` comes from the community-maintained ScrapedDuck
feed (`https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.json`), matched against
real + hypothetical species by name (falling back to a documented `isApproximate: true`
stand-in — e.g. a Shadow-prefixed raid matched to its non-Shadow base stats — when no exact data
exists). `packages/web/src/registry.ts` builds the `SpeciesRegistry` web-side by merging this
with the hand-defined hypothetical fixtures; `packages/engine` itself stays pure (no I/O) —
`scripts/sync-data.ts` is the one place that fetches anything, calling the engine's own
`fromGameMaster`/`fromGameMasterMove` so the transform isn't duplicated.

## Custom subagents

`.claude/agents/` has project-specific subagents (`data-sync`, `engine-verifier`,
`meta-architect`, `site-builder`) the user added mid-project. **The user has re-enabled using
them** (reversing an earlier "don't use them" from a prior session) — route matching work
through them when it fits their charter (e.g. `data-sync` for anything touching `data/` or
`scripts/sync-data.ts`, `site-builder` for `packages/web` UI work, `engine-verifier` to check
`packages/engine` after a change). They require a session restart/resume to pick up newly-added
or edited `.md` files (agent definitions load once at session start, not live).

## For session continuity

See `HANDOFF.md` for the specific state of in-progress work as of the last session — update it
(don't just append) at the end of a session if there's meaningful unfinished work, since it's the
one place a fresh session will look first.
