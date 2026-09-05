---
name: finding-crossover-party-size-unwired
description: comparison.ts's findCrossoverPartySize exists and is tested but is not called anywhere in packages/web as of 2026-09-05 — a cheap wiring gap, not a new feature to propose
metadata:
  type: project
---

Confirmed by reading `packages/web/src` (grep, 2026-09-05): `findCrossoverPartySize`
(`packages/engine/src/uptime.ts`) — the function that finds the exact party size at which two
candidates' ranking flips, explicitly described in its own doc comment as "the headline output of
Phase 3" — has zero call sites in `packages/web`. The web UI's `sensitivity.ts` independently
reimplements a similar but not identical scan (its own party-size check inside
`computeSensitivity`) rather than calling this engine function directly.

**How to apply:** this isn't a new proposal (the function already exists, tested, and does exactly
what the product's headline calls for) — it's a cheap, low-risk wiring/dedup opportunity worth
flagging to the overseer separately from new ideation: either wire `findCrossoverPartySize`
directly into the web UI (replacing `sensitivity.ts`'s own party-size scan) or confirm the
duplication is intentional (e.g. different search granularity) and document why. Relevant context
for [[proposal-teammate-dps-sensitivity]], which proposes an analogous
`findCrossoverTeammateDps` — worth wiring both into the UI together rather than adding a second
unused engine function.
