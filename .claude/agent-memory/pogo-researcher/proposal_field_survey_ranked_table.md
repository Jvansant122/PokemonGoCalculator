---
name: proposal-field-survey-ranked-table
description: proposed 2026-09-05 (open-ended pass) — extend head-to-head compare to a ranked table across the full ~1079 synced real species against one boss, surfacing pairwise ranking flips as party size grows; biggest-scope of the pass's 3 proposals
metadata:
  type: project
---

Status: proposed 2026-09-05, pending overseer decision. Not yet built. Largest-scope of
this pass's three proposals — flagged as such below.

**What it would show:** `comparison.ts`'s `runComparison`/`runSustainedComparison` both
already take `candidates: SpeciesDefinition[]` (a generic array, no hardcoded length) —
confirmed by reading `comparison.ts` 2026-09-05. It's `Scenario.candidates`'s *paired*
fields (`candidateFastMoveIds`/`candidateChargedMoveIds`, both literally typed as
2-tuples `[string | null, string | null]`) and the UI (`AssumptionPanel`'s
`candidateAId`/`candidateBId`) that hardcode exactly two. This proposal: a "field survey"
mode — pick a boss, sweep every (or a filtered subset of) the 1079 synced real species as
candidates, rank them by team DPS at a chosen party size, and highlight where two
adjacently-ranked species swap order as party size (or another assumption) changes —
i.e., the existing flip-point concept applied across the realistic universe of raid
attackers a player actually owns, not just a hand-picked pair.

**Why it sharpens the thesis:** this is the most direct answer to "is there a natural
real-species use case the UI doesn't yet make easy" — right now a player must already
know which two attackers to compare; this instead answers "given my box, what actually
wins here, and does that answer change as my party gets bigger/smaller." It keeps the
ranking-flip framing as the headline (which pairs swap, and at what party size) rather
than reducing to a single "best attacker" leaderboard, which would abandon the thesis.

**Scope/flags — read before routing:**
- **Touches `Scenario`'s shape**: `candidates`/`candidateFastMoveIds`/
  `candidateChargedMoveIds` would need to become genuinely N-length, not 2-tuples. This is
  a real, non-trivial `Scenario` migration (shareable-link backward compatibility matters
  per CLAUDE.md), not a small addition — explicitly flagging this rather than
  under-selling the scope.
- **Adjacency to the ruled-out "Teambuilding Analyzer"**: CLAUDE.md rules out multi-
  trainer mega staggering across a single raid's total HP pool as out of scope. This
  proposal is different — it's still one-attacker-vs-boss at a time, just swept across
  many candidate species rather than coordinating multiple simultaneous trainers/megas —
  but it's adjacent enough that the overseer should confirm this distinction holds before
  routing it, rather than this agent assuming it's clearly fine.
- Performance: sweeping ~1000+ species through `runSustainedComparison` (200 iterations
  each) per assumption change is a real cost question for `engine-developer`/
  `web-developer` to size, not something this research pass can quantify.
