---
name: feature-power-up-optimizer-fixed-budget-plan
description: Wiring the engine's planPowerUpBudget (whole-roster, whole-budget power-up planner) into the Power-Up Optimizer tab alongside the existing single-candidate ranked table — two shared-pool scenario fields, a new results section, and a real-browser Playwright proof of one exact share URL
metadata:
  type: project
---

Built 2026-09-08, same day as [[feature_power_up_optimizer_tab]] and [[feature_power_up_optimizer_noise_floor]].
The engine half (`packages/engine/src/powerUp.ts`'s `planPowerUpBudget`, `PowerUpBudgetInputs`/
`PowerUpBudgetPlan`/`PowerUpBudgetStep`/`PowerUpBudgetLedger`) was already merged before this
session — pure wiring, zero `packages/engine` edits (confirmed via `git status --porcelain
packages/engine` staying untouched by me throughout, even though it showed pre-existing uncommitted
changes from whoever landed the planner — not mine to touch or worry about).

**`PowerUpOptimizerInputs` (the type the EXISTING `optimizePowerUps` call already builds) already
carries the two new shared-pool fields (`rareCandyOnHand?`/`rareCandyXlOnHand?`) as optional —
the engine put them on the shared interface specifically so `planPowerUpBudget`'s extra
`PowerUpBudgetInputs` (which just adds `maxRounds?`/`candidateLevelsPerSlotPerRound?`/
`maxCandidatesPerRound?`, all optional with sane defaults) reuses the SAME object built for
`optimizePowerUps`, unchanged.** Retyped the run module's local `optimizerInputs` variable from
`PowerUpOptimizerInputs` to `PowerUpBudgetInputs` and called both `optimizePowerUps(optimizerInputs)`
and `planPowerUpBudget(optimizerInputs)` on the literal same object — no second inputs-building
block, no duplication. This is the load-bearing reason the whole task stayed cheap: the "one new
computation, wired through the same run function" instruction was actually just "one more function
call using data already assembled," not new plumbing.

**Measured combined wall clock (both `optimizePowerUps` + `planPowerUpBudget`, 20 seeds, full
default 6-slot roster) at ~800ms via a throwaway `tsx` scratch script** (deleted after,
`git status --porcelain` reconfirmed clean) using the user's EXACT target scenario (100k stardust,
10 candy/species, 25 shared Rare Candy) rather than an arbitrary one — comfortably under the task's
own ~6s gating threshold, so **no `showBudgetPlan` toggle was added**, per the task's stated
preference. The planner itself only cost ~60-160ms on top of the optimizer's ~750ms in every run —
its dominated-level reduction (`usefulPowerUpLevelsAbove`) does real work keeping per-round
candidate counts small. Confirmed again independently via the shipped `run.smoke.test.ts` case
(~800-835ms each run) and via the real CLI (`run-scenario`) call against the actual share URL.

**Both new fields are ACCOUNT-WIDE shared pools, so they belong next to `stardustOnHand` in the
assumption panel, not inside the per-slot roster editor** — same "shared vs. per-slot" placement
rule `stardustOnHand` itself already established (real Pokémon GO stardust is one pool; candy is
per-species). Defaults picked as modest non-zero two-digit numbers (`rareCandyOnHand: 20`,
`rareCandyXlOnHand: 10`) specifically so the new section isn't inert-looking (all zeros) on a
fresh page load — a `0` default would make the whole shared-pool feature invisible until a user
found and touched the new fields themselves.

**The new "Fixed-budget power-up plan" section was placed between "Recommendation" and "Ranked
power-up candidates," not appended at the very end** — it answers a related-but-different question
from the ranked table right above it ("what SET of upgrades fits my WHOLE budget" vs. "what's the
single best next step"), so reading order groups it with the other single-roster-verdict sections
rather than burying it after the large candidate table. Reused every existing style class
(`.panel`/`.result-card`/`.caveats`/`.time-series-table`/`.result-row`) — zero new CSS added,
confirmed unnecessary before starting rather than assumed.

**"Own X yours + Y Rare" formatting reused for BOTH candy and XL candy via one
`formatResourceSplit(ownSpent, sharedSpent, sharedLabel)` helper**, called once per resource per
step (`formatResourceSplit(step.ownCandySpent, step.sharedCandySpent, "Rare")` and the XL
equivalent with `"Rare XL"`) — avoids writing the same own/shared branching logic twice. Returns
"—" only when a step spent literally nothing of that resource (a level crossing that's pure
stardust, or pure XL with zero regular candy), matching the existing ranked table's "—" convention
for "nothing to report" rather than a zero.

**`budgetStopReasonSentence` deliberately echoes the ranked table's EXISTING noise-floor phrasing**
("nothing else measurably beats the noise floor") for the `no-significant-candidate` case, per the
task's own instruction to stay consistent with wording already on the page — the other three
`PowerUpBudgetStopReason` values (`max-level-reached`/`budget-exhausted`/`round-cap-reached`) got
their own plain-language sentences since the ranked table has no equivalent case for them.

**Baseline-vs-final team DPS with a percentage-change sentence stood in for the "add a comparison,
not just a number" rule** — this tab has no second CANDIDATE the way Comparator's two-candidate
cards do, so there's nothing to build a ratio-between-candidates sentence against; the single
legitimate two-number comparison available here is the plan's own before/after, which already got
one (`+X.XX team DPS (+Y.Y% over baseline)`).

**Verification this session went one level past every prior tab-build session's ladder**
(see [[verification_without_browser_tool]]): in addition to `npm run test:web` (69 tests, one new
plan-shape smoke test — asserts every committed step's `deltaTeamDps` exceeds `noiseFloorTeamDps`,
own+shared spend sums back to the step's own reported `cost`, and nothing oversp
ends what was on hand), `npm run check-scenario-roundtrip` (19 fields for this tab, up from 17),
`npm run typecheck` (all three tsconfigs, including `tsconfig.scripts.json` for the
`run-scenario.ts` edit), and a full `npm run verify` (exit 0, only the pre-existing 6 lint
warnings, none new) — **this task's Playwright browser tool (`npx playwright test`) WAS actually
usable** (chromium 1243 already installed under `ms-playwright`, confirmed via `ls` before assuming
otherwise) — this is a materially higher verification level than every prior session in this
project's memory, which uniformly reported "no browser tool available." Ran the real
`npm run test:e2e` suite (10/10 passed, including a new committed
`power-up-optimizer: fixed-budget plan section renders a spend ledger` test), AND separately built
and ran (then deleted, `git status --porcelain` reconfirmed clean) a throwaway
`e2e/_scratch_share_link_check.spec.ts` that loaded the EXACT share URL for the user's literal
requested scenario (100k stardust / 10 candy per species / 25 Rare Candy) in a real headless
Chromium instance and asserted the rendered plan section's numbers — this caught nothing (the
numbers matched the CLI exactly: baseline 6.98 -> final 7.73 team DPS, one step at Kartana
Lv38->38.5 costing 9,000 stardust + "10 yours + 2 Rare" candy, 23 of 25 shared Rare Candy left) but
is a strictly stronger check than the CLI-only cross-check every prior tab session settled for.
**If a browser tool shows as available in a future session's tool grant, use it for a real share
URL, not just the default-scenario Playwright suite** — this session's e2e suite alone would not
have caught a bug specific to the user's exact numbers (e.g. an off-by-one in how `rareCandyOnHand`
threads through `assumptionsToScenario`), while the scratch single-URL check would have.
