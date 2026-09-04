# Handoff

Last updated: 2026-09-04, end of session. Read `CLAUDE.md` first for durable project
architecture/conventions — this file is the point-in-time "what's done, what's next."

## Status: all 5 spec phases built, tested, and deployed

- **Live site**: https://jvansant122.github.io/PokemonGoCalculator/ — confirmed up to date with
  commit `255dc55` (deploy workflow run `33929982269`, completed/success).
- **Tests**: 35 passing across 11 files in `packages/engine` (`npm run test:engine`).
- **Type-check**: both packages clean (`npx tsc --noEmit`).
- **Build**: `npm run build --workspace=packages/web` succeeds.
- Nothing uncommitted, nothing unpushed as of this write-up.

## What's built

1. **Phase 1** (stat/damage/energy engine + type chart): complete, exact acceptance numbers
   pinned in `packages/engine/test/scenarioA.test.ts` (see CLAUDE.md for the numbers).
2. **Phase 2** (breakpoint solvers): `findFastMoveBreakpoints`, `timeToFaint`/`timeToFaintTable`
   in `breakpoints.ts`.
3. **Phase 3** (uptime → team damage, crossover): `uptime.ts`, demonstrated with a real crossover
   in Scenario B (Mega Raichu X/Y vs Mega Skarmory, X's dual typing gives it a survivability
   edge — see `test/scenarioB.test.ts`).
4. **Phase 4** (assumption panel + sensitivity ranking): live in the web UI, always visible,
   `sensitivity.ts` ranks which single assumption sits closest to flipping the winner.
5. **Phase 5** (stepwise 100ms-tick simulator, distributions): `simulate.ts` +
   `runSustainedComparison`, wired into the UI as a "Sustained" combat-phase option alongside
   the original "opening burst" mode.

## Most recent work: fixing a dodge/animation interaction bug

The user shared casual chat messages from "Steve" (the domain source behind the original
analysis in the spec) containing concrete mechanical knowledge:
1. A dodge's damage-reduction window is only ~0.7s — it's a timed action, not a standing shield.
2. You get "guaranteed" damage from boss fast attacks (and charged moves) while locked into your
   own charged-move cast animation, since you can't dodge mid-cast.
3. A raid boss's charged move damage lands all at once at the moment it fires (a "fast damage
   window"), not on a reactable windup.

Point 2 exposed a real bug: `simulateStepwiseBattle` in `simulate.ts` was letting the configured
`DodgeBehavior` reduce damage even for hits landing during the attacker's own charged-move
animation. Fixed: any boss hit landing in that window now always deals full damage regardless
of dodge setting. Added `DODGE_WINDOW_SECONDS` constant + docs in `breakpoints.ts`, a precise
regression test (`simulate.test.ts`, "never lets a dodge reduce damage from a hit landing during
the attacker's own charged-move animation"), and updated the web UI's caveats text. This is
commit `255dc55`, already deployed.

Point 1 and 3 were documentation-only (already matched or were clarified in existing behavior/
comments) — no further code change needed unless a future session decides the ~0.7s window
should be modeled more granularly (see "Not done" below).

## Not yet done / candidates for next session

1. **Real GameMaster data integration — generalize beyond the 3 hardcoded fixture mons.**
   `gamemaster.ts` has `fromGameMaster`, `fromGameMasterMove`, and `SpeciesRegistry` (merges
   real + hypothetical species), but none of it has ever been exercised against actual
   pogoapi.net data or covered by a test. Right now the whole tool only "knows about" the 3
   hypothetical species in `fixtures/scenarioA.ts` (Mega Raichu X/Y, plus Kyogre/Skarmory as
   bosses) — the comparator should generalize to **any two attackers vs any current raid boss**:
   - **Full raid boss roster, checked live via API.** Confirmed-reachable pogoapi.net endpoints:
     `pokemon_stats.json` (fields: `pokemon_id`, `pokemon_name`, `base_attack`, `base_defense`,
     `base_stamina`, `form`), `cp_multiplier.json`, and (per `data-sync`'s agent notes, not yet
     independently confirmed this session) `pokemon_types.json`, `fast_moves.json`,
     `charged_moves.json`, `current_pokemon_moves.json`, `type_effectiveness.json`. **pogoapi.net
     does NOT publish a current raid-boss list** — that roster changes weekly/monthly in the
     live game and needs its own source: either a small project-owned `data/raid-bosses.json`
     (species + tier + current-rotation flag, updated by hand or by a scheduled task) or a
     community raid-boss feed, checked/refreshed via API/scrape at data-sync time, not hardcoded
     in fixtures.
   - **Every real Pokémon and its actual learnable movesets**, not just the 2 hypothetical
     movesets in `fixtures/scenarioA.ts` — sourced from `pokemon_stats` + `current_pokemon_moves`
     + `fast_moves`/`charged_moves`, normalized into `SpeciesDefinition`/`FastMove`/`ChargedMove`
     shape via `fromGameMaster`/`fromGameMasterMove`, and registered in a `SpeciesRegistry`
     alongside (not replacing) the hypothetical/speculative entries — which must stay flagged
     `isHypothetical: true` all the way to the UI per the existing convention.
   - The web UI's candidate/target dropdowns are currently a hardcoded array of 2 species and 2
     bosses (`CANDIDATES`/`TARGETS` in `App.tsx`) — these would need to become searchable
     pickers over the full registry once it's populated.
   Doing this would concretely demonstrate the spec's "hypothetical + real data merge"
   requirement, which right now only exists as an interface, not a proven path.
2. **Partial dodge-window coverage during a cast.** Currently modeled as "zero dodge benefit for
   the entire cast animation" (a deliberate simplification). Steve's actual described habit is
   dodging right as a charge starts, which in principle could reduce damage for the first ~0.7s
   of the animation specifically, not the whole thing. Worth considering if the current
   simplification ever feels wrong for a specific scenario, but not clearly required by the spec.
3. No further un-actioned items from `steves_messages2.txt` — all three concrete points were
   addressed (see above).

## Preferences / gotchas for whoever picks this up

- **User said "Don't use those agents"** (the 6 custom subagents in `.claude/agents/`) partway
  through the prior session — do work directly instead, unless the user asks again to route
  through them.
- Custom agent definitions only load at session start — if the user adds/edits one mid-session,
  it won't be callable until the session is restarted/resumed.
- Node.js/npm need a manual PATH prepend in fresh PowerShell processes (see CLAUDE.md). No `gh`
  CLI installed — use `curl` + the public GitHub API for read-only checks.
- User has approved an ongoing commit → push → auto-deploy cycle this session (not just a
  one-time thing) — reasonable to continue that pattern for further fixes, but stay attentive
  if that changes.
