# Handoff

Last updated: 2026-09-05. Read `CLAUDE.md` first for durable project architecture/conventions —
this file is the point-in-time "what's done, what's next."

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
  One small real discrepancy found and **not yet resolved**: that source's Shadow defense penalty
  is 5/6≈0.8333 vs this project's `0.83` — worth a quick decision (tighten to match, or keep `0.83`
  as the deliberately-chosen value; both are defensible, it's not officially pinned either way).
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

1. Mobile-width visual check still hasn't been done (only desktop verified, this session and last).
2. Bundle size is ~1.16MB now (species.json + the growing engine surface) — still just a build
   warning, not an error, but worth revisiting if it keeps growing.
3. The "Teambuilding Analyzer" idea (multi-trainer mega staggering across a raid, since the mega
   boost doesn't stack) is explicitly out of scope for this tool — a separate future project.
4. Regional/costume forms and real Shadow-form stat multipliers are still not modeled in the data
   layer (only Normal-form + mega/primal are synced; Shadow raids use a documented approximation).

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
