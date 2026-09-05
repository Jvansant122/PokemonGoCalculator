# Handoff

Last updated: 2026-09-04, end of session. Read `CLAUDE.md` first for durable project
architecture/conventions — this file is the point-in-time "what's done, what's next."

## Status: dodge overhaul, fast-move damage tracking, combat-phase toggle removed

- **All 50 engine tests pass** (`npm run test:engine`), up from 43 at the start of this session.
- Type-check clean in both packages; `npm run build --workspace=packages/web` succeeds.
- Verified live in the Browser pane: default scenario, the off-type 10%-boost fix (team damage
  dropped from 1378→1166 at 0 matching teammates, not to the old ~1060 "no boost" value),
  `holdChargedMoveUntilSafe`'s energy-buffer display, chart axis labels.
- Two commits' worth of work happened this session (real-data generalization + damage-over-time
  chart from earlier in the day, then this dodge/combat-model overhaul) — check `git log`/`git
  status` for exactly what's pushed vs. still local when picking this up.

## What changed this session (second half — the dodge/combat-model overhaul)

Prompted by a long sequence of user feedback about dodge mechanics, fast-move damage, team-boost
math, and the combat-phase toggle. In rough order:

1. **Dodge split into charged-only + a separate fast-attack toggle.** `DodgeBehavior`
   (none/perfect/percentage-missed) now governs the boss's **charged** attacks only.
   `dodgeFastAttacks: boolean` (no percentage variant) is separate. Real consequence: the
   opening-burst deterministic model (`combat.ts`) has no boss charged move at all, so `dodge`
   is now a no-op there — `dodgeFastAttacks` is what extends survival in that phase. Updated
   `scenarioB.test.ts`/`comparison.test.ts` accordingly (documented, not a regression).
2. **Dodging costs `DODGE_COST_SECONDS = 0.5`** per attempt (hit or miss), pushing the
   attacker's own next fast move later. `combat.ts`'s `simulateOpeningBurst` was rewritten from
   a precomputed-and-sorted event array to a 2-pointer merge (boss schedule stays static, only
   the attacker's shifts) — verified behavior-preserving for the default (no dodge) path against
   every existing pinned test before adding anything new.
3. **`holdChargedMoveUntilSafe`**: hold the charged move (energy capped at `MAX_ENERGY=100`)
   until either a dodged boss charged hit (safe-window trigger) or the energy cap forces it.
   Sustained-phase only (opening burst has no boss charged move to dodge). UI shows each
   candidate's "energy buffer" (100 − move cost) next to the toggle.
4. **Real bug found and fixed while adding fast-move damage tracking**: the attacker's fast move
   never dealt any damage to the boss at all in either combat model — only its energy gain was
   tracked. Added `ownFastMoveDamage`/`totalFastMoveDamage` throughout. **Also found a second,
   pre-existing bug in the same area**: the charged move's damage was computed using the FAST
   move's STAB/type-effectiveness, not its own — invisible in every fixture because Scenario A's
   fast and charged moves are both Electric, but wrong for real species with differing move
   types (now common after last session's data-layer generalization). Fixed by splitting
   `damageOut` into `fastDamageOut`/`chargedDamageOut` everywhere. `ownDamageTrajectory` is now
   the **combined** fast+charged cumulative total, not charged-only.
5. **Off-type mega-boost bug fixed**: `convertUptimeToTeamDamage` gave off-type teammates a `1x`
   multiplier (no boost at all). Real mechanic: every teammate gets at least
   `OFF_TYPE_MEGA_BOOST_MULTIPLIER = 1.1`, only type-matching teammates get the full
   `boostMultiplier`. Replaced the single party-wide `teammateTypeMatches: boolean` with
   `matchingTeammateCount: number` (a slider, 0..partySize) since real teams are rarely
   all-or-nothing on type.
6. **Combat-phase toggle removed entirely.** Per explicit, repeated user request: "opening
   burst" isn't a mode a player picks, it's a computed fact about the boss's own energy economy.
   The web UI now always runs `runSustainedComparison` (one continuous simulation); the
   deterministic `runComparison`/`simulateOpeningBurst` path still exists and still backs the
   pinned Scenario A acceptance numbers via tests, it's just not wired into the live UI anymore.
7. **Fight-length control, extend-only.** `minFightLengthSeconds` lets the user stretch the
   chart's window past the auto-computed natural minimum — never below it (preserves the
   zero-output-bug fix from last session).
8. **Result cards now show the full breakdown**: mean charged damage, mean fast-move damage,
   mean own total (combined), median/p10-p90 of the combined total, AND a separate "team damage
   from this candidate's boost" figure — resolving the "why does median damage show 0" question
   (answer: it was charged-only, and glass cannons dying mid-cast land 0 charged damage but still
   deal real fast-move damage, now visible).
9. **Chart gets real axis tick labels** (both x and y, "nice" round-number intervals) instead of
   just the two endpoints, plus a final own/team damage tally printed below it.

## Also this session: species images

Added `imageUrl?: string` to `SpeciesDefinition` and wired sprites (PokeAPI's GitHub sprites
mirror) into the header, species pickers, result cards, and chart legend. Real Normal-form
species use their national dex id directly (free, no extra request); the 48 real mega/primal
species and the 4 hypothetical fixtures needed a per-species PokeAPI name lookup (cached to
`data/raw/mega_sprite_urls.json`) since mega forms have their own internal PokeAPI id. Genuinely
surprising finding: PokeAPI has real sprite data for the hypothetical fixtures too
(`raichu-mega-x`, `raichu-mega-y`, `skarmory-mega`, `kyogre-primal`) even though those forms
aren't released content — all 48/48 mega lookups resolved after fixing one id-collision edge
case (`kyogre-primal` was renamed to `kyogre-primal-attacker` to avoid colliding with the
existing boss-mode fixture id; the sprite lookup needs the pre-rename name since that's what
PokeAPI actually knows).

## Not yet done / candidates for next session

1. Mobile-width visual check still hasn't been done (only desktop verified, this session and last).
2. Bundle size is ~1.07MB now (species.json + the growing engine surface) — still just a build
   warning, not an error, but worth revisiting if it keeps growing.
3. The "Teambuilding Analyzer" idea (multi-trainer mega staggering across a raid) from last
   session is still explicitly out of scope for this tool — unchanged.
4. Regional/costume forms and real Shadow-form stat multipliers are still not modeled in the
   data layer (unchanged from last session).

## Preferences / gotchas for whoever picks this up

- This user gives extremely precise, mechanically-literal feedback (exact formulas, specific
  numbers from their own spreadsheets) — implement close to literally rather than
  simplifying/interpreting loosely. See the memory file on this if picking up mid-thread.
- When a user-visible number looks wrong ("why does X show 0"), check whether the underlying
  metric's *definition* is narrower than what's displayed (e.g. "damage" meaning "charged-move
  damage only") before assuming a calculation bug — but also actually verify, since this session
  also found two real bugs (missing fast-move damage; charged move using the fast move's
  type-effectiveness) hiding under exactly that kind of "is this intentional" question.
- Whenever changing `DodgeBehavior`/dodge semantics, re-run the FULL test suite immediately —
  this session's dodge-charged/fast split broke 4 existing tests in ways that were each
  individually easy to misdiagnose (some were real consequences of the redesign, one was a
  genuine test-authoring bug about how `chargedMoveWarmupSeconds` + `chargedMoveMeanIntervalSeconds`
  combine — read `combat.ts`'s and `simulate.ts`'s comments carefully before hand-deriving
  expected timings in a new test).
- Custom agents are back in use (data-sync, site-builder, engine-verifier, meta-architect) per
  last session — this session's engine work was done directly (not delegated) given how
  interdependent and correctness-sensitive the changes were; that was a deliberate choice, not a
  reversal of the "use agents" preference.
