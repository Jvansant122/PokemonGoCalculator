---
name: feature-scenario-show-detailed-assumptions
description: Scenario.showDetailedAssumptions added to the Comparator (2026-09-10); absent-decode-true judgment call and why; the real finding that TeamScenario (engine) does NOT actually carry this field despite the task assuming it did — it's a web-only TeamRaidView.tsx bolt-on
metadata:
  type: project
---

Added `showDetailedAssumptions: boolean` to `Scenario` in `packages/engine/src/scenario.ts` — pure
engine-side plumbing so `web-developer` can gate the Comparator's dodge controls
(`dodgeModel`/`dodgeFastAttacks`/`candidateDodge`/`candidateDodgeFastAttacks`),
`holdChargedMoveUntilSafe`, and `minFightLengthSeconds` ("extend simulated window") behind one
advanced-assumptions toggle, mirroring the Team Raid Simulator's existing UI pattern. Zero
`comparison.ts` change — this field is pure UI state, read by nothing in the simulation, same as
the precedent it mirrors.

## Real finding: the task's own precedent framing was inaccurate — verify before trusting it

The task said to add this "matching how TeamScenario carries its own" — **but `teamScenario.ts`'s
actual `TeamScenario` interface has NO `showDetailedAssumptions` field at all.** Confirmed by
reading the file directly rather than trusting the description. The real Team Raid implementation
is a `packages/web`-only bolt-on: `TeamRaidView.tsx`'s `TeamScenarioWithShadow extends
Omit<TeamScenario, "slots">` adds `showDetailedAssumptions?: boolean` (and `isShadow`,
`bossChargedMoveCadence`) locally, relying on `encodeTeamScenario`/`decodeTeamScenario` being bare
`JSON.stringify`/`parse` with no field enumeration to pass the extra field through the shared
transport for free. `TeamRaidView.tsx`'s own comment on that field says explicitly: "folding this
in properly [into the engine] is their [engine-developer's] call, not something web-developer
should force by editing packages/engine" — i.e. this exact deferred decision was sitting there
unresolved until this task exercised it, on the Comparator side.

I followed the task's explicit, direct instruction (add a genuine field to the engine's `Scenario`)
rather than replicating the web-bolt-on pattern, since a real engine field is strictly the more
correct home for a `Scenario`-family type's own field and the task asked for it point-blank. **This
means the Comparator and Team Raid tabs now handle the identical concept two different,
inconsistent ways** (Comparator: real engine field; Team Raid: web-only extension type) — flag this
if a future session is asked to reconcile them; the fix would be moving `showDetailedAssumptions`
(and probably `isShadow`/`bossChargedMoveCadence` too) onto the real `TeamScenario` interface in
`teamScenario.ts`, not the other direction.

**Lesson for next time**: a task description naming a specific file/field as an existing precedent
is a claim, not a fact — this is the second time in this project a "X already does this, copy the
shape" instruction turned out to be wrong about the actual file
([[feature_super_max_eligibility_gate]]'s "task named the wrong risk area" is the first). Read the
named file before writing the analogous code, not just before finishing.

## Type shape: required, not optional — a deliberate departure from the literal "copy the shape" reading

`Scenario`'s own established convention for every prior late-added field
(`candidateMegaBoostDisabled`, `candidateMegaLevel`, `candidateDodge`, `candidateDodgeFastAttacks`,
`weather`) is REQUIRED typing (`field: T`, never `field?: T`) even though `decodeScenario` does zero
runtime validation and an old link genuinely produces `undefined` at runtime — the required typing
is a deliberate forcing function so every `Scenario` object-literal CONSTRUCTION site (i.e.
`packages/web`'s `assumptionsToScenario`) fails to compile until updated, per
[[feature_per_candidate_dodge_override]]/[[feature_super_max_plus_moves_and_mega_level]]'s
"packages/web typecheck fallout (expected)" precedent. Declared `showDetailedAssumptions: boolean`
(required) to match — NOT `?:` like `TeamScenarioWithShadow`'s bolt-on field, which is optional only
because it's a web-side EXTENSION of a type it doesn't own. Confirmed this produces exactly the
expected single new TS2741 error at `ComparatorView.tsx(91,3)` ("Property 'showDetailedAssumptions'
is missing... but required in type 'ComparatorScenario'") on `npm run typecheck` (both
`typecheck:web` and `typecheck:scripts` surface the identical single error) — no other fallout
anywhere, confirming the change is otherwise fully isolated. `npm run check-scenario-roundtrip`
stayed green untouched, because that script only reads `packages/web`'s OWN `Assumptions`
interfaces, which don't have the new field yet either — it will start covering this field
automatically once web-developer adds it there, same as every prior engine-side-first field
addition.

## The absent-decode-default judgment call: chose `true`, not `false`

Task asked me to pick between absent-decodes-as-`false` (consistent with Team Raid's own
`DEFAULT_TEAM_ASSUMPTIONS.showDetailedAssumptions = false`, tidier) and absent-decodes-as-`true`
(old links keep showing/using what they showed). Chose **`true`**, reasoning:

1. Every Comparator link ever shared before this field existed was authored under "everything
   visible, nothing collapsed" — there was never a stable "today's implicit behavior" default to
   preserve the way `weather: "none"` or `candidateMegaLevel: null` preserve one; `true` is the
   only reading that reproduces that history exactly.
2. `false` risks more than a cosmetic collapsed panel: I don't control how `web-developer` will
   wire the gate, and Team Raid's own sibling field's existence proof
   (`effectiveBossChargedMoveFrequencySeconds`) is that a `showDetailedAssumptions`-style flag CAN
   drive an actual value substitution, not just hide UI — so the conservative,
   correctness-protecting choice from the engine side is the one that can't possibly change a
   computed result for an old link, regardless of what web-developer builds next.
3. It matches the one existing sibling precedent for this exact field NAME elsewhere in the same
   codebase (`TeamScenarioWithShadow`'s `showDetailedAssumptions ?? true`), which is a real
   consistency argument `false` doesn't have (`false` would make the SAME field name mean different
   absent-decode semantics on two different tabs).

**Implementation matches the codebase's existing convention, not a new mechanism**: `decodeScenario`
itself does zero defaulting (bare `JSON.parse` + cast, confirmed unchanged, matching every sibling
field) — the `true` default is documentation-only in `scenario.ts`'s own field comment (mirroring
how `weather`'s "Defaults to 'none'" comment works today), plus a pinned executable assertion in the
new test (`decoded.showDetailedAssumptions ?? true`). Enforcing it for real is `packages/web`'s job
in its own `scenarioToAssumptions`, exactly the same handoff as every previous field addition.

## Tests

`packages/engine/test/scenario.test.ts`: added `showDetailedAssumptions: true` to the shared
`sampleScenario` fixture, plus two new tests — round-trips both `true` and `false` through
encode/decode AND the full URL path (not just one direction), and decodes a pre-existing-field JSON
payload (built the same "destructure the key out, re-stringify, re-encode" way as the
`candidateMegaLevel`/`candidateDodge` legacy-decode tests) to confirm it reads back `undefined` (not
a silently-injected default) while `?? true` recovers the intended fallback. Full suite: 418 passed
(scenario.test.ts went 14 -> 16).
