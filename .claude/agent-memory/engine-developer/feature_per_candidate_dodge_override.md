---
name: feature-per-candidate-dodge-override
description: SustainedComparisonInputs.candidateDodge/candidateDodgeFastAttacks and Scenario's matching fields — per-candidate dodge override on the Comparator only, not Team Raid
metadata:
  type: project
---

Implemented 2026-09-08. The Comparator's shared "Dodge boss's charged attacks" setting
(`dodge`/`dodgeModel`) stays the default for both candidates, but each candidate can now override
it individually — comparing a bulky mon played with no dodging against a glass cannon played with
perfect dodging is a real A-vs-B question this product's ranking-flip thesis depends on.

**Schema, matched-by-index to `candidates`, `null`/absent falls back to the shared value**:
- `comparison.ts`'s `SustainedComparisonInputs.candidateDodge?: (DodgeBehavior | null)[]`
- `comparison.ts`'s `SustainedComparisonInputs.candidateDodgeFastAttacks?: (boolean | null)[]`
- `scenario.ts`'s `Scenario.candidateDodge: [DodgeBehavior | null, DodgeBehavior | null]` (required
  field on the interface, matching `candidateMegaBoostDisabled`'s style)
- `scenario.ts`'s `Scenario.candidateDodgeFastAttacks: [boolean | null, boolean | null]`

Resolution inside `runSustainedComparison`'s `candidates.map`: `inputs.candidateDodge?.[i] ?? dodge`
and `inputs.candidateDodgeFastAttacks?.[i] ?? dodgeFastAttacks` — `??` (not `||`) so an explicit
`false` override survives and isn't treated the same as `null`/absent.

**`compareAcrossBossChargedMoves` needed ZERO code changes** — it already forwards its whole
`inputs` object via `{ ...inputs, bossChargedMoveId: chargedMove.id }`, so the two new optional
`SustainedComparisonInputs` fields flow through automatically as a pure passthrough.

**`runComparison`/`ComparisonInputs` (the opening-burst path) deliberately NOT touched** —
`combat.ts`'s `simulateOpeningBurst` takes its `dodge` param as `_dodge` (prefixed, genuinely
unread; only `dodgeFastAttacks` does anything during the opening burst, since the boss never
throws a charged move there). Adding a per-candidate override to a param the underlying function
ignores would be a field that does nothing — didn't add it. If a future request wants
per-candidate dodge on the opening-burst/acceptance-pin path specifically, `combat.ts`'s
`simulateOpeningBurst` would need to actually start reading `dodge` first (it currently doesn't,
by design — only `dodgeFastAttacks` matters when the boss only has a fast move).

**`decodeScenario` needed ZERO new logic** — it's a plain `JSON.parse(json) as Scenario` cast with
no schema validation/defaulting of its own (confirmed by checking how `candidateMegaBoostDisabled`
is handled: same pattern, no special-case code). A pre-existing share link that predates these two
fields decodes fine; the resulting object simply lacks the keys at runtime (typed as present but
actually `undefined`). Backward-compat is a downstream-consumer responsibility (packages/web must
do `s.candidateDodge ?? [null, null]` the same way it already does
`s.candidateMegaBoostDisabled ?? [false, false]` in `ComparatorView.tsx`) — NOT engine-side.

**AFFECTS / follow-up for web-developer**: `packages/web/src/ComparatorView.tsx`'s
`ComparatorScenario extends Scenario` now fails to typecheck — `assumptionsToScenario` builds a
`Scenario` object literal missing the two new required properties (single TS2739 error, confirmed
via `npm run typecheck`). This is expected and intentional per this task's scope (engine-only pass,
web pass to follow) — `web-developer` needs to add UI controls, extend `Assumptions`, and wire
`assumptionsToScenario`/`scenarioToAssumptions` (with the `?? [null, null]` fallback pattern) plus
run `check-scenario-roundtrip`.

**Team Raid (`teamScenario.ts`/`teamRaid.ts`) deliberately NOT touched** — `TeamAssumptionPanel.tsx`
already documents dodge as roster-wide ("dodge skill is a property of the player, not of which of
their own Pokémon is out"), a different, already-settled product call from the Comparator's A-vs-B
one. Don't propagate this pattern there without being asked.

**Test design gotcha worth remembering**: the pinned `CANDIDATE_ALPHA`/`CANDIDATE_BETA` fixtures
(150 effective HP) die to `BOSS_TIDE`'s FAST move alone by 7.5s (see `scenarioA.test.ts`) — using
them directly to test a CHARGED-move dodge override produces byte-identical results regardless of
dodge, because the candidate is already dead before the charged-move dodge setting could ever
matter. Had to spread a bulkier one-off variant (`{ ...CANDIDATE_ALPHA, baseStamina: 1000 }`) in
`sustainedComparison.test.ts` to get a fight long enough for the boss's charged move (and dodging
it) to actually move the needle on `meanSecondsSurvived`. Verified empirically via a throwaway tsx
script before committing to the test numbers (not hand math) — same discipline as
`test/fixtures/hypotheticalDuo.ts`'s own pinned-number derivations.

Tests added: `packages/engine/test/scenario.test.ts` (round-trip of a non-default per-candidate
override; decoding a scenario JSON pre-dating these two fields doesn't throw and leaves them
`undefined`) and `packages/engine/test/sustainedComparison.test.ts` (new describe block: omitting
both fields is byte-identical to today's shared-dodge behavior; a per-candidate `dodge` override
changes only that candidate and leaves the other candidate's result `toEqual` the baseline exactly;
`candidateDodgeFastAttacks` preserves an explicit `false` override rather than conflating it with
`null`).
