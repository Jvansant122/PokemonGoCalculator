---
name: proposal-crossover-rate-across-runs
description: Proposed web/engine feature — report what fraction of the 200 randomized runs actually produce a ranking flip (and when), instead of showing only one seeded representative run's crossing point; status as of 2026-09-05 is proposed, not yet routed/built
metadata:
  type: project
---

Proposed 2026-09-05 (third ideation pass, first UI-focused pass, by this agent). Not yet built,
rejected, or routed — status: **proposed, pending overseer decision**.

**What it would show:** `DamageOverTimeChart.tsx`'s crossing marker ("crossover: ~Xs") is computed
from exactly one reproducible seeded run (`representativeRun`, seed 1) out of the 200 randomized
runs the stat cards above it are drawn from — the app's own caveat text already says this plainly
("an individual run's exact crossing point varies; the stat cards above are the actual distribution
to trust for conclusions"), but that caveat is never backed by an actual number. Since the boss's
charged-move timing is randomized per run (+/-40% around the mean cadence), the *existence* and
*timing* of a flip should itself vary run to run — some fraction of the 200 runs might show no flip
at all (one candidate always leads), and among the runs that do flip, the flip time itself has a
distribution. Proposed: compute and display, alongside (not instead of) the single-run chart,
something like "flipped in 134/200 runs (67%); when it did, at a median of 41s (p10-p90: 28-58s)."

**Why it sharpens the thesis:** this is the single most direct instance of "the ranking flip is the
headline, not a winner" the product could show and currently doesn't — right now the flip is
displayed as if it were a fixed fact (one marked point on one line), while the text right below it
admits it's actually a random variable. Converting that caveat into an actual reported statistic
closes the gap between what the UI visually asserts (a precise crossing time) and what the
underlying model actually produced (a distribution of possible crossing times, including "no
crossing this run"). It also gives a second, independent read on how fragile the "flip point"
finding is — distinct from the existing sensitivity panel, which asks "what if one assumption were
different" rather than "how consistent is the flip across the model's own randomness at the
current assumptions."

**Standing-decision check:** no new user-facing `Scenario` setting — this reads more out of the
existing randomized-run population, it doesn't add an input. It does require new engine-side
support: `runSustainedComparison`'s per-run trajectories/fainted-at times aren't currently exposed
beyond `representativeRun` (one arbitrary run) and the aggregate `DistributionSummary` fields
(mean/median/p10/p90 of survival and damage, not of *crossing time*, which requires comparing both
candidates' trajectories run-by-run, not each in isolation) — so this is genuinely cross-cutting,
not purely a web-layer change, and would need `engine-developer` to add a per-run crossing-time (or
"did not cross") computation to the comparison output before `web-developer` could build the
display. Flagging that explicitly rather than quietly treating it as UI-only. Doesn't touch the 1.3
mega-boost constant, doesn't reintroduce a user-selectable combat phase, not the ruled-out
Teambuilding Analyzer.
