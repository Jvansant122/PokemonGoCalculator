---
name: bugfix-powerup-to-teamraid-meancollapse
description: Power-Up Optimizer -> Team Raid "Send post-plan roster" export collapsed per-slot levels/IVs to a roster-wide mean instead of using TeamSlotAssumption's per-slot override; fixed by mirroring teamRaidExport.ts's already-correct reverse direction
metadata:
  type: project
---

Fixed 2026-09-10, from a `skeptic` audit finding (source-cross-reference only, no live repro —
confirmed live myself both ways during this fix).

**The bug**: `packages/web/src/powerUpOptimizerExport.ts`'s `slotToTeamSlot` only carried
speciesId/moves/isMega/megaLevel/isShadow onto the output `TeamSlotAssumption`, never its
`level`/`ivs` fields. `powerUpOptimizerAssumptionsToTeamAssumptions` then computed
`mean(fieldedLevels)`/`mean(ivAttack)` etc. and wrote that single number into the roster-WIDE
`TeamAssumptions.level`/`ivAttack`/... — discarding every slot's own real (post-plan) level. The
sibling reverse direction (`teamRaidExport.ts`'s `slotToPowerUpSlot`) had already been fixed to use
`slot.level ?? level` per-slot; this direction just never got the same treatment despite the
destination type (`TeamSlotAssumption.level?`/`ivs?`) having had room for it since the Lineup
Builder shipped. The function's own doc comment still claimed "no lossless way to carry N
different post-plan levels into a type with room for only one" — false by the time this bug was
found, and exactly the kind of stale comment CLAUDE.md warns hides a bug from review.

**The fix**: `slotToTeamSlot(s, level)` now sets `level: roundToHalfLevel(level)` and
`ivs: {attack, defense, stamina}` from the slot's own resolved values (same
`finalLevels?.[i]?.toLevel ?? s.level` resolution the old mean used, just applied per-slot instead
of averaged). The roster-wide `TeamAssumptions.level`/`ivAttack`/`ivDefense`/`ivStamina` fields are
now a **fixed plain default (20/15/15/15, Team Raid's own resting shape)**, not a computed mean —
once every fielded slot carries its own override, the shared field is only a fallback for a slot a
user manually ADDS afterward with no override of its own; a mean there would misleadingly imply
one number represents the roster when the whole point of the per-slot fields is that it doesn't.

**Live-verified both ways** (git-stashed just the one source file to rebuild the pre-fix behavior,
confirmed via a throwaway `playwright` script — see `verification_without_browser_tool.md` for why
no interactive browser tool was available, and the party-size-flip memory for the
scratch-Playwright-script precedent this reused):
- **Before fix**: default single-raid roster (levels 35/30/40/38/31/25, budget 200k
  stardust/20 candy/10 XL) → plan claims "100% clear rate after this plan (avg 89.8s to clear)" →
  clicking through collapsed every slot onto ONE shared mean level with no per-slot override shown
  at all → Team Raid simulated **125.7s to clear, 1 wipe** — a ~40% divergence from the plan's own
  claim, reproducing the exact numbers the skeptic's source-only finding predicted.
- **After fix**: same scenario → Team Raid shows 6 DISTINCT "Own level/IVs:" hints
  (36.5/30/40/38/37.5/25 — two slots bumped by the plan) → simulated **89.6s to clear, 0 wipes** —
  matches the plan's 89.8s claim within noise (single seeded run vs. a distribution mean).

**Regression test added**: `powerUpOptimizerExport.test.ts` gained a case asserting N differing
per-slot levels (21/30/45) survive the hand-off DISTINCTLY and that the shared roster-wide field is
NOT their mean — mirroring `teamRaidExport.test.ts`'s pre-existing override-preference case, which
is what should have existed already and would have caught this. Also added a
`share-link.spec.ts` e2e case reading the "Own level/IVs:" hints after clicking "Send post-plan
roster to Team Raid Simulator" and asserting the post-plan levels (not the pre-plan ones) show up
distinctly per slot — this needed a real rebuild-and-rerun once to learn the plan's own
finalLevels output (36.5/30/40/38/37.5/25) rather than assuming the roster's unmodified starting
levels would survive unchanged.

**Technique note**: `git stash push -- <one file>` (not a bare `git stash`) is the safe way to get
a "before" build for an A/B live comparison mid-task when the shared worktree has OTHER agents'
unrelated uncommitted changes present (here: a concurrent `skeptic` session's own memory-file
writes) — stashing everything would have swept those up too. Pathspec-scoped stash + pop is
reversible and touched nothing else. See [[feedback_concurrent_sessions_shared_worktree]].
