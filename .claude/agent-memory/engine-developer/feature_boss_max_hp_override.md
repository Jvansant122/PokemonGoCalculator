---
name: feature-boss-max-hp-override
description: bossMaxHpOverride field (SustainedComparisonInputs/SpeciesReportBossTarget) letting a historical raid be simulated at its real, era-correct HP instead of today's tier stats
metadata:
  type: project
---

Added 2026-09-07 to fix a real, sourced accuracy bug: Species Report backfills ~549 historical
raid bosses from archives that record a TIER LABEL, but Niantic's 2020-08-27 merge folded old
tier-2 into today's tier-1 and old tier-4 into today's tier-3 — so simulating a historical tier-2
raid at today's tier-1 HP (600) understates it 3.0x, and tier-4-at-tier-3 (3600) understates it
2.5x. Verified against Bulbapedia's difficulty-table footnotes.

**Exact contract** (packages/engine only, no web/data/scripts touched):
- `bossEffectiveHp(boss, tier?, maxHpOverride?: number)` (comparison.ts) — new 3rd param. When
  defined, wins over BOTH the precomputed-baseStamina pass-through AND the real-tier lookup.
  Throws (`!Number.isFinite(v) || v <= 0`) on a non-positive/non-finite value — a deliberate
  choice (matches this codebase's existing throw-on-malformed-input precedent: missing moves,
  oversized roster) over silently ignoring it, specifically so a caller can't accidentally model a
  0-HP boss that "dies" instantly and reports absurd TDO.
- `SustainedComparisonInputs.bossMaxHpOverride?: number` (comparison.ts) — threaded straight into
  `bossEffectiveHp`. `runSustainedComparison` now also computes `bossMaxHp` once (outside the
  per-candidate map, since it's boss-only) and returns it on every row via a **new field on
  `SustainedCandidateResult`: `bossMaxHp: number`**. This is the one non-obvious design call: the
  stepwise simulator (`simulate.ts`) has **zero boss-HP field and never consumes HP for
  termination at all** (confirmed via an existing test comment in `speciesReport.test.ts`: "boss
  HP is only ever modeled downstream, by teamRaid.ts's post-processing") — so overriding it cannot
  and does not change any existing distribution number (`meanTotalDamage`,
  `meanSecondsSurvived`, etc.). It only changes the new `bossMaxHp` field itself. Purely additive:
  omitted/undefined leaves every existing field byte-identical.
- `SpeciesReportBossTarget.bossMaxHpOverride?: number` (speciesReport.ts) — passed straight through
  to `runSustainedComparison`'s field of the same name. Overrides HP only; `tier` still drives the
  attack/defense multiplier and the displayed label (orthogonal, by design — Bulbapedia's
  difficulty table only records CURRENT tier multipliers, not retired ones, so era-correcting the
  ~8% multiplier residual (0.73 vs 0.79) isn't sourceable the way era HP is; documented as a known,
  deliberate residual rather than pretended-away).

**Web contract for whoever wires this up next**: read `row.sustained.bossMaxHp` off each
`SpeciesReportRow`, or pass `bossMaxHpOverride` on a `SpeciesReportBossTarget` entry. No
`Scenario`/`SpeciesReportInputs`-level field was needed since the override lives per-target, not
as a global assumption.

Tests: `raidBossTier.test.ts` (bossEffectiveHp override unit coverage + invalid-value rejection),
`sustainedComparison.test.ts` (additive-purity + bossMaxHp field, general path), `speciesReport.test.ts`
(the exact regression case: same species/tier, override 9000 vs default 3600, asserts exactly 2.5x
via the public `sustained.bossMaxHp` field — not internals).
