---
name: feature-super-max-eligibility-gate
description: 2026-09-10 fix — not every mega can reach Super Max, only species with a "+" move; canReachSuperMax predicate + clamp in resolveCandidateMegaLevel; the ripple of pre-existing tests that were silently exploiting the bug; Change 2's confirmed-existence-vs-estimated-magnitude comment rewrite
metadata:
  type: project
---

Two-part user request (direct in-game observation, trusted verbatim per
[[user_pogo_domain_expertise]]): (1) Super Max Mega Level is only reachable by
species that have a "+" move unlocked — the engine previously granted the
Super Max +2-effective-level CP bonus to EVERY mega/primal candidate
regardless, a real correctness bug, not a UI nicety. (2) the "+" move power
SCALING mechanic's *existence* is now confirmed by direct observation (a
Mega Level 3 Mewtwo's move-info screen visibly shows a changing power
number) — only the specific +10%/tier MAGNITUDE remains an estimate.

## The fix (Change 1)

`packages/engine/src/megaLevel.ts` gained `canReachSuperMax(species:
Pick<SpeciesDefinition, "chargedMoves">): boolean` — purely
`chargedMoves.some(m => m.isPlusMove === true)`, so a species becomes
eligible the instant data-sync adds it a "+" move, zero engine code change
needed. Re-exported from `src/index.ts` automatically (`export * from
"./megaLevel.js"` already existed — verified functionally via a `tsx`
scratch script per [[feature_perf_benchmark_suite]]'s "write inside
packages/engine/test/" technique, not just by reading the wildcard export).

The clamp lives in exactly ONE place: `comparison.ts`'s
`resolveCandidateMegaLevel(species, megaLevel)` — already the shared gate
every real orchestration path routed through for the pre-existing
`.boost`-only check. Widened its param type from `Pick<SpeciesDefinition,
"boost">` to `Pick<SpeciesDefinition, "boost" | "chargedMoves">` and added:
`resolved === "super-max" && !canReachSuperMax(species) ? "max" : resolved`.
This is a CLAMP (old share link/scenario degrades to the nearest legal
tier), never a throw. Centralizing here transitively fixed comparison.ts
itself, teamRaid.ts, powerUp.ts (both `powerUpDamageLadder` and
`powerUpLevelMetrics`), and — downstream of those — speciesReport.ts and
rosterPlanner.ts, with ZERO code changes needed in any of those five files.

**`breakpoints.ts` is the one real exception** (confirmed by reading its
actual signatures, not assumed): `findFastMoveBreakpoints`/`damageGrid`/
`attackDamageGrid`/`defenseDamageGrid`/`timeToFaintTable` take a raw
`baseAttack`/`baseStat`/`baseStamina` NUMBER, never a `SpeciesDefinition` —
there is no species-shaped value in scope to gate on, so it never gated
`.boost` either, structurally. Documented why in `findFastMoveBreakpoints`'s
own `megaLevel` doc comment (the canonical one every sibling function's
comment already points back to) rather than duplicating the explanation 4x.
The caller MUST pre-resolve/clamp — confirmed this is exactly what
`packages/web/src/run/runAttackDefenseBreakpoints.ts` already does
(`resolveCandidateMegaLevel(species, a.megaLevel)` before calling in), so
this tab needs zero web-side change to pick up the new clamp for free.

**A real pre-existing gap found and closed**: `ivComparison.ts` did NOT
actually call the shared `resolveCandidateMegaLevel` despite
`resolveCandidateMegaLevel`'s OWN doc comment already claiming
"ivComparison.ts's own per-candidate wiring shares exactly this gate" — it
had silently hand-rolled just the `.boost` half locally
(`species.boost ? (params.megaLevel ?? null) : null`) instead. Confirmed via
grep this was NOT a circular-import workaround (comparison.ts never imports
ivComparison.ts, only `index.ts`'s barrel does) — just an un-noticed
duplication. Fixed by having it import and call the real function. Lesson
repeats a pattern already in memory
([[feature_super_max_plus_moves_and_mega_level]]'s "task named the wrong
risk area" / [[feature_super_max_mega_level_gaps_closed]]'s
`toTeamRaidSlotsAtLevels`): a doc comment's claim that something is
centralized is not proof — grep the actual call sites.

## The ripple: 3 real pre-existing test failures, all a symptom of the bug being real

Adding the clamp immediately broke 3 tests across the suite — each one was
unknowingly exploiting the pre-fix bug (every mega reaches super-max) to
validate the CP-bump mechanic using a fixture with NO "+" move:

- `comparison.test.ts`'s `resolveCandidateMegaLevel` describe block used
  `CANDIDATE_ALPHA` (test/fixtures/hypotheticalDuo.ts — no "+" move) and
  asserted `resolveCandidateMegaLevel(mega, "super-max") === "super-max"`.
  Restructured into 5 tests: eligible-keeps-super-max (a locally-built
  `eligibleMega` variant), ineligible-clamps-to-max, gains-eligibility (a
  fixture both ways, per the task's explicit ask), null/undefined resolution
  (clamp-independent), and no-`.boost`-at-all (forces null even for an
  otherwise-eligible species). Did NOT touch `CANDIDATE_ALPHA`/`CANDIDATE_BETA`
  themselves (CLAUDE.md: don't casually change the pinned Scenario A/B
  fixtures) — built local variants instead.
- `rosterPlanner.test.ts` AND `rosterBudget.test.ts` both broke on
  `test/fixtures/rosterPlannerFixtures.ts`'s shared `MEGA_BENCH_SPECIES`
  (`makeAttacker`'s default `CHARGED_MOVE`, no "+" move) — their "an
  already-fielded mega entry's super-max team DPS is strictly greater"
  assertion degenerated to an equality (both sides clamped to "max"). Fixed
  the ONE shared fixture (not each test file) — swapped its single
  `chargedMoves` entry for a "+" move variant with IDENTICAL
  power/energyCost/duration, so it's invisible everywhere except the
  eligibility check itself.

All 3 were genuine "this test was validating a bug" findings, not test
infra problems — fixed by making the fixture genuinely eligible (matching
what each test's own name/intent already claimed to test), never by
weakening an assertion. Per CLAUDE.md's testing discipline, this is exactly
the "say so explicitly, re-derive" case, not silent weakening.

## A 4th, non-failing but silently-degraded test found by inspection

`megaLevelPowerUpCeiling.test.ts`'s "the same ceiling holds for a
mega-capable species at Super Max Mega Level" describe block's `megaSpecies`
also had no "+" move — its 2 tests kept PASSING after the clamp (they only
assert `toLevel <= 50`, true whether or not the CP bump actually fires), but
would have silently stopped exercising the level-52 lookup their own name
and comment describe. Fixed anyway (gave it a "+" move, added a sanity
assertion `canReachSuperMax(megaSpecies) === true` +
`resolveCandidateMegaLevel(megaSpecies, "super-max") === "super-max"`) since
a regression test that silently stops testing what it claims is worse than
one that fails loudly — nothing in CLAUDE.md's testing discipline directly
names this case, but it's the same spirit.

## What did NOT need touching (verified, not assumed)

`teamRaid.ts`/`speciesReport.ts`/`rosterPlanner.ts`/`powerUp.ts`'s own
`megaLevel` doc comments already said "routes through/reuses/shares
resolveCandidateMegaLevel's gate rather than re-deriving it" — left them
as-is (judgment call: a "see X" pointer stays accurate when X's own behavior
gains a new clause; restating the clamp 6 more times across files is exactly
the duplication this codebase's comments elsewhere avoid). Only touched a
file's own doc text where the file EITHER got new code
(`resolveCandidateMegaLevel`, `ivComparison.ts`) OR structurally could never
route through the shared gate at all (`breakpoints.ts`). Flag if a future
session thinks the lighter-touch files need their own explicit mention too.

Every fixture across `breakpoints.test.ts` (no species object, unaffected by
construction), `ivComparison.test.ts`, `megaLevelPowerUpCeiling.test.ts`'s
OTHER tests, `powerUp.test.ts` (4 separate local `megaSpecies` fixtures,
ALL already carry a "+" move), `speciesReport.test.ts`,
`sustainedComparison.test.ts`, `teamRaid.test.ts`, `scenario.test.ts`,
`teamScenario.test.ts` was checked individually (grep every `"super-max"`
occurrence with context, not sampled) and confirmed either already eligible
or not exercising the clamp path at all (pure codec round-trip tests never
run combat resolution). This was NOT a quick assumption — see the full
per-file audit trail in this session; worth repeating for any future change
to `resolveCandidateMegaLevel`'s behavior.

## Change 2 — comment rewrite only, zero behavior change

`MEGA_LEVEL_PLUS_MOVE_POWER_MULTIPLIER`'s doc comment's confidence framing
was rewritten to split CONFIDENCE — EXISTENCE (now CONFIRMED: a Mega Level 3
Mewtwo's move-info screen visibly shows a changing "+" move power number,
per direct user observation 2026-09-10) from CONFIDENCE — MAGNITUDE (still
`[community-estimate]` — the observation confirms A number moves, not that
it moves by exactly +10%/tier). Added a "DIRECTLY CHECKABLE FUTURE TEST"
paragraph naming exactly what a future confirming reading needs (move name,
the Mega Level tier AS LABELLED IN THE CLIENT at read time, displayed
power). The NUMERIC-COINCIDENCE WARNING paragraph (1.3 vs uptime.ts's
DEFAULT_MEGA_BOOST_MULTIPLIER) was verified byte-for-byte UNCHANGED via a
diff against `git show HEAD` — per the task's explicit "keep exactly as is."

**A genuine ambiguity flagged in the new comment rather than silently
resolved either way**: the task's own framing called the user's Mewtwo a
"Mega Level 3 ('Max')" Pokémon. But this file's OWN pre-existing
`SUPER_MAX_EFFECTIVE_LEVEL_BONUS` comment cites an independent GitHub gist
source calling Super Max itself "Mega Level 4." If that numbering holds,
"Level 3" the user cited would be THIS codebase's "max" tier, not
"super-max" — which would be a much bigger finding (a "+" move possibly
visible/scaling before Super Max at all, contradicting this file's own
"Super Max... unlocks a '+' move" framing) than a simple comment rewrite
should resolve unilaterally. Deliberately did NOT assert either mapping in
the rewritten comment — instead noted the client's own tier-numbering was
never confirmed by the observation, only that a number changes, and made
that the first thing a future confirming reading needs to pin down. Flag
this tier-numbering question for `pogo-researcher` if it becomes relevant —
not something I resolved or should have resolved from a comment-rewrite ask.

## Operational note (not new — reconfirmed)

Hit [[feedback_concurrent_sessions_shared_worktree]] live during this
session: a `packages/web` typecheck ran once with 16 unrelated errors
(`DefenderEffectiveness.label`/`.tone`, nothing to do with this task), then
0 errors moments later with no action from me — a concurrent agent's edits
landing mid-session. Did not chase or fix; confirmed my own change's safety
narrowly instead (engine-only typecheck clean; the one real external
consumer of `resolveCandidateMegaLevel`,
`runAttackDefenseBreakpoints.ts`, passes a full `SpeciesDefinition` so the
widened Pick type is compatible by inspection). Full-monorepo typecheck is
not a trustworthy signal of MY correctness while other agents are mid-edit
in a shared worktree — don't treat a red/green flip there as caused by your
own change without checking which files actually differ.
