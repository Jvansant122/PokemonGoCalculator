---
name: feature-friendship-across-iv-adb-pu-and-species-report-caveat
description: Added a real friendship control to IV Breakpoints, Attack/Defense Breakpoints (Attack mode only), and Power-Up Optimizer (single-raid only, disabled in multi-raid), plus a caveat-only sentence on Species Report — driven by a same-session engine-developer measurement settling the control-vs-caveat split
metadata:
  type: project
---

Built 2026-09-12, off `engine-developer`'s same-day `measurement_friendship_bonus_breakpoint_impact.md`:
IV/Attack-Defense Breakpoints and Power-Up Optimizer's per-slot LADDER headline read one exact
floored value directly (friendship moves >=1 breakpoint in 32-100% of tested matchups even at the
weakest real tier), while Species Report's/Power-Up Optimizer's own AGGREGATE rankings sum
hundreds of floored hits into a distribution (Spearman >=0.989, identical top-10 across
none/good/forever on 771 real bosses) — so those get a caveat sentence, not a control. Reused
`FriendshipSelect.tsx` everywhere (added an optional `disabled` prop, its first consumer).

**Attack/Defense Breakpoints: hide the control in Defense mode, don't just leave the field
unwired.** Friendship is the ATTACKER's own bonus; in Defense mode the "attacker" is the boss,
which this engine never scales by the player's friendship. Put `<FriendshipSelect>` inside the
existing `{species && assumptions.mode === "attack" && (...)}` block (same block already gating
the fast/charged MoveSelects) rather than rendering it always-visible-but-inert — matches the
project's established "an inert control is worse than no control" precedent. Wired
`friendshipLevel` into BOTH `attackDamageGrid` calls' `damageModifiers` (fast AND charged) in
`run/runAttackDefenseBreakpoints.ts`, added an explicit `// NO friendshipLevel below` comment
above the `defenseDamageGrid` block so a future editor doesn't "fix" the asymmetry by mistake.

**IV Breakpoints: two call sites, not one** — `runIvBreakpoints.ts` computes the single-target
`compareIvSpreads` call AND a separate full-registry sweep loop (`sweepAggregate`, the "impact
across every raid target" tallied verdict). Both build their own
`fastMoveDamageModifiers`/`chargedMoveDamageModifiers`/`incomingDamageModifiers` inline — missed
the sweep loop on a first pass and had to go back for it. `friendshipLevel` goes on fast+charged
in BOTH loops, never on `incomingDamageModifiers` in either. One shared control for both spreads
(same species/moveset), consistent with the existing shared Mega Level/Shadow controls on this
tab.

**Power-Up Optimizer: single-raid-only field, disabled-not-hidden control in multi-raid, per the
task's explicit instruction to not ship a silently-inert control.** `rosterPlanner.ts` (multi-raid
engine) has zero `friendshipLevel` field (confirmed by grep). Put `friendshipLevel` on
`PowerUpOptimizerAssumptions` at the top level (not per-slot — mirrors Comparator/Team Raid's
single roster-wide value), rendered via `<FriendshipSelect disabled={value.mode === "multi-raid"}>`
plus an explanatory `species-picker-hint` paragraph shown only in multi-raid mode — same "disabled
control + explicit hint" pattern this file's own `bossChargedMoveFrequencySeconds` field already
uses for its energy-driven-cadence gate. Had to touch FOUR call sites for the single-raid engine
path alone: `DEFAULT_ASSUMPTIONS`, `assumptionsToScenario`/`scenarioToAssumptions`, the
`optimizerAssumptions` useMemo (+ its dependency array) that actually feeds
`runPowerUpOptimizerScenario`, AND the separate `multiRaidInputs` useMemo (a placeholder `"none"`
there, mirroring how `bossStartsPrimed`/`bossStartingEnergyFraction` are already placeholdered in
that object) — missing any one of these compiles fine but leaves a silently-stale control or a
TS error, not a runtime bug, so the typecheck loop catches it fast.

**A same-session engine fix (`5be01ce`, already in the tree before this task started) closed a
real ladder-vs-simulation disagreement**: `powerUp.ts`'s `powerUpDamageLadder` call site inside
`optimizePowerUps` hand-builds its own damage-modifier objects and previously never read
`friendshipLevel`, while every `runTeamRaid` call a few lines away already forwarded it via
`...rest` (`PowerUpOptimizerInputs extends TeamRaidInputs`). Verified this was ALREADY fixed
(both `powerUpDamageLadder` call sites, plus `planPowerUpBudget`'s dominated-level search) before
touching anything — so `run/runPowerUpOptimizer.ts`'s wiring is a single one-line addition
(`friendshipLevel: a.friendshipLevel` in the shared `optimizerInputs` object feeding
`optimizePowerUps`/`planPowerUpBudget`/the move-change sweep's spread), not a two-place fix.
Always check `git log`/read the actual call site before assuming a cited "fixed this session"
claim is stale — it wasn't here.

**Two existing cross-tab export functions needed a one-line follow-up each**, found only because
the typecheck loop refused to compile until every object literal of the now-widened
`PowerUpOptimizerAssumptions`/`TeamAssumptions` shapes was complete:
- `teamRaidExport.ts` (Team Raid -> Power-Up Optimizer): Team Raid already had its own
  `friendshipLevel` (added in an earlier session) — added it to the "carries verbatim" list and
  wired `friendshipLevel: team.friendshipLevel` through, since both tabs mean the same thing by it
  and the export always lands in single-raid mode where it's honored.
- `powerUpOptimizerExport.ts` (Power-Up Optimizer -> Team Raid, the reverse direction): this
  function's own doc comment used to list `friendshipLevel` as one of "three fields with no
  equivalent on the source tab, left at Team Raid's own default." That's now false — REMOVED the
  hardcoded `friendshipLevel: "none"` and the field from that doc-comment's "no equivalent" list,
  replaced with `friendshipLevel: a.friendshipLevel` carried verbatim, and updated the comment to
  say so explicitly (two now, not three). A hardcoded default duplicate-declared alongside the
  correct forwarded value is a TS1117 "multiple properties with the same name" compile error, not
  a silent bug — caught immediately.

**Species Report: caveat only, no field, per the measurement's own recommendation** — added a new
`<details className="prose-details"><summary>Friendship bonus</summary>` block (matching every
sibling caveat's own sub-disclosure convention) citing the measurement's own Spearman/top-10
numbers directly rather than a generic "not modeled" sentence, so the claim is checkable against
the memory file that produced it.

**Verification — full browser-driven proof, not just codec-level.** `npm run verify` green (build
+ all suites), `npm run test:e2e` 27/27, and a from-scratch `vite preview` + `playwright-core`
Bash script (scratch `.mjs` files placed at the repo root, not `packages/web/src/`, and deleted
after — module resolution needs the repo's own `node_modules`, same lesson as prior sessions'
scratch-script notes) proved LIVE:
- Attack/Defense Breakpoints: the CHARGED-move Attack-mode grid's own cell values genuinely
  changed with friendship (28/28/27/27→31/31/31/31/30 on the default delphox/steelix-mega
  matchup) — the FAST-move sheet is the known degenerate all-`2` case from an earlier session's
  memory (Scratch's low power vs. steelix-mega's high Defense), so don't use it as your live-proof
  cell; use the charged sheet instead, or a lower-defense target.
  `#adb-friendship`'s DOM count was exactly 0 in Defense mode (hidden, confirmed not just
  disabled), and the Defense-mode grid's cell values were BYTE-IDENTICAL between friendship
  "none" and "forever" set immediately before switching modes — the actual invariant this task
  most wanted proven.
- Power-Up Optimizer: `#pu-friendship` `isDisabled()` false in single-raid, true in multi-raid,
  and the "doesn't model friendship yet" hint text was present exactly once.
- Species Report: the new "Friendship bonus" `<details>` renders and contains the cited numbers.
- IV Breakpoints: the friendship control changed the full-species-sweep tier table (Mega Raids
  tier row split moved 48/0/47/1 -> 48/0 real change on friendship=forever) — the "first
  divergence level" headline sentence did NOT move for the default Delphox 14/15/15-vs-15/13/15
  pair at this particular friendship jump, which is expected (not a bug): friendship scales BOTH
  spreads by the identical multiplier before flooring, so it can shift where two spreads' floors
  first diverge but isn't guaranteed to for every pair/tier — the per-level table's raw cell
  values (checked via the sweep table above) are the real proof, not the coarser headline
  sentence, exactly as this tab's own "Known caveats" section already warns.
- Zero console errors on any of the 6 page loads exercised.

`npm run check-scenario-roundtrip`: 155/155 fields, all 7 tabs green. `npm run test:web`: 358/358
(scenarioRoundtrip.test.ts's 3 non-default cases + powerUpOptimizerExport.test.ts's 1 new
assertion). `npm run lint`: clean. Left `.claude/skills/add-scenario-assumption/SKILL.md` alone —
it showed as modified in `git status` at session end but I never touched it; per
[[pattern_worktree_isolation_for_concurrent_session_verify]]'s "stage only your own paths, never
touch foreign edits" precedent, a concurrent session's own in-flight docs fix, not mine to revert
or claim.
