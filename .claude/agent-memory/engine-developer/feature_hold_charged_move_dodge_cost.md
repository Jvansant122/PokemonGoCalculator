---
name: feature-hold-charged-move-dodge-cost
description: holdChargedMoveUntilSafe's new "dodge before AND after the held cast" time cost — HOLD_CHARGED_MOVE_DODGE_ATTEMPTS, simulate.ts call site, why it's gated on isBossChargedHit && dodge.kind !== "none"
metadata:
  type: project
---

2026-09-09: implemented a user-specified explicit placeholder assumption for `StepwiseAttacker.
holdChargedMoveUntilSafe` (`packages/engine/src/simulate.ts`): while it's on, each of the boss's
CHARGED hits the attacker actually attempts to dodge costs `HOLD_CHARGED_MOVE_DODGE_ATTEMPTS *
DODGE_COST_SECONDS` (2 x 0.5s = 1.0s) instead of the ordinary single `DODGE_COST_SECONDS` — models
"dodge once right before throwing the held cast, once right after."

**Why:** the user explicitly framed this as their own placeholder mechanic ("pending improvement,
but for now let's assume..."), not a researched fact — no source in MECHANICS.md addresses this
case (every other dodge-cost figure there is first-party-confirmed, but none of them cover dodging
around a *held* charged-move cast specifically).

**Exact gating** (this was the part to get literally right, not "improved"):
- `HOLD_CHARGED_MOVE_DODGE_ATTEMPTS = 2` (exported const, named so it's a one-line edit later).
- Applied at the single call site in the hit block: `const dodgeAttempts = attacker.
  holdChargedMoveUntilSafe && isBossChargedHit ? HOLD_CHARGED_MOVE_DODGE_ATTEMPTS : 1;
  nextAttackerFastMoveAt += dodgeAttempts * DODGE_COST_SECONDS;` — nested inside the existing
  `if (attemptingDodge)` guard, so it inherits every existing exclusion for free: never fires with
  `dodge.kind === "none"` (attemptingDodge is already false there) and never mid-own-animation
  (also already excluded from attemptingDodge). Boss FAST hits are unaffected since `isBossChargedHit`
  gates it — `dodgeFastAttacks` always costs the ordinary single amount.
- Blast radius is deliberately full (comparison.ts/speciesReport.ts/teamRaid.ts/rosterPlanner.ts all
  share simulate.ts — same-named setting must mean the same thing everywhere; no per-caller opt-out
  was added, matching the task's explicit instruction).

**Verified no pinned test moved**: grepped every `test/*.test.ts` for `holdChargedMoveUntilSafe` —
only `scenario.test.ts`/`teamScenario.test.ts` (round-trip codec tests, no simulation) and
`simulate.test.ts` itself reference it anywhere in the suite. Full `npm run test:engine` run before
and after: 321 -> 323 passed (the 2 new tests), zero regressions, zero pinned-number changes. This
setting was simply never exercised in combination with an active charged dodge by any other pinned
test — so the "which pinned numbers moved" answer is genuinely "none," not a coincidence worth
double-checking further.

**Tests added** (`packages/engine/test/simulate.test.ts`, inside the existing
`describe("holdChargedMoveUntilSafe")` block): both isolate the effect by giving the attacker an
unreachable own charged-move energyCost (99999, `> MAX_ENERGY`) so the OTHER holdChargedMoveUntilSafe
effect (holding the attacker's own cast) never engages — the only thing that can differ is the
dodge-cost branch.
1. `dodge: {kind:"perfect"}`, boss fires several charged hits on a `"fixed-interval"` schedule (that
   mode's schedule is independent of the attacker's own timeline, so it's provably byte-identical
   between the two runs) — asserts `held.totalFastMoveDamage < notHeld.totalFastMoveDamage`.
2. `dodge: {kind:"none"}` — asserts `held` result `toEqual` (deep-equal, not just cadence-equal)
   `notHeld` result, since `attemptingDodge` is false throughout and the own-cast-hold path is also
   inert (energyCost unreachable) — genuinely byte-identical, not just "the isolated invariant."

MECHANICS.md: new "### OPEN QUESTION: how much of the attacker's own time is lost dodging around
their own charged-move cast (holdChargedMoveUntilSafe)" entry under `## Dodging`, ending
"**Engine (2026-09-09): a labelled placeholder assumption, not a sourced mechanic**" per this
project's sourcing convention.

Files: `packages/engine/src/simulate.ts` (StepwiseAttacker doc comment + `HOLD_CHARGED_MOVE_DODGE_
ATTEMPTS` export + the hit-block call site), `packages/engine/test/simulate.test.ts`,
`MECHANICS.md`.
