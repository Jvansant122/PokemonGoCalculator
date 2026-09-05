---
name: feature-boost-persists-through-faint
description: How SpeciesDefinition.boost.persistsThroughFaint and uptime.ts's fightDurationSeconds param work, and why PRIMAL_KYOGRE now has a boost field
metadata:
  type: project
---

Implemented 2026-09-05 (routed from a `pogo-researcher` proposal, see
`.claude/agent-memory/pogo-researcher/proposal_boost_persists_through_faint.md` and
`fact_mega_boost_persists_after_faint.md`).

**Schema**: `SpeciesDefinition.boost.persistsThroughFaint?: boolean` (types.ts) — intrinsic
species metadata, NOT a `Scenario` field (this was an explicit product call carried over from the
proposal: the standing-decision doc already treats `boost.multiplier`/`boost.boostedType` the
same way). [community-consensus] — Bulbapedia citing a March 2023 Reddit crowd-test, not
Niantic-official. True only for Primal Groudon/Kyogre and Mega Rayquaza per current evidence;
every standard mega defaults to false/undefined (boost ends the instant it faints).

**Mechanics**: `uptime.ts`'s `convertUptimeToTeamDamage` gained two new optional inputs,
`persistsThroughFaint` and `fightDurationSeconds` — when both are present, the boost's
team-damage time window becomes `max(fightDurationSeconds, secondsSurvived)` instead of just
`secondsSurvived`. Omitting either preserves the exact prior behavior (every existing caller that
doesn't pass them is unaffected — checked via the full test suite). `Candidate` (used by
`findCrossoverPartySize`) got the matching `persistsThroughFaint?` field, and
`findCrossoverPartySize` gained a trailing optional `fightDurationSeconds` param (shared across
both candidates — same raid encounter length). `CandidateResult` (comparison.ts) now also
surfaces `persistsThroughFaint` alongside its existing `boostMultiplier`/`boostedType`.

**Fixture impact, checked and found NOT to shift anything**: `PRIMAL_KYOGRE`
(`fixtures/scenarioA.ts`) previously had NO `boost` field at all — it's only ever used as a raid
BOSS in this project's tests, and boss-mode damage calc never reads `SpeciesDefinition.boost`.
Gave it `boost: { multiplier: 1.3, boostedType: "water", persistsThroughFaint: true }` (the
factually-correct real-game default) — verified this doesn't touch a single Scenario A/B pinned
number, so no threshold re-derivation was needed. Added a small fixture-metadata test in
`scenarioA.test.ts` (separate describe block, doesn't touch the pinned acceptance tests) to guard
this.

**Not wired into `packages/web` yet** — `App.tsx`/`sensitivity.ts` build `convertUptimeToTeamDamage`
calls inline reading `species.candidates?.[i]?.boost?.multiplier` directly rather than going
through a `Candidate` object; they'd need to also pass `persistsThroughFaint` and
`fightDurationSeconds` (e.g. the sustained comparison's `maxSeconds`) to actually surface this in
the UI. That's `web-developer`'s call on when/how to wire it in — the engine-side plumbing is
ready and fully backward-compatible either way.
