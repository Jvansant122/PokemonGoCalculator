---
name: fix-mega-level-per-individual-comment
description: 2026-09-10 megaLevel.ts doc-comment self-contradiction fixed — removed wrong "per-species" clause, kept per-individual conclusion, added positive same-species-different-levels note; comment-only, no code/type change
metadata:
  type: project
---

`packages/engine/src/megaLevel.ts`'s `MegaLevel` type doc comment contradicted itself: paragraph 1
said Mega Level is raised "per-species, not account-wide" while paragraph 2 (the actual modelling
conclusion, matching how the type is USED everywhere — comparison.ts's candidateMegaLevel,
teamRaid.ts's TeamRaidSlotInput.megaLevel, speciesReport.ts's SpeciesReportInputs.megaLevel — a
per-candidate/per-slot scenario input, never a SpeciesDefinition field) said "per-INDIVIDUAL-Pokémon."
Paragraph 1 was wrong. Root cause: it traced to a Bulbapedia "Mega Evolution (GO)" wikitext
paraphrase; the user corrected it directly from their own account (2026-09-10, first-hand, outranks
a wiki paraphrase — see [[user_pogo_domain_expertise]]): two Pokémon of the SAME species can
legitimately sit at different Mega Levels. MECHANICS.md's "Mega Level: Base / High / Max / Super
Max" section was corrected first (by the orchestrating session) and carries the full provenance —
this file's comment now just agrees with it and points there rather than duplicating the essay.

Rewrote paragraph 1 to "repeatedly Mega Evolving THAT SAME INDIVIDUAL POKÉMON raises THAT
Pokémon's own Mega Level (max once a day)" — dropped the "per-species, not account-wide"
parenthetical entirely rather than trying to salvage half of it (a dangling "not account-wide" with
no "per-species" contrast reads confusingly; paragraph 2 immediately following already states the
real scope precisely). Added a new positive-consequence paragraph after paragraph 2 (explicitly
requested by the task, to pre-empt a future pass "fixing" this into a bug): two roster
slots/candidates holding the same species MAY legitimately carry different `megaLevel` values —
correct, observed behaviour, not an inconsistency to collapse. Zero code/type changes — comment
only; `canReachSuperMax`/`effectiveLevelForMegaLevel`/`chargedMoveAtMegaLevel` untouched.

**Deliberately left open, per explicit task instruction**: whether the user's cited "lvl 3 mewtwo"
maps to this file's `"max"` or `"super-max"` tier. MECHANICS.md's own prose (its "in-game client
displays..." paragraph) now reads as if it's settled this ("Mega Level 3 ('Max') Mewtwos") — but
[[feature_super_max_eligibility_gate]] already flagged this exact mapping as unresolved (a cited
GitHub gist calls Super Max itself "Mega Level 4," which would make "Level 3" = this file's
`"max"`, consistent with MECHANICS.md's parenthetical — but neither source is first-party, and
nothing has directly confirmed the CLIENT's own on-screen tier numbering against this file's four
names). **This is a real, still-unresolved discrepancy between MECHANICS.md's prose (which now
asserts the mapping parenthetically) and this file's own "DIRECTLY CHECKABLE FUTURE TEST"
paragraph (which still treats the mapping as open) — worth reconciling explicitly in a future
pass, not by quietly picking one reading while touching either file for an unrelated reason.** Did
not touch that paragraph this pass, per the task's explicit instruction not to assert either
reading.
