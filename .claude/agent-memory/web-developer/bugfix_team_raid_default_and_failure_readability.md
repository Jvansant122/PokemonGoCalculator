---
name: bugfix-team-raid-default-and-failure-readability
description: Live-audit fix (2026-09-10) — replaced Team Raid/Power-Up Optimizer's failing default roster/boss, added a TeamRaidFailureSummary to runTeamRaid.ts for a readable "n/a"-free failure state, surfaced post-plan clear rate in the fixed-budget plan, and detected a stale (pre-migration) cached roster via key-absence, not a schema bump
metadata:
  type: project
---

Three fixes from a live audit, all in `TeamRaidView.tsx`/`PowerUpOptimizerView.tsx`/
`run/runTeamRaid.ts`/`rosterPool.ts`. Constraint: no `Scenario`/`Assumptions` field add/remove
(only default VALUES could change), and **explicitly "do not edit `packages/engine` or `scripts`"**
— see the real mistake below.

**A real mistake, caught and reverted before finishing: I edited `scripts/run-scenario.ts` to add
CLI parity lines for the two new computed values, directly violating the task's explicit "do not
edit packages/engine or scripts" constraint.** CLAUDE.md's own architecture description (CLI==UI
by construction) made this feel natural/expected, and I'd done exactly this kind of CLI-parity
addition unprompted in prior sessions (see [[feature_team_raid_detailed_assumptions_toggle]]) — but
a task's own explicit constraint always overrides a general architectural habit. Caught it by
re-reading my own file list against the literal constraint text near the end of the session, verified
via `git log --oneline -1 -- scripts/run-scenario.ts` + `git status --porcelain` that the file had
ZERO other pending changes before touching it (so `git checkout -- scripts/run-scenario.ts` was a
safe, complete revert of only my own edit), then re-ran the full verify+e2e gate to confirm nothing
depended on it. **Lesson: when a task lists specific off-limits paths, grep your own edited-file list
against that literal list before calling done — a plausible, in-character addition is not an
exemption.**

## Fix 1(a) — the default roster/boss

Root-caused via `runTeamRaidScenario` scratch scripts (not guessed): the OLD default (Mega Latios/
Garchomp/Dragonite/Kartana/Tyranitar/Rayquaza vs. `tyranitar-mega`) failed at every tested level
(20-50) because it's mostly Dragon/Flying/Psychic attacking into a Rock/Dark boss — Mega Latios's
Psychic charged move is flatly IMMUNE to Dark (0x), Dragonite/Rayquaza's Flying is resisted, plain
Tyranitar's own Rock/Dark moves are resisted by the same-typed boss. Only Kartana had a good
offensive matchup, and it ate a real 2.56x (double-super-effective) hit from the boss's Fire Blast
every time — the one glass cannon carrying the whole offense while itself the most fragile pick.

**A surprising, load-bearing finding: `tyranitar-mega`'s ACTUAL resolved boss HP is 9000 ("Mega
Raids" tier), not 15000 ("5-Star Raids") as an OLDER memory entry ([[feature_team_raid_simulator_tab]])
claimed** — `bossEffectiveStats`/`bossEffectiveHp` in `comparison.ts` fall back to
`defaultRaidTierForSpecies(boss)` (rarity/boost-aware) when a species isn't currently live, NOT the
blind `DEFAULT_REAL_RAID_TIER`, and that engine behavior evidently changed since that older memory
was written. **Verify a stale memory's specific claimed number against the LIVE code before trusting
it, even when the memory is detailed and cites a mechanism** — I only caught this by directly
computing `result.bossHp` via a scratch script, not by re-deriving from the doc comment.

**Even a near-ideal type-countering roster (Fighting/Steel raid counters: `lucario-mega`/`machamp`/
`terrakion`/`excadrill`/`conkeldurr`/`heracross`, explicit Fighting-typed charged moves — Fighting is
individually SUPER_EFFECTIVE against BOTH Rock and Dark, 2.56x combined, the single best answer to
this boss that exists) still falls ~25% short of the ~30 average team DPS a 9000 HP "Mega Raids"
boss needs inside 300s, at this tab's own hard level-40 UI cap (`<input max={40}>` on "Level (whole
roster)"), with `dodgeFastAttacks: false` (the existing default — see the bug below for why it can't
be flipped on). **Conclusion: a Mega/5-Star-tier raid boss is not realistically solo-clearable by
this tool's own tab-level constraints, matching the real game's own "these need multiple trainers"
design** — the fix was retargeting the SAME roster at plain `"tyranitar"` (non-mega, same Rock/Dark
typing, "3-Star Raids" = 3600 HP, ~12 DPS needed) rather than forcing a Mega-tier win through ever
more roster tuning. Verified via `runPowerUpOptimizerScenario` (20 seeds): 100% clear rate, mean
111.5s of 300s, baseline 32.5 team DPS — a strong, unambiguous "not 0%" first impression.

**Deliberately picked level 35 (not the tab's max 40) for Team Raid's shared-level field** — level 40
clears with ZERO wipes (a curbstomp read), level 35 clears at 118.5s/300s with exactly one real wipe
and 6 faint events (a believable win with visible stakes). Verified empirically across levels 20-50
before choosing, not picked by feel.

**Re-confirmed the pre-existing engine `dodgeFastAttacks: true` lockout bug from
[[feature_default_perfect_dodge_and_candidate_override]], this time against `tyranitar-mega`'s Bite
(not the earlier session's Mega Latios Dragon Breath)**: flipping fast-attack dodging on collapsed
total team damage to ~0.14 avg DPS across the whole 300s run (from ~18-20 with it off) — confirms
this is a real, boss-move-duration-driven engine bug (any fast move duration ≤ `DODGE_COST_SECONDS`
triggers it), not species-specific. Did not touch it (packages/engine out of scope) — a second
independent data point worth flagging to `engine-developer` again if this file is read before a fix
lands.

**`optimizePowerUps`'s move-selection blind spot, found while tuning**: leaving `fastMoveId`/
`chargedMoveId` null (this tab's existing "use the species' first-listed move" convention) can pick a
BADLY suboptimal move — Excadrill's first-listed charged move (`ROCK_SLIDE`, neutral, no STAB) scored
~4x worse than its best option (`EARTHQUAKE`, STAB + 1.6x) by a simple `power × STAB × typeEffectiveness
× selfBoost` heuristic against the chosen boss. The shipped default now sets EXPLICIT fast/charged
move ids per slot (verified real, commonly-recommended movesets, not just the heuristic's raw
winner) rather than relying on list order — first-listed is a data-authoring artifact, not a
signal of quality, and a demo default should not silently trip over it.

**`PowerUpOptimizerView.tsx`'s `defaultSlot()` helper needed 2 new optional params
(`fastMoveId`/`chargedMoveId`, defaulting to `null`)** — it previously hardcoded both to `null`
unconditionally; every OTHER call site is unaffected since the params are optional-with-default.

**Test fallout, all fixed rather than worked around (per the task's own explicit instruction)**:
`run.smoke.test.ts`'s "reports a non-null bestBlockedCandidate... when the budget is too tight"
test used to pin the exact bug-report figures (100k stardust/25 candy/10 own candy) against the OLD
default — with the NEW default's much weaker boss, that specific budget no longer reproduces a
blocked state at all (everything significant is already affordable, 76k stardust left over,
`stopReason: "no-significant-candidate"` with `bestBlockedCandidate: null`). Found the new
reproducing figures (20k stardust/5 candy/5 own candy) via a scratch sweep across a stardust×candy
grid rather than guessing, confirmed deterministic (3 repeat runs, identical result — this engine's
seeding has no run-to-run randomness for a fixed input). Updated the test's own inline comment to
stop claiming it "matches the real bug report" (no longer literally true for the new numbers) while
preserving the general intent.

## Fix 1(b) — failure-state readability

Added `TeamRaidFailureSummary` (a new field on `TeamRaidRunResult`, computed in `runTeamRaid.ts`,
NOT in the view — this project's `run<Tab>.ts` convention) populated only when
`data.timeToClearSeconds === null` (a GENUINE "never found a clearing point" failure — a LATE clear
after the timer already has a real, informative `timerMarginSeconds`, e.g. "-10.0s short", so it's
explicitly excluded, not double-covered). Four numbers, all derived from data `TeamRaidResult`
ALREADY returns (`slots[].ownDamageDealt`/`endedAtRaidSeconds`, `bossHp`, `raidTimerSeconds`) —
no engine change needed:
- `fractionOfBossHpDealt`/`totalDamageDealt`/`bossHpRemaining` — "how far did you get."
- `timeLeftOnClockSeconds` = `raidTimerSeconds - min(raidTimerSeconds, lastSlot.endedAtRaidSeconds)`
  — the `min()` clamp matters: `teamRaid.ts`'s own `maxSecondsPerSlot` doc comment establishes a
  fight that survives its own full simulated window (never faints) can report `endedAtRaidSeconds`
  WAY past the real timer (the engine deliberately lets that happen rather than guess where exactly
  the timer would have cut it off) — clamping states a TRUE fact (the real timer must have run out
  during that fight) rather than inventing a number.
- `requiredAverageTeamDps` (`bossHp / raidTimerSeconds`) vs. `achievedAverageTeamDps`
  (`totalDamageDealt / raidTimerSeconds`, same denominator so they're directly comparable) →
  `averageTeamDpsShortfall`, algebraically GUARANTEED positive for a genuine failure (a fight that
  didn't clear can never have `totalDamageDealt >= bossHp` by the engine's own trajectory-scan
  construction) — the `Math.max(0, ...)` guard is defensive only, not load-bearing.

Rendered as: the headline stat-tile swaps from "n/a" to "{X}% of boss HP dealt" for this case
(replacing the vacuous n/a with the single most legible "how bad was it" number), plus 3 new `dl`
row pairs inserted right after "Timer margin" (Boss HP reached / Team DPS shortfall / Time left when
the clock ran out) — "Finishing blow" correctly STAYS "n/a" (there genuinely was no finishing blow),
which is fine once it's not the ONLY content on the card.

## Fix 2 — budget-plan clear rate

Purely a display gap — `PowerUpBudgetPlan.baseline`/`.final` are both `PowerUpEncounterSummary`,
which ALREADY carries `clearRate`/`meanTimeToClearSeconds` (the baseline result-card above already
renders these for the SAME summary type). Added "Baseline clear rate" / "Clear rate after this
plan" `dl` rows next to the existing "Final team DPS" — `plan.final.clearRate === 0` renders
"0% — still doesn't clear" inline (a short, plain, unmissable label, not a separate callout box).
Reproduced the exact bug report via a scratch `runPowerUpOptimizerScenario` call with the OLD
default's literal figures (100k stardust) BEFORE fixing anything: baseline 7.14 DPS / 0% clear,
final 7.83 DPS (task's own cited "+9.7%" — exact match) / STILL 0% clear — confirms this was a real,
reproducible gap, not a hypothetical one.

## Fix 3 — stale cached roster detects itself by KEY ABSENCE, not a schema bump

The gap: `RosterImportPanel.tsx`'s own Import table badge uses the OLDER `movesetIsDefaulted`/
`unmatchedMoveNames` fields (which predate this whole feature cluster and were always correctly
populated) — it was NEVER broken. The NEW gap is entirely in the result-row join
(`rosterMovesetBadge.ts`'s `movesetDefaultBadge`, built on 4 fields added same-day:
`fastMoveIsDefaulted`/`chargedMoveIsDefaulted`/`fastMoveUnmatchedName`/`chargedMoveUnmatchedName`),
which silently reads "fully resolved" for a pre-migration cached entry via `hydrateRosterEntry`'s
own (correct, unchanged) `?? false`/`?? null` fallback.

**Detection: `entryPredatesMovesetBadgeFields(stored)` checks `stored.fastMoveIsDefaulted ===
undefined` on the RAW `StoredRosterEntry` — before `hydrateRosterEntry`'s `?? false` fallback
collapses "never had this key" and "has it, genuinely false" into the same value.** `JSON.parse`
doesn't respect TS's static requiredness any more than a `Scenario` field does on an old share
link — an old entry's raw object literally lacks the key (`undefined`), while
`dehydrateRosterEntry`/`buildRosterEntry` (the fresh-import path) ALWAYS write real `false`/`null`
literals for these 4 fields, and `JSON.stringify` KEEPS `false`/`null` (unlike `undefined`, which it
drops) — so the undefined-check is a clean, reliable signal with zero false positives, verified by
both a targeted `delete`-based unit test (simulating real pre-migration JSON) and a live-browser
`localStorage.setItem` injection. **Did NOT bump `ROSTER_POOL_SCHEMA_VERSION`** — per the existing,
correct precedent in [[bugfix_multiraid_moveset_defaulted_badge]], that would silently WIPE every
cached roster on load (`normalizeParsedPool` treats a version mismatch as "start empty"), a strictly
worse outcome than a stale entry just not showing a badge yet.

`hydrateRosterPool`'s return type grew one field (`staleMovesetBadgeCount`, computed in the SAME
loop as the existing `droppedCount`, zero extra passes) — a plain destructuring call site
(`RosterImportPanel.tsx`'s own separate `hydrateRosterPool` call) that only reads `{entries,
droppedCount}` needed NO changes; TS doesn't complain about unread extra properties.

Notice placed in `PowerUpOptimizerView.tsx`'s `MultiRaidResultsSection` header, literally the next
`{count > 0 && <span className="caveats">...}` block after the EXISTING `rosterDroppedCount` one —
same component, same unconditional-render position (this section is `defaultOpen` and NOT gated
behind having run a sweep, so the notice is visible on mode-switch alone, before any click).
Confirmed `MultiRaidBudgetPlanSection` (the OTHER multi-raid results component) never received
`rosterDroppedCount` either — establishes this class of roster-health notice lives in ONE place by
existing precedent, so I didn't duplicate mine into the budget-plan section.

## Live browser verification (real, not just CLI)

A `vite preview` instance on an isolated throwaway port (4321 — NOT 4173, Playwright's own e2e
config's port, and NOT 5173, which `netstat` showed another process already listening on —
confirms [[feedback_concurrent_sessions_shared_worktree]]'s port-collision risk is real, check
`netstat` before picking one) driven by a throwaway Playwright `.mjs` script (`import { chromium }
from "playwright"`, placed in `packages/web/` per the established resolution-root gotcha), covering
all 4 fix points with real assertions against rendered text, not just visual screenshots:
new-default clears (118.5s, 1 wipe — byte-identical to the CLI-computed number), the OLD roster's
share-link reproduces the exact same "26% (2364/9000 HP)" / "~22.1 short" numbers a scratch script
computed independently, the OLD Power-Up default's share-link reproduces the bug report's exact
"7.83 (+9.7%)" AND now shows "0% — still doesn't clear", a hand-injected stale localStorage pool
trips the new notice, and a real CSV import (the repo's own `pokeGenieSample.csv`, 23 rows) does
NOT. Zero console errors across every navigation.

**Hit the SAME "click toggles an already-open `<details>` closed again" gotcha from
[[feature_caveat_prose_relocation]] a second time, in a NEW context (localStorage-backed fold state
surviving across `page.reload()`, not just `context.newPage()`)** — my own script's second
`.click()` on "Assumptions" (test 4b, after test 4a had already opened it earlier in the SAME page's
lifetime) closed it again and hung the next `.click()` on an invisible button. Fixed with the same
idempotent `details.open = true` (via `.evaluate()`) helper that memory already prescribes — worth
promoting this from "a thing that happened once" to "always write the idempotent helper up front"
for any future script that expands the SAME collapsible section more than once in one run.

Also reconfirmed via direct measurement: on Windows, `netstat -ano | grep LISTENING` + `taskkill
//F //PID <n>` (double-slash for Git Bash) is the reliable way to find/stop a background preview
server started via `(cmd &)` — `curl -o /dev/null -w "%{http_code}"` against the target port is a
cheap up/down check before and after.
