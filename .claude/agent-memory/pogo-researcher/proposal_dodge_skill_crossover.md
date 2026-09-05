---
name: proposal-dodge-skill-crossover
description: Proposed web feature — replace/extend sensitivity.ts's binary none-vs-perfect dodge check with a continuous scan over the already-modeled percentage-missed dodge accuracy; status as of 2026-09-05 is proposed, not yet routed/built
metadata:
  type: project
---

Proposed 2026-09-05 (second ideation pass by this agent). Not yet built, rejected, or routed —
status: **proposed, pending overseer decision**.

**What it would show:** `sensitivity.ts`'s "Dodging" check only tests the binary flip between
`{kind:"none"}` and `{kind:"perfect"}` — it never touches the already-fully-modeled
`{kind:"percentage-missed", missedFraction}` variant, even though that variant already round-trips
through `Scenario.dodgeModel` and already has a live UI slider (`AssumptionPanel.tsx`'s
"Fraction of charged hits NOT dodged"). Most real players are neither 0% nor 100% accurate.
Proposed: scan `missedFraction` from 0 to 1 (e.g. step 0.05) holding everything else fixed, and
report the dodge-accuracy threshold at which the ranking flips — "you need to dodge at least/at
most ~X% of the boss's charged hits for [candidate] to lead" — the same scan-and-report-distance
shape as the existing "Mega boost multiplier" check, applied to a realistic skill axis instead of
an all-or-nothing one.

**Why it sharpens the thesis:** dodge accuracy is a literal, player-controllable survivability
lever, and this makes explicit exactly how much of it is needed before that survivability
converts into enough team DPS to overturn a raw-damage lead (or vice versa) — a direct, concrete
instance of "survivability counted as team DPS, not raw damage," expressed as the flip point the
product's headline is built around, on an axis (dodge skill) a player actually recognizes and can
act on, unlike the more abstract existing axes.

**Standing-decision check:** no new `Scenario` field — `dodgeModel`'s `percentage-missed` variant
and `missedFraction` already exist and are already UI-exposed. Doesn't touch the 1.3 mega-boost
constant or the no-user-selectable-combat-phase decision (dodge skill isn't a phase). Not the
ruled-out Teambuilding Analyzer.
