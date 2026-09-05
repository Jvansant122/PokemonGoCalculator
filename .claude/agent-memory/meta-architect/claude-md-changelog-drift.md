---
name: claude-md-changelog-drift
description: This project's CLAUDE.md repeatedly accumulates incident-narrative prose ("an earlier version did X, a real bug, fixed") inside otherwise-durable architecture bullets; the fix is to keep the resulting rule and cut the story.
metadata:
  type: project
---

Observed on 2026-09-04 after a single long, high-velocity session (5 commits, CLAUDE.md and
HANDOFF.md both edited incrementally many times). Found and trimmed four spots where a durable
architectural fact was prefaced or trailed by pure incident narrative that added no new
guardrail beyond the fact itself, and was already fully covered in HANDOFF.md's session log:
- Off-type mega-boost bullet ("an earlier version gave off-type teammates 1x... a real bug, fixed")
- GameMaster-loader bullet ("this bit the first sync pass and was fixed in scripts/sync-data.ts, not silently worked around")
- Scenario-interface bullet (a growing enumerated list of specific field names that had triggered the "add it to the Scenario interface too" bug — left as an open-ended list this would grow forever)
- Mega Skarmory fixture note (a full "user caught it, 8x outlier, fixed to 250" retelling of HANDOFF.md's item 4, verbatim)

**Why:** git history and HANDOFF.md already own the point-in-time story; CLAUDE.md pays its
token cost every session for every agent (see [[project-config-shape]]). Not every "earlier
version did X" sentence is bloat, though — kept two of this shape because they carry forward-
looking value beyond narration: (1) the combat-phase-toggle-removal note at the top of the file
(explains why `simulateOpeningBurst`/`runComparison` still exist despite not being wired into
the UI — without it they look like dead code), and (2) the "do not reintroduce a fixed
opening-burst-window default" line in the Combat section (explicitly says don't-do-X and why,
not just that X used to be true).

**How to apply:** when reviewing CLAUDE.md, the test isn't "does this mention a past bug" — it's
"does the sentence still do work if you delete the word 'earlier'/'was'/'until'." If the
remaining rule is self-sufficient without the incident framing, and the incident is still
findable in HANDOFF.md or git log, cut the framing. Full detail of the trim: see
`CLAUDE.md` commit around 2026-09-04 (meta-architect audit) — no separate memory of the exact
diff kept here since the file itself is authoritative going forward.
