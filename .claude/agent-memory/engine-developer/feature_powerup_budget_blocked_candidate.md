---
name: feature-powerup-budget-blocked-candidate
description: planPowerUpBudget's bestBlockedCandidate field (2026-09-08) — "you're done" vs. "you're blocked" disambiguation, the bounded post-search pass that finds it, and how it was verified against the real Mega Tyranitar case
metadata:
  type: project
---

**The problem this closes:** `planPowerUpBudget` stopping with `stopReason: "no-significant-candidate"`
(or `"budget-exhausted"`) is technically true but was silently ambiguous between two very different
situations: (1) the roster is genuinely optimal, stop spending, and (2) a real, bigger gain exists
but isn't affordable YET (e.g. it needs more Candy than is on hand). Reporting (1) when the truth is
(2) actively misleads a user into NOT saving the exact resource that's gating them. Found via the
real default 6-slot Power-Up Optimizer roster vs. Mega Tyranitar (100k dust / 10 candy per slot / 25
Rare Candy): committed 2 steps then stopped "no-significant-candidate" with 75k dust and 19 Rare
Candy left — but re-running with candy unconstrained found Tyranitar Lv31->Lv36ish is a REAL
`deltaTeamDps ~0.25` gain (>2x the noise floor) that needs 76+ candy the user doesn't have.

**Fix: `PowerUpBudgetPlan.bestBlockedCandidate: PowerUpBudgetBlockedCandidate | null`.** Computed
ONCE, in a dedicated pass AFTER the round loop already decided to stop (never per-round — costs at
most one extra round's worth of simulation, not a per-round tax). For each fielded slot: take
`usefulPowerUpLevelsAbove` at the slot's FINAL level, find the first index where affordability
against the FINAL remaining budget fails (cost is monotone non-decreasing in level — see
`powerUpCost` — so everything past that index is unaffordable too, no need to keep checking), take
up to `blockedCandidateLevelsPerSlot` (default 8) of that unaffordable tail per slot, round-robin
interleave across slots up to `maxBlockedCandidatesToCheck` (default 60, reuses the same
`interleaveCandidatesRoundRobin` helper the main round loop's affordable-candidate interleaving
uses — extracted as a shared generic function during this change), simulate each as a full team raid
(same paired seed set), and keep the highest-`deltaTeamDps` one that still exceeds
`noiseFloorTeamDps`. `null` means genuinely nothing significant is blocked either — the real
"you're done" signal, DISTINCT from "we didn't look" only in that this pass always runs regardless
of stop reason (trivially returns `[]`/`null` when there's really nothing left, e.g.
`max-level-reached`).

**Deliberately NOT exhaustive, documented as such in both the field's doc comment and the function's
top doc comment:** a real blocked gain sitting further out than `blockedCandidateLevelsPerSlot` on a
single slot could still be missed and reported as `null` — "didn't find one within this bound," not
a proof none exists. This is the same "bounded, not exhaustive, cheap enough for one extra pass"
tradeoff this module already made for `maxCandidatesPerRound` in [[feature_fixed_budget_powerup_planner]] /
[[fix_powerup_budget_candidate_window]] — same house style, don't relitigate it.

**Shortfalls are per-resource, never blended (CLAUDE.md standing decision):**
`PowerUpBudgetBlockedCandidate.shortfalls: PowerUpBudgetResourceShortfall[]` (`resource: "stardust" |
"candy" | "xlCandy"`, `shortfall: number` = how much MORE is needed). A candidate can be short on
MULTIPLE resources at once — verified live against the real default roster (see below), where the
found blocked candidate (Tyranitar Lv31->Lv37 at that point, `+0.26` team DPS) was short on BOTH
stardust (9000) AND candy (67) simultaneously, both reported as separate entries, never collapsed
into one number. The accounting (`shortfallsForCandidate`) reuses the exact same own-resource-first
logic (`RARE_CANDY_TO_CANDY_RATIO`/`RARE_CANDY_XL_TO_XL_CANDY_RATIO`) `affordable`/
`sharedCandyNeeded` already use elsewhere in this module — no new accounting rule invented.

**Did NOT split `PowerUpBudgetStopReason`** (the task explicitly left this as my call, with an
explicit instruction to flag it if I did split it — I did not, so no flag needed, but recording the
reasoning for a future reviewer). A nullable `bestBlockedCandidate` field disambiguates cleanly
without forcing `packages/web` to add a new stop-reason sentence branch (per CLAUDE.md: a stop-reason
union change requires telling the calling agent explicitly since the UI renders one sentence per
variant) — `stopReason === "no-significant-candidate" && bestBlockedCandidate != null` is enough for
the UI to render "blocked" phrasing without a schema change. Flag this choice if a future task wants
the stop reason itself split instead; nothing prevents it, this was just the smaller-diff option.

**Verification discipline:** built a scratch `tsx` script (deleted after use, NOT the user's own
persistent `scripts/_probe.tmp.ts` — that one was left untouched, per explicit instruction) driving
the real production `runPowerUpOptimizerScenario` against the real default roster + real Mega
Tyranitar data, confirming the field fires exactly on the reported case (found Tyranitar Lv31->Lv37,
`+0.261` team DPS, short 9000 stardust AND 67 candy simultaneously) before trusting the unit tests
alone.

**Perf:** measured via a NEW scratch `tsx` probe against the real combined
`runPowerUpOptimizerScenario` (default roster, real Mega Tyranitar, candy artificially constrained to
reproduce the bug): wall clock went from the previously-measured ~890ms baseline to ~1000-1130ms —
a roughly 100-200ms addition, well inside the ~5s web-tab debounce budget. Added a DEDICATED new perf
regression case (`perf.test.ts`/`perf.bench.ts`, "the post-search 'best blocked candidate' pass stays
cheap...") specifically because the EXISTING `planPowerUpBudget` perf case uses an unlimited budget
by design (worst case for round COUNT) and so never actually exercises this new pass at all — needed
a new candy-STARVED scenario (level 20 roster, `candyOnHand: 15` per slot, generous shared pools) to
force real work through it. Measured **inside vitest itself** (not a bare `tsx` script — the two
differ by roughly 2x on this exact suite, a recurring gotcha already noted in
[[fix_powerup_budget_candidate_window]] and [[feature_perf_benchmark_suite]]): ~4.1-4.2s per run,
budgeted at 42s (~10x).

**Test fixtures:** extended the EXISTING "regression: a multi-level jump..." describe block in
`powerUp.test.ts` (same REGRESSION_SLOT/REGRESSION_BOSS fixture already used for the
`candidateLevelsPerSlotPerRound` bug) rather than inventing a new one — same shape (sub-floor nearby
levels, a real significant jump further out), just gated by Candy instead of an offered-window cap.
Asserted the BEHAVIOR (a blocked significant candidate is found, names `candy`, shortfall equals
`cost.candy - candyOnHand`) rather than the exact level, per this project's stated test discipline —
a data refresh must not break this. Also added an assertion to the PRE-EXISTING "eventually stops
with no-significant-candidate... well short of the budget" test that `bestBlockedCandidate` is
`null` there — that fixture already had ample remaining resources, making it the natural
"genuinely optimal" regression case with zero new fixture work.

**Environment note (unrelated to this change, flagging for continuity):** at the start of this
session `git status` was already showing dozens of modified files across `packages/web`
(candidateDodge/dodgeFastAttacks per-candidate dodge override, a `WeatherSelect` component
extraction, etc.) that I never touched — `npm run typecheck`/`npm run typecheck:scripts` fail on
these PRE-EXISTING, unrelated, in-progress web changes (missing `candidateDodge`/
`candidateDodgeFastAttacks` on `ComparatorScenario`, an undefined `WEATHER_OPTIONS` reference). This
looks like a concurrent web-developer session's in-flight work sharing the same working tree, not
anything caused by this task. `packages/engine`'s own `tsc --noEmit -p packages/engine/tsconfig.json`
and `npm run test:engine` both pass cleanly in isolation; `npm run lint` also passes (0 errors) across
the whole repo. Don't assume a whole-repo `npm run typecheck` failure means an engine change broke
something without first checking which package the errors are actually in.
