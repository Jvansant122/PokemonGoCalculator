---
name: feature-attack-defense-breakpoint-grid
description: breakpoints.ts's attackDamageGrid/defenseDamageGrid full unfiltered iv x level grid, backing the new Attack/Defense Breakpoints web tab
metadata:
  type: project
---

Added `attackDamageGrid` and `defenseDamageGrid` to `packages/engine/src/breakpoints.ts`
(2026-09-06), per `PLAN_attack_defense_breakpoints.md`'s "Step 1: Engine work". Both are thin
wrappers around one private `damageGrid({ role: "attacker" | "defender", ... })` helper — `role`
only decides which side of `calculateDamage`'s atk/def pair the swept `effectiveStat` plugs into;
the fixed opposing stat plugs into the other side. This is deliberately NOT two independently
duplicated loops, per the plan's explicit instruction.

Exported type: `DamageGridCell { iv: number; level: number; stat: number; damage: number }` — a
FULL grid, every cell populated (unlike the existing `findFastMoveBreakpoints` in the same file,
which only records rows where damage changes from the previous level). Do not conflate the two;
`findFastMoveBreakpoints`/`timeToFaint`/`timeToFaintTable` were left untouched exactly as
instructed.

Signatures:
```ts
attackDamageGrid(params: {
  baseAttack: number; defenderDefenseStat: number; power: number;
  damageModifiers: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  ivRange?: number[]; levels?: number[];
}): DamageGridCell[]

defenseDamageGrid(params: {
  baseDefense: number; attackerAttackStat: number; power: number;
  damageModifiers: Omit<DamageInputs, "power" | "attackerAttackStat" | "defenderDefenseStat">;
  ivRange?: number[]; levels?: number[];
}): DamageGridCell[]
```
Defaults: `ivRange` = 0-15, `levels` = full `CPM_TABLE` range (ascending) — deliberately NOT
hardcoded to the web tab's 25-50 descending range; the plan was explicit that the caller (a new
web tab) always passes its own range, mirroring `findFastMoveBreakpoints`'s existing convention.

**Why:** the web tab (`packages/web`, not yet implemented as of this writing — only the engine
piece was requested) needs a full spreadsheet (every IV x level cell), not a filtered
breakpoint-change list, for both "my own attack vs boss's fixed defense" and "boss's fixed attack
vs my own defense" modes. Reusing one shared sweep function means the two modes can never
formula-drift apart — verified in tests by asserting swapped-role calls match a direct
`calculateDamage` call with matching effective stats.

**How to apply:** if `web-developer` picks up steps 2-4 of `PLAN_attack_defense_breakpoints.md`
(new Scenario type, new tab component, wiring into `App.tsx`), these two functions are already
exported via `src/index.ts`'s `export * from "./breakpoints.js"` — no further engine change
needed unless the web layer discovers a missing modifier (e.g. mega boost handling on attack
sheets is flagged in the plan as an open question the web tab needs to decide/document, not an
engine gap).
