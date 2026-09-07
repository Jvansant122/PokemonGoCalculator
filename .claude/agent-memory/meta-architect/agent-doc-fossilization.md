---
name: agent-doc-fossilization
description: Agent bodies in this repo fossilize — they keep describing mechanisms, file paths, sources and pinned numbers that the product code has since changed or deleted. Two full occurrences so far (2026-09-04, 2026-09-07); the method for catching it is to grep every named symbol/path against packages/ and scripts/, never against CLAUDE.md.
metadata:
  type: project
---

**Why this keeps happening:** unlike CLAUDE.md (touched almost every session), an agent body is
only read or edited when someone routes to that agent for an unrelated reason — so a stale claim
can survive for the project's whole lifetime without anyone noticing by casual reading. Agent
bodies also get written *speculatively*, ahead of the feature they describe.

**How to apply:** never audit an agent body against CLAUDE.md — both can be equally stale. Grep
every field name, function name, file path, URL and pinned number it claims exists against
`packages/` and `scripts/` source. Then apply [[claude-md-changelog-drift]]'s test to whatever
incident narrative remains.

**Occurrence 1 (2026-09-04).** `data-sync.md`'s "Hypothetical species" section described a
`data/custom/*.json` + `"speculative": true` merge mechanism that was never built — it dated to
the initial agent-authoring commit, predating the real mechanism. `site-builder.md` had the same
nonexistent `"speculative"` flag, and never mentioned the real `isApproximate` at all.

**Occurrence 2 (2026-09-07), a full nine-agent sweep.** Everything below was found by grepping
source, and every one of them had survived at least one prior audit:
- `data-sync.md`'s entire "## Source" section still presented pogoapi.net as *the* base source
  with a 7-row endpoint table, ~24h after commit `5887d69` made a live PokeMiners GAME_MASTER dump
  the primary value source. One table row (`type_effectiveness`) had never been real at all — the
  type chart is hardcoded in `packages/engine/src/typeChart.ts` and is not fetched.
- Three agents still routed work to `packages/engine/src/fixtures/scenarioA.ts`, deleted
  2026-09-06; that directory is now empty.
- `engine-verifier.md`'s **anchor tests** — its entire reason to exist — pinned four numbers that
  were all wrong after the fixture swap (10.0s/190/221/130 HP vs. the real 7.5s/171/189/150 HP).
  Highest-severity class of fossilization found so far: a verifier with wrong anchors reports
  false regressions.
- `engine-developer.md` claimed all 4 test fixtures carry `statsArePrecomputed: true`; only the
  two bosses do. It also carried a dangling "see `kyogre-primal-attacker` below" pointing at
  nothing.
- Three agents hardcoded a tab count/list that a 5th tab had invalidated (see
  [[project-config-shape]] — this specific drift is now recurring, not incidental).

**Fix pattern that worked both times:** replace the duplicated detail with a pointer to the
authoritative in-repo source (`scripts/sync-data.ts`'s header comment, `AppTab` in `App.tsx`)
rather than restating it in the agent body, since restated detail is what fossilizes *and* it
costs context on every dispatch.
