---
name: proposal-boss-cadence-sensitivity
description: Proposed web feature — sensitivity check sweeping bossChargedMoveFrequencySeconds (boss attack cadence/raid difficulty), currently absent from computeSensitivity despite being a live Scenario field; status as of 2026-09-05 is proposed, not yet routed/built
metadata:
  type: project
---

Proposed 2026-09-05 (second ideation pass by this agent). Not yet built, rejected, or routed —
status: **proposed, pending overseer decision**.

**What it would show:** `Scenario.bossChargedMoveFrequencySeconds` (mean seconds between the
boss's charged moves once it starts using them) is a live, user-set assumption already threaded
into `runSustainedComparison`, but `computeSensitivity` never sweeps it. This value directly
governs the time-pressure both candidates are under: a slow-cadence boss gives a durable-but-
lower-own-DPS candidate more time to accrue team-boost uptime before either would realistically
faint anyway (favoring survivability), while a fast, punishing cadence compresses both
candidates' survival windows and shifts the outcome toward raw own-DPS. Proposed: add a
sensitivity check that scans this value up/down from its current setting (same
scan-and-report-distance pattern as the existing checks) and reports "flips if the boss's
charged-move cadence changes to ~Xs" — effectively "which raid's pressure level does the
survivability edge actually survive contact with."

**Why it sharpens the thesis:** this turns "raid difficulty" into a concrete instance of the
product's central tradeoff — the ranking flip isn't just a function of the two candidates and the
team around them, it's also a function of how hard the boss hits and how often, and that's
currently completely unexamined despite being one input away. It reframes "which mega should I
bring" as "...to this specific boss's pressure," which is exactly the kind of scenario-conditional
answer (not a single winner) the product is designed to produce.

**Standing-decision check:** no new `Scenario` field — `bossChargedMoveFrequencySeconds` already
exists and already round-trips. Doesn't touch the no-user-selectable-combat-phase decision (the
mean interval remains a single user-set assumption; whether the boss has actually thrown one yet
stays a computed fact via `bossChargedMoveReadySeconds`, unchanged). Doesn't touch the 1.3
mega-boost constant. Not the ruled-out Teambuilding Analyzer.
