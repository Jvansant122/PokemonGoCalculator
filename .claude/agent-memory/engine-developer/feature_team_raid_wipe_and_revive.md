---
name: feature-team-raid-wipe-and-revive
description: teamRaid.ts's cycling wipe-and-revive orchestration (MAX_TEAM_RAID_CYCLES, reviveCostSeconds, per-cycle slot rows), replacing an earlier teamWiped-as-loss design that shipped uncommitted mid-session
metadata:
  type: project
---

Implemented 2026-09-05, picking up mid-flight from a previous session that got cut off by a
rate-limit error with `packages/engine/src/teamRaid.ts`/`teamScenario.ts` already written
uncommitted (per the design in
`.claude/agent-memory/pogo-researcher/proposal_sequential_team_raid_tab.md`).

**Section 9 of that proposal is an ADDENDUM, not a rewrite** — it corrects Section 4's original
`teamWiped: boolean`-as-loss framing after further research found a full 6-Pokémon wipe is NOT a
loss in the real game: the trainer is bounced to the raid lobby, heals via Bag items
(assumed-unlimited for v1), and can rejoin the SAME raid attempt repeatedly under one shared
clock, restarting from slot 1. The only real loss condition is `raidTimerSeconds` expiring with
the boss still alive. `TeamRaidOutcome` is now just `"cleared" | "timerExpired"` — `teamWiped`
was deleted entirely, replaced by `wipeCount: number` (a diagnostic, not a loss flag).

**Orchestration**: the old single-pass "iterate slots once, done" loop became an outer
`cycleLoop` (cycle index 0..N) wrapping the original per-slot inner loop. On a full-cycle wipe
(every fielded slot fainted without clearing or hitting the timer), pay `reviveCostSeconds`
(mirrors `swapCostSeconds`'s shape/honesty exactly — no real fixed number exists, default 0) and
loop back to the first fielded slot. The boss's charged-move cooldown residual carries forward
across a wipe-and-revive exactly the same way it already carried forward across an ordinary
mid-cycle slot swap (same mechanism, `isVeryFirstFight = cycleIndex === 0 && n === 0` gates the
one true "fresh start" case). Per-slot result rows (`TeamRaidSlotResult`) now carry a
`cycleIndex` alongside `slotIndex`, and `slots: TeamRaidSlotResult[]` on the result became a flat
chronological list of every actual fight across every cycle (dropped the old `sentOut`/nullable
`speciesId` fields — a configured empty slot just never appears in the array at all now, instead
of appearing as a synthetic all-zero row).

**`MAX_TEAM_RAID_CYCLES = 1000`**: a pure engineering safety cap, not a game rule — the real game
imposes none (confirmed via the addendum's Q3 research). Needed because a degenerate near-zero-
net-damage roster can advance the raid clock by less than `raidTimerSeconds` per cycle
indefinitely if `reviveCostSeconds` is 0 and each fight's own combat time is small, so the
ordinary timer/clear checks alone don't bound iteration count. If the cap is hit, the run is
forced to `outcome: "timerExpired"` as a safe fallback (tested explicitly — see
`teamRaid.test.ts`'s "stops at MAX_TEAM_RAID_CYCLES" case, which asserts `wipeCount ===
MAX_TEAM_RAID_CYCLES` exactly, since the outer `for` loop always runs exactly that many iterations
when nothing ever breaks it early).

**`reviveCostSeconds` round-trips through `TeamScenario`** (new field, default 0) — added
`packages/engine/test/teamScenario.test.ts` (this feature had NO scenario test file at all before
this session) with round-trip coverage specifically for `reviveCostSeconds` independent of
`swapCostSeconds`, per the standing "every user-facing assumption must round-trip" rule.

**A pre-existing failing test (`teamRaid.test.ts`'s "attributes the finishing blow...") turned out
to be a fixture-calibration bug, not an orchestration bug** — traced by hand (then confirmed via
the actual `simulateStepwiseBattle` output) that the two fixture Pokémon in that test can deal at
most ~136 combined damage before both faint, against a boss fixture with `baseStamina: 2000` —
mathematically impossible to "clear" no matter how the orchestration code is written. Fixed by
lowering that ONE local test fixture's `baseStamina` to 100 (comfortably inside the achievable
range, still requiring both slots) rather than touching any shared/pinned fixture. **If a
similar-looking "boss too tanky for what the fixtures can output" failure ever recurs, check the
actual per-slot combined max damage via `simulateStepwiseBattle` directly before assuming the
orchestration logic is wrong** — this exact failure mode looks identical to a "carrying the boss
HP total forward" bug from the test name/description alone, but wasn't one.

**`uptime.ts`'s two "every party member" / "whole party" doc comments were factually backwards**
(separate small fix, bundled into this same session per the task) — corrected to "other trainers
in the same raid lobby" per the same mega-boost-scope research already reflected in
`packages/web`'s copy (see
`.claude/agent-memory/web-developer/fix_teammate_boost_copy_backwards.md`). Comment-only, no
math changes — `convertUptimeToTeamDamage`'s arithmetic was already correct regardless of whose
Pokémon the count represents.

**Also deleted `packages/engine/test/_debug.test.ts`** — a scratch debug file with a `console.log`
left behind by the prior session, passing but not a real test. Watch for this recurring pattern
(a debug script left in `test/` that happens to pass) in future handoffs from an interrupted
session.
