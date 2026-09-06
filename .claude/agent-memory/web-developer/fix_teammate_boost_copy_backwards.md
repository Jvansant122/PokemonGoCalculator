---
name: fix-teammate-boost-copy-backwards
description: Mega/primal boost copy said "your party/teammates" but the real mechanic only ever boosts other trainers simultaneously in the same raid lobby, never the mega-bringer's own bench
metadata:
  type: project
---

A research pass (corroborated across Bulbapedia, Pokémon GO Hub, and Niantic/TPC's own
"A Guide to Mega Evolution" page, 2026-09-05) confirmed the mega/primal team-wide damage boost in
real Pokémon GO never applies to the mega-bringer's own party/bench — only to *other trainers*
simultaneously present in the same raid lobby, who reciprocally boost each other back if they've
also brought a mega/primal. A solo trainer only has one Pokémon active in a raid at a time, so
there is no "own bench" for the boost to reach at all.

The shipped copy (`partySize`/`teammateDps`/`matchingTeammateCount` labels, tooltips, and doc
comments) described this as the user's own party/teammates, which is backwards. Fixed as a
copy-only pass (no math/formula change — `convertUptimeToTeamDamage`'s arithmetic was already
correct regardless of whose Pokémon the count represents):

- `AssumptionPanel.tsx` — the 3 labels + tooltip for partySize/teammateDps/matchingTeammateCount
  now say "other trainers also in this raid" / "other trainers' DPS" / "other trainers matching
  boost type", and the tooltip spells out the "never this candidate's own bench" reasoning.
- `App.tsx` — the result-card `<dt>` ("Other trainers' damage from this candidate's boost"), the
  comment above it, and the "Known caveats" paragraph (previously "every teammate... whole party").
- `DamageOverTimeChart.tsx` — the crossover-note caption ("N teammates, M matching type" → "N
  other trainers in this raid, M matching type").
- `sensitivity.ts` — the three user-visible `label` strings rendered by `SensitivityView.tsx`
  ("Teammates" → "Other trainers in this raid", "Matching teammates (of party)" → "Other trainers
  matching boost type (of raid)", "Average teammate DPS" → "Average DPS of other trainers"), plus
  the distanceLabel wording ("teammate(s)" → "trainer(s)") and nearby comments.
- `BossMovesetSweep.tsx` — one caveats-paragraph mention of "party" → "other trainers".

**Deliberately left unchanged**: internal identifier names (`partySize`, `teammateDps`,
`matchingTeammateCount` as prop/field names and `Assumptions`/`Scenario` keys) — renaming those
would ripple into the URL round-trip and engine call shapes for zero user-visible benefit, and
the task was scoped to copy/doc-comments only. Also left `packages/engine/src/uptime.ts`'s two
doc comments ("every party member", "whole party") **unedited** — that file is `engine-developer`'s
to touch, not mine (I never edit `packages/engine`); flagged it back in the same session's report
instead of quietly working around it.

**Why this matters for future copy passes**: when a research finding says existing UI copy is
factually backwards, grep broadly for the same words (`teammate`, `party`) across *all* of
`packages/web/src`, not just the locations a bug report names explicitly — the report here named
4 spots but the same wrong framing had propagated into `sensitivity.ts`'s rendered labels and
`DamageOverTimeChart.tsx`'s caption too, which would have been left inconsistent with the
just-fixed `AssumptionPanel.tsx` if not caught.

See also [[verification_without_browser_tool]] for the build/serve/grep-the-bundle verification
ladder used here (no browser tool was available this session either).
