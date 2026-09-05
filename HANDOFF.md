# Handoff

Last updated: 2026-09-04, end of session. Read `CLAUDE.md` first for durable project
architecture/conventions — this file is the point-in-time "what's done, what's next."

## Status: generalized, rebuilt the combat model, added images, fixed a real data bug

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
