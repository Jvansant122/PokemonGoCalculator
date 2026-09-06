---
name: proposal-iv-sensitivity-checks
description: Proposed engine-agnostic web feature — add per-stat (attack/defense/stamina) IV sensitivity checks to sensitivity.ts's existing panel, since level is swept today but IVs (an equally real, equally uncontrollable-by-the-player variable) are not
metadata:
  type: project
---

Proposed 2026-09-05 (fourth ideation pass, sent directly for implementation per the overseer's
request — not a backlog item awaiting a decision). Status: **proposed, routed for build**.

**What it would show:** `sensitivity.ts`'s `computeSensitivity` currently ships 7 checks (Teammates,
Matching teammates, Mega boost multiplier, Dodge accuracy, Level, Average teammate DPS, Boss
charged-move cadence — all confirmed live 2026-09-05). Every one of `Scenario.ivs`'s three fields
(attack/defense/stamina, each 0-15) is a real, already-adjustable assumption in `AssumptionPanel`
today, yet none of them is swept for a flip the way Level already is. Proposed: three new checks —
"Attack IV," "Defense IV," "Stamina IV" — each scanning 0-15 in integer steps outward from the
scenario's current value for that stat (holding the other two IVs and every other assumption fixed),
reporting the nearest flip exactly like the existing Level check does (same `SensitivityCheck` shape,
so `SensitivityView.tsx`'s `FlipBar` renders it with zero changes).

**Why it sharpens the thesis:** IVs are exactly as real and exactly as outside a player's control at
comparison time as level is — most players are not comparing two hypothetical 15/15/15 megas, they're
asking "does my actual caught specimen still come out ahead?" Attack IV feeds both own-DPS and the
team-damage-attribution term (via `ownBoostMultiplier`/`ownTotalDamage`); defense and stamina IV feed
`secondsSurvived`, which is the literal input to `convertUptimeToTeamDamage`'s team-damage window.
A ranking that only holds at 15/15/15 and flips back at a realistic 10/14/14 catch is precisely the
kind of conditional conclusion this tool's "the flip point is the headline, not a winner" framing
exists to surface — and today the sensitivity panel is silent on it even though Level (a much less
variable real-world input — most serious raiders sit at a similar level range) already gets a full
scan.

**Scope/spec (buildable directly, no clarification round needed):**
- File: `packages/web/src/sensitivity.ts` only. No engine change, no new `Scenario` field — `ivs` is
  already a `Scenario`/`ComparisonInputs`/`SustainedComparisonInputs` field, so nothing new to
  round-trip.
- Extend the local `runSustained` helper's `overrides` param to accept an optional `ivs` override
  (currently accepts `level`/`dodge`/`bossChargedMoveMeanIntervalSeconds`), defaulting to the
  outer-scope `ivs` exactly as `level` defaults to `a.level` today.
- Add three checks, each following the exact pattern of check #5 ("Level"): scan integer deltas
  1..15 outward in both directions from the current IV value, clamped to [0, 15] (the real per-stat
  IV range — no reason to scan beyond it), calling `runSustained({ ivs: { ...ivs, attack: candidateValue } })`
  (and the analogous field for defense/stamina), computing `winnerOf` the same way every other check
  does, and reporting `rangeMin: 0, rangeMax: 15`.
- `SensitivityView.tsx` needs zero changes — it renders whatever `SensitivityCheck[]` it's given.
- No standing decision touched: no combat-phase mode, doesn't vary the 1.3 mega-boost constant
  (checks 1-3 already own that axis), not the ruled-out Teambuilding Analyzer, no new user-facing
  `Scenario` setting.

**Not yet built as of 2026-09-05** (this session's proposal). If accepted, route to `web-developer`.
