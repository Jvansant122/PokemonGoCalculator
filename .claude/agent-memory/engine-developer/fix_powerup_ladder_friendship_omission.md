---
name: fix-powerup-ladder-friendship-omission
description: powerUp.ts's optimizePowerUps ladder call site and planPowerUpBudget's dominated-level search both silently ignored friendshipLevel; both fixed 2026-09-12
metadata:
  type: project
---

2026-09-12: closed a real ladder-vs-simulation disagreement in `packages/engine/src/powerUp.ts`,
flagged concretely by [[measurement_friendship_bonus_breakpoint_impact]] earlier the same day.

**Bug 1 (the headline one):** `optimizePowerUps`' one `powerUpDamageLadder(...)` call site
hand-built `fastMoveDamageModifiers`/`chargedMoveDamageModifiers` and never set `friendshipLevel`,
even though `PowerUpOptimizerInputs extends Omit<TeamRaidInputs, "slots"|"level"|"ivs">` already
carries it and every `runTeamRaid({ ...rest })` call a few dozen lines below already forwards it
structurally. Result: the tab's displayed per-slot breakpoint headline (`nextFastBreakpoint`/
`nextChargedBreakpoint`) would never move with friendship while the simulated `teamDps` right next
to it would — exactly the disagreement class the 2026-09-09 Mega Level work closed for a different
field (see [[feature_super_max_plus_moves_and_mega_level]]). Fix: added
`friendshipLevel: rest.friendshipLevel` to both modifier objects at that call site.

**Bug 2 (same shape, found while auditing "every ladder call site" per the task's instruction):**
`planPowerUpBudget`'s `contexts` builder (which feeds `usefulPowerUpLevelsAbove`/
`powerUpLevelMetrics` — the dominated-level reduction the greedy search uses to decide which
levels are even worth trying) had the identical omission on `outgoingFastMoveDamageModifiers`/
`outgoingChargedMoveDamageModifiers`. This is NOT a displayed headline, but it's a real
correctness bug: proved with a throwaway script (`usefulPowerUpLevelsAbove` called with/without
`friendshipLevel: "good"` on an otherwise-identical fixture) that a level genuinely dominated
(no-op) at `"none"` becomes a real fast-move breakpoint at `"good"` — and confirmed end-to-end via
`planPowerUpBudget` itself: same fixture, `friendshipLevel: "none"` → plan finds nothing
(`stopReason: "no-significant-candidate"`, stays at 16.5), `friendshipLevel: "good"` → commits a
step to level 17. Before the fix this would have been `"none"`-shaped regardless of what
`friendshipLevel` the caller passed, silently hiding a real recommendation from the search entirely
(not just mis-displaying one). Fix: same `friendshipLevel: rest.friendshipLevel` addition, on the
OUTGOING modifiers only.

**Correctness constraint preserved (verified, not just asserted):** friendship must never reach
`incomingFastMoveDamageModifiers`/`incomingChargedMoveDamageModifiers` — the boss doesn't get a
friendship bonus. Neither fix touches an incoming modifier object; `teamRaid.ts`'s own boss
`damageOut`/`chargedMoveDamageOut` already omit it by construction (pre-existing, unchanged). Added
a direct unit test on `powerUpLevelMetrics` (the exact function both search paths call) proving
`incomingFastDamage`/`incomingChargedDamage`/`survivalFastHits`/`survivalChargedHits` are
byte-identical across friendship tiers while outgoing damage moves — this is the kind of invariant
that's easy to silently violate on a future edit if someone ever "simplifies" by sharing one
modifier object for both directions (explicitly warned against in this module already).

**Deliberately NOT touched:** `rosterPlanner.ts` and `rosterMoveChange.ts` have NO
`friendshipLevel` field on their own Inputs types at all (checked via grep — zero matches) — they
don't extend `TeamRaidInputs`, so it isn't even structurally inherited. This is a different, larger
gap (friendship isn't wired into the multi-raid/roster-move-change paths at all) than "a field
exists on the inputs but a specific call site ignores it" — fixing it would mean adding a new field
to two more Inputs types and threading it through their own `runTeamRaid` calls, which is feature
work, not the narrow disagreement-closing fix that was asked for. Flagged for whoever picks up
extending friendship support to those two modules; the fix pattern here (search for every hand-built
`...DamageModifiers` object, check it forwards every field present on the shared inputs type) is
directly reusable there once the field exists.

**Method note:** every fixture/breakpoint chosen here (16.5→17 fast-move floor unchanged at
`"none"`/crossed at `"good"`; level 20 power 20/80 fast/charged moves for the incoming-invariant
test) was found by running a throwaway `tsx` script against the real `calculateDamage`/
`effectiveStatsAtLevel`/`usefulPowerUpLevelsAbove`/`planPowerUpBudget` exports from repo root
(scratch files placed at repo root, e.g. `./scratch-foo.mjs`, then deleted — NOT under `packages/engine`
noise, and NOT using an absolute Windows path as the entry script's own path, which fails module
resolution under tsx/ESM — relative imports FROM a repo-root file work fine). A first attempt at the
incoming-invariant test used power 10/50 at level 20, which floored identically at "none" and
"forever" for the fast move — verified this failure mode by actually running the test before
concluding the fixture (not the fix) was wrong, then re-picked power values via script rather than
guessing twice.
