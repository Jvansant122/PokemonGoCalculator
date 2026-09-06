---
name: feature-iv-breakpoints-tier-filtered-headline
description: Follow-up to the full-sweep IV Breakpoints report that added a numeric-tier map, a per-tier win-tally table, and restricted the headline verdict to tier 4+ raids only
metadata:
  type: project
---

Built 2026-09-06 in `IvBreakpointsView.tsx` only, on top of
[[feature-iv-breakpoints-full-sweep-aggregate]] — that memory's `IvSweepAggregate`
shape (`totalComputed`/`countA`/`countB`/`ties`) is now a superset with three new
fields (`byTier`, `tier4Plus`) rather than a replacement; the old fields are still
computed (harmless) but no longer read anywhere in JSX — the headline sentence now
reads exclusively from `tier4Plus`.

**`RaidTier` (engine/src/raidBoss.ts) carries no numeric field** — it's just the 7
label strings the live raid feed emits. The task required a numeric tier (for "4
and higher"), so `RAID_TIER_NUMERIC: Record<RaidTier, number>` was added directly
in `IvBreakpointsView.tsx` (not the engine — this is a display/filtering concern,
no combat formula needs it), with a comment citing the same Bulbapedia "Raid Battle
(GO)" table `RAID_TIER_TABLE` itself already cites, plus the exact numeric mapping:
1-Star=1, 3-Star=3, Mega=4, 5-Star=5, Legendary Mega=6, Primal=6, Super Mega=7.
`TIER_4_PLUS_LABELS` is *derived* from that map via `.filter(n >= 4)` rather than
hand-listing the 5 label strings a second time, so the two can't drift.

**Reused the existing tier-resolution call verbatim** per the task's explicit
instruction: `raidTierForSpeciesId(id) ?? DEFAULT_REAL_RAID_TIER` (needed the actual
resolved tier this time, not `?? undefined`, since bucketing needs a real key —
previously the sweep loop passed `?? undefined` into `bossEffectiveStats` and let
its own internal default apply; now the tier is resolved explicitly up front and
passed through, which changes zero computed stats since `bossEffectiveStats`'s own
fallback is the same `DEFAULT_REAL_RAID_TIER` constant).

**Factored the "Spread X outperforms Y in N of M" sentence into `bucketVerdictSentence(bucket, ivA, ivB, scopeIntro)`**
so the tier-4+ headline reuses the exact tie/win wording instead of forking a second
copy of that ternary — worth reusing again if a third scoped-verdict view is ever
requested (e.g. "tier 5+ only").

**Numeric verification for the real default scenario** (Delphox 14/15/15 vs
15/13/15), via a scratch `.mts` dropped in `packages/web/src/`, run with `npx tsx`,
deleted after (see [[verification-without-browser-tool]]):
- All-tiers (unchanged from the prior sweep): 1081 computed, 0 errors, countA=20,
  countB=1050, ties=11.
- Per-tier buckets: 1-Star Raids (4 targets, B wins all 4), 3-Star Raids (3
  targets, B wins all 3), Mega Raids (4 targets, A wins 1/B wins 3), 5-Star Raids
  (1069 targets, A=19/B=1039/ties=11), Super Mega Raids (1 target, B wins). No
  Legendary Mega Raids or Primal Raids targets exist in the current data-sync
  snapshot (matches raidBoss.ts's own doc comment that the live feed has never
  emitted those two labels yet) — the `byTier` render only shows populated tiers,
  so this is invisible in the UI, not a bug.
- Tier-4+ headline scope: 1074 of the 1081 targets (excludes exactly the 4+3=7
  one-star/three-star targets). Headline sentence: countA=20, countB=1043 (three B
  wins moved from the excluded 1-star/3-star buckets), ties=11 — same "Spread B
  outperforms Spread A in 1043 of them, versus 20..." shape, just smaller M and a
  slightly smaller B count than the old all-species 1050.
- **Confirms the task's own predicted caveat exactly**: since every species without
  live raid data defaults to "5-Star Raids" (already tier 5, already inside the
  4+ scope), the filter's only real effect is excluding the literal handful of
  currently-active 1-star/3-star raids (7 of 1081 today) — the caveat paragraph's
  wording states this with the live numbers plugged in via
  `sweepAggregate.totalComputed - sweepAggregate.tier4Plus.total`, not a hardcoded
  guess, so it'll stay accurate as the raid rotation changes.

**Verification level**: `tsc --noEmit` clean, production build succeeded (same
pre-existing >500kB chunk warning only), `vite preview` served and curled 200, then
grepped the built JS bundle for three new strings ("tier-4-and-higher raid
targets", "Honest limitation", "Breakdown by raid tier") — all present, count 1
each — confirming the change actually shipped. Did NOT click through in an actual
rendered browser (no browser-preview tool in this session's grant either — same
Read/Write/Edit/Bash/Grep/Glob ladder as [[verification-without-browser-tool]]/
[[feature-iv-breakpoints-full-sweep-aggregate]]); numeric correctness was instead
proven by the standalone scratch script mirroring the component's exact call shape,
not by reading rendered DOM.

**No `Scenario` field touched** — same as the full-sweep-aggregate change, this is
a derived report over existing assumptions (`git diff --stat` confirmed only
`IvBreakpointsView.tsx` changed).
