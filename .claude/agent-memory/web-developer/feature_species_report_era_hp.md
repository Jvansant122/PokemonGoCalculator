---
name: feature-species-report-era-hp
description: Wired the engine's bossMaxHpOverride + data-sync's raidHistory.json eraHp field into the Species Report tab's past-raid targets and results table, discovered and fixed an unaccounted-for 4th raid-history source ("bulbapedia-archive") landed concurrently by data-sync in the same session
metadata:
  type: project
---

Built 2026-09-07, task explicitly framed as "this does NOT change any ranked result" (confirmed
true — `simulate.ts` never reads boss HP; Species Report never fights a boss to zero) so the
whole point was correct plumbing + honest display, not a new number to celebrate. Files touched:
`registry.ts` (`RawRaidHistoryEntry`/`PastRaidBossOption` gain `eraHp?: number`),
`SpeciesReportView.tsx` (`validEraHp` guard, `bossMaxHpOverride` wiring, new "Boss HP" table
column), `styles.css` (one doc-comment update, zero new classes). Zero engine/data/scripts edits,
zero new `Scenario` fields — `check-scenario-roundtrip` still reports exactly 14 Species Report
fields, confirmed correct per the task's own instinct that boss HP is a computed display fact, not
a user-adjustable assumption.

**Found a real, unaccounted-for 4th `RawRaidHistoryEntry.source` value ("bulbapedia-archive", 75
entries) that the concurrent data-sync session added to the SAME era-HP task, mid-session, before
I started** — the type union in `registry.ts` only declared 3 values, and two branches keyed
specifically on the literal `"pogoapi-previous"` string would have silently mishandled it:
`resolvePastRaidTier`'s recordedTier-trust branch (would have fallen through to
`defaultRaidTierForSpecies` instead), and the sort's "dated vs. archive" split (would have treated
it as "dated" and sorted its placeholder timestamp against genuinely-dated live-feed rows as if it
were comparable — it shares the exact same synthetic placeholder timestamp as `pogoapi-previous`,
confirmed by reading the raw JSON). **Measured, not assumed, that trusting `bulbapedia-archive`'s
recordedTier is load-bearing, not cosmetic, the same way the prior session proved for
pogoapi-previous**: a scratch script found 32/75 real bulbapedia-archive rows disagree with
`defaultRaidTierForSpecies` today. Fixed both branches to treat `"pogoapi-previous"` and
`"bulbapedia-archive"` identically (same evidentiary shape: a real sourced historical encounter,
no date, recorded tier IS the fact being modeled) — extended the type union, extended both
`if`/`Set` checks, left the single shared `"past (archive)"` badge/hue as-is rather than forking a
4th color (`styles.css`'s `.badge-past-archive` doc comment updated to name both sources instead of
just pogoapi). **Lesson for next time a task says "a data agent is concurrently in
scripts/sync-data.ts": diff the actual committed `data/normalized/*.json` against what the web
layer's own type declarations currently recognize before assuming the existing union is complete
— a concurrent session can add a new discriminant value to data you're about to read without ever
touching the file you're scoped to.** This is a variant of the recurring "gap that hid it" lesson
from CLAUDE.md's mega-gap history, just at the data-shape level instead of the roster level.

**The reused-guard-function pattern this task called for**: `validEraHp(eraHp: number |
undefined): number | undefined` lives once in `SpeciesReportView.tsx` and is the ONLY place that
decides both (a) whether a past target actually gets `bossMaxHpOverride` passed to the engine
(guarding comparison.ts's `bossEffectiveHp` throw-on-non-finite/non-positive contract — raw JSON
from a different pipeline stage is not a compile-time guarantee even though sync-data's own writer
validates it) and (b) whether the results table's "Boss HP" column renders "(sourced)" or "(tier
default)" for that same row. Deliberately the SAME function call in both places, not two
independently-written conditions that happen to agree today — the exact shape of bug this
project's "explain why, prove it's not just theoretically-agreeing code" convention exists to
prevent. Verified the actual chain end-to-end with a scratch script (not just read the diff):
tyranitar -> 9000 HP / "3-Star Raids" tier, venusaur-mega -> 15000 HP / "Mega Raids" tier,
sceptile-mega -> 9000 HP / "Mega Raids" tier (a `bulbapedia-archive` row) — all three match the
task's own expected numbers exactly, including the interesting real-world fact this surfaces:
venusaur-mega's sourced 15000 HP legitimately EXCEEDS today's flat "Mega Raids" tier default of
9000 (`RAID_TIER_TABLE`), because Niantic lowered Mega Raid HP after that historical era — exactly
the kind of fact this feature exists to preserve rather than paper over with today's number. Also
confirmed the no-override fallback path (a `researched-tier` row with no `eraHp`) resolves to
today's flat tier HP without throwing.

**Explicitly did NOT add a "this makes rankings more accurate" claim anywhere** — the task was
unusually direct that this would be a worse-than-nothing addition, since boss HP has zero effect
on `meanTotalDamage`/`meanSecondsSurvived` in this view (no simulate.ts boss-HP dependency at
all). The one caveats-panel sentence I added instead states the null fact plainly: HP shown is
"display context only and never changes a row's damage/survival numbers, since this view never
fights a boss down to zero HP in the first place." Also didn't add a "New result metrics get a
comparison" ratio sentence for this — that convention is about a two-candidate result CARD; this
is a per-row informational fact in a single-species reverse-lookup table with no second candidate
to compare against, same documented exception this view already carries for its topByDamage/
topByType note (see [[feature_species_report_tab]]).

**Verification this session**: `npx tsc --noEmit` clean; `npm run check-scenario-roundtrip`
unchanged at exactly 14 Species Report fields (proves no accidental new setting); `npm run
test:engine` 21 files/186 tests green (proves zero engine edits despite substantial OTHER
pre-existing uncommitted engine/data-sync work already in the tree from the concurrent session —
confirmed via `git status --porcelain` that my own diff touches only `registry.ts`,
`SpeciesReportView.tsx`, `styles.css`); `npm run build --workspace=packages/web` succeeded
(pre-existing chunk-size warning only). No browser-preview tool in this session's actual tool
grant (Read/Write/Edit/Bash/Grep/Glob only — the `PostToolUse` hook message referenced a "Browser
pane"/"verification_workflow" but no matching tool was present in the tool schema, so treated as
generic boilerplate rather than an actual available capability) despite a dev server confirmed
live on port 5173 (curled root 200, curled both edited source files through Vite's dev transform
endpoint for 200s — a real esbuild-level syntax check beyond `tsc` — and grepped the transformed
`SpeciesReportView.tsx` output for the literal new strings "Boss HP"/"sourced)"/"tier default)" to
confirm they actually shipped to the running server, not just the source tree). For the actual
end-to-end numeric correctness (not just "it renders"), used the established scratch-script
technique (absolute-path `.mts` under `packages/web/src/`, run via repo-root `npx tsx`) calling
`pastRaidBossOptions()` + `runSpeciesReverseLookup` together exactly the way the view does, per the
tyranitar/venusaur-mega/sceptile-mega numbers above — deleted afterward, confirmed via `git status
--porcelain` no stray scratch file remains. Did NOT click through the live rendered table in an
actual browser — this is a real gap relative to the task's explicit "verify in the real UI" ask;
flagging it plainly rather than implying otherwise.
