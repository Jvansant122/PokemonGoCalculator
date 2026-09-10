---
name: feature-team-raid-export-to-power-up-optimizer
description: Export button carrying a Team Raid roster into the Power-Up Optimizer, plus the DEFAULT_TEAM_ASSUMPTIONS units-error correction that reverted the default boss to tyranitar-mega
metadata:
  type: project
---

2026-09-10. Added an "Export roster to Power-Up Optimizer →" button to TeamRaidView.tsx's
existing "Share this scenario" panel (no new panel — task explicitly flagged UI-density
complaints). Mechanism: `packages/web/src/teamRaidExport.ts` exports a pure
`teamAssumptionsToPowerUpOptimizerAssumptions(TeamAssumptions): PowerUpOptimizerAssumptions`,
the button builds a `PowerUpOptimizerScenario` via `PowerUpOptimizerView.tsx`'s own exported
`assumptionsToScenario`, calls `buildPowerUpOptimizerScenarioUrl`, stamps
`view=power-up-optimizer`, and does a REAL navigation (`window.location.href = url`) — not an
App.tsx-lifted-state hand-off like `comparatorPrefill.ts`'s "Compare vs another attacker". A real
navigation is required here because App.tsx's `initialTab()` only reads `view=` once at its own
initial mount; a same-SPA `setTab` call would need new lifted state threaded through App.tsx (the
`comparatorPrefill` pattern), which the task explicitly said to avoid in favor of reusing
`view=`+scenario-param. **Correction to the task's own framing**: it claimed the SpeciesReport→
Comparator hand-off already works via `view=`+scenario-param — it doesn't; that one is genuinely a
lifted-prop mechanism (`ComparatorPrefill`, `App.tsx`'s `comparatorPrefill` state). Two different,
both-legitimate cross-tab mechanisms now exist in this codebase: lifted-prop-for-partial-hand-off
(4-field `ComparatorPrefill`, same-SPA, no navigation) vs. full-navigation-via-scenario-URL
(this feature, full ~20/26-field assumption objects). Don't conflate them when asked to follow
"the existing precedent" — check which one the task's example ACTUALLY does before copying it.

**What carries**: all 6 slots (species/fast/charged/isMega/megaLevel/isShadow, in order), boss
target + its 2 moves, the shared level/IV spread (fans out to every Power-Up slot — that tab's
slots each carry their own), and every assumption both tabs mean identically (dodge, dodgeFastAttacks,
holdChargedMoveUntilSafe, weather, bossChargedMoveFrequencySeconds, bossChargedMoveCadence,
bossStartsPrimed, bossStartingEnergyFraction, raidTimerSeconds, swapCostSeconds, reviveCostSeconds).

**What doesn't, and why 0 not "unknown"**: stardustOnHand/rareCandyOnHand/rareCandyXlOnHand and
every slot's candyOnHand/xlCandyOnHand/isPurified/isLucky land on 0/false. Checked first whether
single-raid mode's own `emptyPowerUpSlot()` has an "unknown candy" concept the way multi-raid's
`candyByFamilyId` map does (absent key = unknown, never 0) — it does NOT; single-raid
`PowerUpSlotAssumption.candyOnHand` is always a plain number and `emptyPowerUpSlot()` itself
defaults to 0. So 0 IS this tab's own "nothing entered yet" resting state, not an invented
number — matches the task's "match whatever that tab already uses for an unfilled value"
instruction exactly, once checked rather than assumed. `mode` always forced to `"single-raid"`;
every multi-raid-only field left at that mode's own inert default (same literal values as
`PowerUpOptimizerView.tsx`'s own `DEFAULT_ASSUMPTIONS`). `rankBy` defaults to `"stardust"` — NOT
listed as a "still need to fill in" gap, since it's a normal always-has-a-value display setting on
the destination, not a resource shortfall. Verified live (dev server, Playwright script, 1920x1080):
after export, every candidate row's AFFORDABLE column reads "x" (0 stardust/candy) — exactly the
expected, honest consequence of not inventing a budget, not a bug.

**No new Scenario field** — `npm run check-scenario-roundtrip` stayed at 114 fields before and
after. The mapping only builds a URL for the Power-Up Optimizer's ALREADY-round-tripped scenario
shape (its own 26 fields are unaffected), so `add-scenario-assumption` didn't apply — confirmed
by rerunning the checker rather than assuming.

**DEFAULT_TEAM_ASSUMPTIONS units-error correction** (same session): a PRIOR session's own doc
comment claimed a Fighting/Steel counter roster "fell ~25% short" / "27.15 vs 30.00 DPS, ~9.5%
short" against tyranitar-mega (9000 HP), used to justify demoting the default boss to plain
"tyranitar" (3600 HP). Re-measured via `npm run run-scenario` against a hand-built share URL (not
just re-running the unit test) — the comparable roster (Mega Mewtwo X/Machamp/Terrakion/Lucario/
Lucario) CLEARS tyranitar-mega at both L35 (280.4s, +19.6s margin, 2 wipes, 13 faints) and L50
(256.1s, +43.9s margin, 2 wipes, 10 faints), exactly reproducing the task's pre-stated numbers.
Root cause of the original error: comparing a MEAN team-DPS statistic against a
`bossHP / raidTimerSeconds` THRESHOLD — not the same quantity, since the threshold assumes zero
downtime while the sim's actual clear time already absorbs swap/faint/wipe costs, so a 256-280s
clear (of 300s) is really ~30-35 EFFECTIVE DPS even when the same run's MEAN-DPS readout shows 27.
Boss reverted to `tyranitar-mega`; `TeamRaidView.tsx`'s `DEFAULT_TARGET_ID`/`DEFAULT_TEAM_ASSUMPTIONS`
doc comment rewritten to record BOTH measurements and flag which one was wrong and why (never
delete history, per the task's own instruction) — see that file for the full text.
**`DYNAMIC_PUNCH` is not on mewtwo-mega-x's movepool — only `DYNAMIC_PUNCH_PLUS` is.** Passing the
wrong id silently falls back to `chargedMoves[0]` (Psychic, flat immune vs. this boss's Dark
typing) with no error — this exact silent-fallback mechanism is suspected as part of how the
ORIGINAL wrong measurement went unnoticed. Always grep the actual `data/normalized/species.json`
entry for a species' real movepool before hand-authoring a default roster; never assume a "+"
move name pattern.

One pre-existing test needed updating (not weakened): `scenarioRoundtrip.test.ts`'s "decodes a
minimal (old-link-shaped) scenario" test spread `...DEFAULT_TEAM_ASSUMPTIONS` to build its expected
object, which silently broke once `DEFAULT_TEAM_ASSUMPTIONS.bossFastMoveId`/`bossChargedMoveId`
became non-null (the decode fallback for an ABSENT field is unconditionally `null`, never derived
from whatever the current default happens to be) — fixed by asserting those two fields explicitly
rather than inheriting them from the spread. A `scenarioRoundtrip.test.ts` object built via
`...DEFAULT_*_ASSUMPTIONS` spread is only safe for fields whose decode fallback truly IS that
default; any field whose fallback is a fixed literal (like `?? null`) needs its own explicit
assertion line, independent of whatever the default currently contains — check this whenever a
tab's own default changes, not just at test-authoring time. Also updated a stale e2e doc comment
in `share-link.spec.ts` (still said "latios-mega" — already two rosters out of date before this
change) to stop naming a specific species at all, since the test's own logic has never actually
depended on which one it is.

Verification: `npm run test:web` (232/232), `npm run verify` (full, green, field count 114),
`npm run test:e2e` (15/15, added one new share-link.spec.ts case for the export button), plus a
live Playwright script against the dev server (localhost:5173, 1920x1080) confirming the roster
and boss names match on both sides of the click with zero console/page errors — see
[[verification_without_browser_tool]] for the general fallback ladder, not needed this session
since Playwright + a running preview/dev server were both available.
