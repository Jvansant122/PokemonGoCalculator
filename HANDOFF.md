# Handoff

Last updated: 2026-09-04, end of session. Read `CLAUDE.md` first for durable project
architecture/conventions — this file is the point-in-time "what's done, what's next."

## Status: generalized beyond the 3 fixture mons; new damage-over-time chart; not yet committed

- **Nothing committed or pushed this session** — everything below is uncommitted working-tree
  changes on `main`. The live site (https://jvansant122.github.io/PokemonGoCalculator/) still
  reflects the prior session's commit `255dc55`.
- **Tests**: 43 passing across 12 files in `packages/engine` (`npm run test:engine`), up from 35
  — added coverage for `bossChargedMoveReadySeconds`, `ownDamageTrajectory`, the derived
  opening-burst/warmup defaults, and the fixed sustained-mode zero-output case.
- **Type-check**: both packages clean. **Build**: `npm run build --workspace=packages/web`
  succeeds (single ~1MB JS chunk, size-warning only, not an error — acceptable for now, see "Not
  yet done" if it's worth revisiting).
- Verified live in the Browser pane (screenshots + `get_page_text`, not just build/tests):
  default scenario, Mega Skarmory matchup, sustained-phase chart, the "boss starts primed"
  toggle at 50%/100%, and a scenario-URL round-trip restoring the new fields correctly.

## What changed this session

1. **Real game data layer (`data-sync` agent, twice — the second pass added `mega_pokemon.json`
   after the user pointed it out mid-session).** `scripts/sync-data.ts` (run via `npm run
   sync-data`) fetches pogoapi.net (`pokemon_stats`, `pokemon_types`, `fast_moves`,
   `charged_moves`, `current_pokemon_moves`, `cp_multiplier`, `mega_pokemon`) plus the
   community-maintained ScrapedDuck raid feed, and writes `data/raw/` (cached) +
   `data/normalized/species.json` (1012 species: 964 real Normal-form + 48 real mega/primal
   attackers) + `data/normalized/activeRaids.json` (the 12 currently-active real raids, matched
   to species with a documented `isApproximate` flag where only a stand-in exists). **I caught
   and fixed a real bug the agent introduced**: none of the 48 mega/primal entries had `boost`
   set, so they'd have silently simulated with no mega multiplier at all (`comparison.ts`
   defaults to 1, not 1.3, when `species.boost` is absent) — fixed directly in
   `scripts/sync-data.ts`, re-synced, verified.
2. **Web UI generalized (`site-builder` agent)**: `packages/web/src/registry.ts` merges the real
   data above with the 4 hand-defined hypothetical fixtures; `SpeciesPicker.tsx` is a reusable
   searchable combobox now used for candidate A, candidate B, *and* the raid target (previously
   3 hardcoded constants). Target picker surfaces the live active-raids list first.
3. **Damage-over-time chart, replacing the party-size crossover chart** (user-requested
   redesign, done directly, not delegated — required careful engine-semantics changes I wanted
   full control over): `DamageOverTimeChart.tsx` plots each candidate's own damage plus its
   attributable share of boosted team damage *over time* (party size held fixed at whatever's
   selected), for **both** opening-burst and sustained phases (previously opening-burst only).
   Caught and fixed my own bug here during browser verification: the crossing-detector's
   "exact tie counts as a crossing" branch falsely fired at t=0 (both candidates always start
   at `{0,0}`) — fixed to require a genuine sign flip.
4. **Opening-burst/warmup timing is now physically derived, not user-typed.** New engine export
   `bossChargedMoveReadySeconds(fastMove, chargedMove, startingEnergy?)` (combat.ts) — the
   earliest a boss's own fast move could generate enough energy for its first charged move.
   Removed the "Opening-burst window (s)" / "Simulated fight length (s)" free-typed inputs
   entirely; replaced with a read-only derived display plus a "simulated window" computed from
   the actual results (longest-surviving candidate). This also fixed a real bug: a small
   user-typed window could make the sustained-phase tick loop never execute a single iteration,
   silently reporting 100%-survived with every stat at 0.
5. **"Boss starts already partway charged" toggle** (`bossStartsPrimed` +
   `bossStartingEnergyFraction`, 0-100%): models a mega tagging in mid-fight against a boss an
   earlier trainer's mega left partway charged. At 100% the opening-burst window correctly
   collapses to 0s with explanatory text, not a silent zero.
6. **Small bonus fix, same area**: `bossChargedMoveFrequencySeconds` was a real user-editable
   assumption that was never added to `Scenario` — shared links silently reset it to the
   default instead of restoring what was shared (the exact bug class CLAUDE.md already flags
   for `teammateTypeMatches`). Added it, plus the 2 new fields, to `Scenario` and both
   round-trip functions.
7. **Custom subagents re-enabled** (`data-sync`, `site-builder` used this session) — see
   CLAUDE.md, this reverses the prior session's "don't use them."

## Explicitly out of scope, confirmed with the user

A full **"Teambuilding Analyzer"** — modeling multiple trainers' mega uptimes across a raid and
an optimal staggering strategy (the mega boost doesn't stack, so coordinating who's mega-evolved
when keeps a constant team-wide buff active) to estimate total time for a *group* to clear a
raid — is a **separate future project**, not part of this tool. The "boss starts primed" toggle
(item 5 above) is the one small piece of that idea that *does* belong here now.

## Not yet done / candidates for next session

1. **Ask the user before committing/pushing.** This session's changes are large (new root
   dependency `tsx`, root `package.json` gained `"type": "module"`, new `data/` directory
   committed to the repo, engine API additions, a full chart replacement) — don't assume the
   standing "commit → push → auto-deploy" approval from an earlier, much smaller-diff session
   covers this without asking again first.
2. **Bundle size**: the production JS chunk is now ~1MB (was smaller before bundling 1012
   species client-side) — only a build warning today, but worth considering code-splitting or
   trimming `data/normalized/species.json`'s bundled fields if it grows further.
3. **Regional/costume forms** (Alola, Galarian, Hisuian, etc.) are still out of scope in
   `scripts/sync-data.ts` — only `form === "Normal"` plus the 48 `mega_pokemon.json` entries are
   normalized. Real Shadow-form stat multipliers (+20%/-20% atk/def) also aren't modeled —
   Shadow raids use the non-Shadow base stats as a flagged approximation.
4. Mobile-width visual check for the new chart/pickers wasn't done this session (only desktop
   viewport verified in the Browser pane) — worth a pass before deploying.
5. No further un-actioned items from earlier sessions (the dodge/animation bug work from
   2026-09-04's prior write-up is complete and superseded by this entry).

## Preferences / gotchas for whoever picks this up

- **Custom agents are back in use** (see above) — this reverses the prior "don't use them" note.
- Custom agent definitions only load at session start — if the user adds/edits one mid-session,
  it won't be callable until the session is restarted/resumed.
- Node.js/npm need a manual PATH prepend in fresh PowerShell processes (see CLAUDE.md). No `gh`
  CLI installed — use `curl` + the public GitHub API for read-only checks.
- When a subagent reports a data-normalization pass "safe" or "complete," verify the specific
  engine-defaults claim yourself before trusting it — this session caught two real bugs
  (missing `boost` on synced mega species; the chart's own t=0 false-crossing) that a
  plausible-sounding agent summary didn't catch.
