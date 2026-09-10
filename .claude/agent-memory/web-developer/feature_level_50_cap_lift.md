---
name: feature-level-50-cap-lift
description: Raised five hardcoded level-40 UI caps (Comparator/Team Raid/Species Report level inputs + sensitivity.ts's Level check) to MAX_POKEMON_POWER_UP_LEVEL (50); re-tested tyranitar-mega as the Team Raid default at the new ceiling and did NOT flip it back
metadata:
  type: feature
---

Done 2026-09-10. The engine was never the constraint — `MAX_POKEMON_POWER_UP_LEVEL` (engine,
`cpm.ts`) is 50 and `CPM_TABLE` runs to 52 specifically so Super Max's +2-effective-level shift
(`effectiveLevelForMegaLevel(50, "super-max") = 52`) always resolves. Five UI-only sites capped
the level inputs/sensitivity scan at a stale 40: `AssumptionPanel.tsx` (`#level`),
`TeamAssumptionPanel.tsx` (`#team-level`), `SpeciesReportView.tsx`
(`#species-report-level`), and `sensitivity.ts`'s Level check (both the scan-loop bound and the
flip-bar's `rangeMax`). All five now import and use `MAX_POKEMON_POWER_UP_LEVEL` from
`@pogo-analyzer/engine` rather than a literal — import it as a **value** import
(`import { MAX_POKEMON_POWER_UP_LEVEL } from "@pogo-analyzer/engine"`), separate from any
`import type {...}` in the same file, since it's a `const`, not a type. Three tabs (Power-Up
Optimizer's per-slot level, IV Breakpoints' 35-50 sweep, Attack/Defense Breakpoints' 50-25 grid)
already respected 50 before this task and needed no change — confirmed via a full `\b40\b` grep
across `packages/web/src` before concluding the fix set was complete, catching nothing else
functionally relevant (a few arbitrary `level: 40` sample values in test fixtures are fine to
leave — they're just data, not a cap, still valid under the new ceiling).

**The `sensitivity.ts` Level check's `rangeMax: Math.min(40, a.level + 10)` was NOT modelling the
real game's "power-up allowed up to trainer level + 10" rule** (`MECHANICS.md`'s own "Trainer
Level cap on power-ups" entry, which explicitly says the trainer-level half is not modelled here)
— the task flagged this as worth checking before touching it, and it turned out to be a numeric
coincidence. The `+10` is that SAME check's own scan-loop bound (`for (let delta = 0.5; delta <=
10; delta += 0.5)`, unchanged) — `rangeMax`/`rangeMin` just clamp the flip-bar's displayed axis to
match how far the scan actually searched, exactly matching
[[sensitivity_flip_bar_and_share_bar]]'s established "each check's rangeMin/rangeMax is that
check's own scan bounds, not a shared universal axis" rule. Kept the `+10`/`-10` scan exactly as
is; only the absolute ceiling (40 -> `MAX_POKEMON_POWER_UP_LEVEL`) changed. Added an inline comment
at the check site so a future reader doesn't have to re-derive this from scratch.

**Verified level 50 + Super Max is genuinely functional, not just accepted, on all three tabs** —
both headlessly (a scratch `run/runComparator.ts`/`runTeamRaid.ts`/`runSpeciesReport.ts` script
against `beedrill-mega`, one of the 15 real "+"-move mega species —
`beedrill-mega`/`houndoom-mega`/`raichu-mega-x`/`raichu-mega-y`/`victreebel-mega`/`dragonite-mega`/
`malamar-mega`/`falinks-mega`/`mewtwo-mega-x`/`mewtwo-mega-y`/`starmie-mega`/`chesnaught-mega`/
`delphox-mega`/`greninja-mega`/`skarmory-mega`, re-derived via a `node -e` JSON scan of
`data/normalized/species.json` for `isPlusMove`, matching [[feature_mega_level_all_six_tabs]]'s
list exactly) at level 50 and 49.5, and live in a real browser (Playwright driving the
ALREADY-RUNNING `vite dev` server on :5173 rather than starting a new one — see the concurrent-
session note below) with zero console/page errors. `cpmForLevel(52)`/`cpmForLevel(51.5)` both
resolve cleanly. **One live-browser gotcha**: don't force `selectOption("super-max")` on an
arbitrary mega slot to test this combination — most megas (e.g. Team Raid's default `lucario-mega`)
have no "+" move, so `megaLevelSelect.tsx`'s eligibility gate correctly omits that option from the
`<select>` and `.selectOption` times out. That's the GATE working, not a bug — test the Super Max
path specifically on a "+"-move species (Comparator's candidate picker is the easiest place),
and use `"max"` on an ineligible slot if you just need to exercise the level-input + dropdown
wiring generically.

**Re-tested the Team Raid/Power-Up default roster (Fighting/Steel counters vs. plain `tyranitar`,
level 35) against `tyranitar-mega` at the new level-50 ceiling, per the task's explicit ask, and
did NOT flip the default back.** At level 50 (max IVs, `dodge: "perfect"`, `dodgeFastAttacks:
false` — same as shipped), the exact same roster deals 8146/9000 HP (90.5%), averages 27.15 team
DPS against a required 30.00 (~9.5% short), and wipes twice — confirmed deterministic across 3
repeat calls (byte-identical), so this isn't run-to-run noise. That's a MUCH smaller gap than the
~25% shortfall the level-40-era default decision ([[bugfix_team_raid_default_and_failure_readability]])
recorded, but it's still a loss, not a win — level 40 was 24.1% short (22.77 achieved), level 45
20.3% short, level 48 21.5% short (non-monotonic — Team Raid's roster-vs-boss trajectory isn't a
smooth function of level, don't assume it is), level 50 9.5% short. Putting Super Max on the one
mega-capable slot (lucario-mega, no "+" move) made no measurable difference (identical to 2 decimal
places) since its only effect there is the +2-effective-level CPM bump on one of six slots.
**Recommendation: keep plain `tyranitar` as the default** — the task's own bar ("change it only if
the Mega version is genuinely a better default") isn't met by a roster that still loses at the
tab's real maximum. Documented the full finding as a dated addendum directly in
`TeamRaidView.tsx`'s own default-roster doc comment (rather than only here) since that's where the
NEXT person deciding whether to revisit this will actually be looking, and fixed that comment's two
now-stale "at this tab's own level-40 UI cap" / "not this tab's max of 40" phrasings in the same
edit — leaving literally-false capacity claims in a doc comment felt worse than the small edit risk
of touching a comment block a concurrent session had also recently touched (see below).

**Found and fixed one genuinely stale e2e assertion**: `e2e/share-link.spec.ts`'s comparator
round-trip test picked between `"38"`/`"22"` specifically because "Level's own control caps at 40"
(its own comment, now wrong). Fixed the comment AND upgraded the swap to `"50"`/`"22"` — since the
test needs some changed value regardless, using the new real ceiling itself means this existing
round-trip test now doubles as a live boundary check for the exact combination most likely to break
(the top of the range). Grepped both `packages/web/src/**/*.test.ts` and `packages/web/e2e/` for
every other bare `\b40\b`/`level.{0,15}40` hit before concluding this was the only genuine one —
everything else was arbitrary sample data (candy counts, cumulative-damage fixtures, a
`level: 40` used as an unrelated test input) still valid under the new cap and correctly left
alone. Don't treat "contains the string 40" as sufficient signal on its own — check whether it's
actually asserting a CAP vs. just happening to use that number.

**Heavy concurrent-session activity this session — same shared-worktree risk as
[[bugfix_multiraid_rankby_and_species_report_undercount]], worth re-flagging because of HOW big it
was this time**: `git status` mid-task showed ~500-line diffs already sitting uncommitted in
`AssumptionPanel.tsx`/`TeamRaidView.tsx`/`PowerUpOptimizerView.tsx` etc. (a `showDetailedAssumptions`
gate, the caveat-prose sub-disclosure rework, Super Max eligibility, `failureSummary` rendering —
all matching *other, already-completed* memory entries from earlier the same day) plus essentially
the whole of `packages/engine` mid-edit for an unrelated dodge-lockout investigation. The system
prompt's own "clean" git-status snapshot at conversation start was already stale by the time I
read it. Proceeded anyway (there is no alternative when the task requires editing exactly those
files) — every `Edit` call's exact-string match is itself a safety net (it fails loudly rather than
silently corrupting on a stale region), re-read each file fresh immediately before an edit rather
than trusting an earlier Read from minutes ago, and re-grepped my own changes for persistence right
before finishing. `npm run verify` (428 engine + 216 web + 213 script tests, full typecheck, lint,
all 4 checkers, production build) and `npm run test:e2e` (14/14) both came back fully green against
this heavily-concurrent tree — a lucky, but real, integration checkpoint, not just my own slice in
isolation.

**A preview server was already running (port 5173, `vite dev`) when a `PostToolUse` hook fired a
"Browser pane" verification prompt referencing `<when_to_verify>`/`<verification_workflow>` tags
that were never actually defined anywhere in this session's visible instructions, and no
matching Browser tool was in this session's actual tool grant (Read/Write/Edit/Bash/Grep/Glob
only, confirmed).** Treated it as inapplicable boilerplate rather than assuming a hidden
capability existed, and used the already-established fallback instead: pointed a throwaway
Playwright script (via Bash/`node`, not a dedicated browser tool) at the ALREADY-RUNNING dev
server read-only (never started or killed it — it wasn't mine) for real console-error-checked
interaction, exactly matching [[feature_visual_redesign_pass]]'s "Playwright IS drivable from
Bash" finding. Confirm what's actually in your own tool grant before assuming a hook's mention of
a pane/capability applies to you.
