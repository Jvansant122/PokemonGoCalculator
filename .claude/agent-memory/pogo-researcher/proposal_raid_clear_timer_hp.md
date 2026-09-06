---
name: proposal-raid-clear-timer-hp
description: Proposal to add a real raid countdown timer + boss HP pool as a pass/fail "does the team actually clear the boss in time" readout, layered on existing damage trajectories
metadata:
  type: project
---

Proposed 2026-09-05, in-depth pass (single deep proposal, not a list). Status: proposed, not yet
routed/built as of 2026-09-05.

## The gap

Confirmed by reading the engine directly (not just inferred): `packages/engine/src/simulate.ts`'s
stepwise loop tracks the **attacker's** HP hitting zero (faint) but never tracks the **boss's** HP
as a depleting resource. Grepped the whole engine for any boss-HP-as-depletable-resource consumer
(`boss.baseStamina`, `bossHp`, `remainingHP`, etc.) — zero hits outside `stats.ts`'s type-only
`Pick<...>`. `StepwiseBoss` in `simulate.ts` has no `hp` field at all. `breakpoints.ts`'s
`timeToFaint`/`timeToFaintTable` compute the *attacker's* survivability only — there is no
symmetric "how long until the boss itself goes down" anywhere in the codebase.

Meanwhile every boss fixture already carries a real-looking `baseStamina` value
(`PRIMAL_KYOGRE.baseStamina = 15000`, `MEGA_SKARMORY.baseStamina = 12000` —
`packages/engine/src/fixtures/scenarioA.ts`) that is **currently 100% decorative**: set, but never
read as an HP pool anywhere downstream. So the data to ground this already exists in the fixtures;
it's just inert.

## The real mechanic this is grounded in

Raid battles in Pokémon GO run under a **hard countdown timer**; if cumulative team damage hasn't
brought the boss to 0 HP when the timer expires, the raid is lost outright regardless of how much
damage was dealt or how many trainers are still alive — no partial credit, no catch chance, raid
pass consumed either way. [community-consensus, cross-checked 2026-09-05 across Bulbapedia's
"Raid Battle (GO)" article, Pokémon GO Hub, and the Fandom wiki — all three agree; no single
official Niantic blog post was found stating these exact numbers, likely because this mechanic
predates Niantic's current patch-note practice]:
- Tier 1 / Tier 3 raids: 180-second battle timer.
- Mega Raids and Tier 5 (Legendary) raids: 300-second battle timer.
- Primal raids: bucketed with Mega/Legendary at 300s by community sources, but I did not find an
  explicit, separately-stated Primal-specific number distinct from that bucket — flag as
  [community-consensus, lower confidence specifically for Primal] rather than presenting it as
  independently confirmed.
- Boss HP pools by tier (Bulbapedia): T1 600, T3 3,600, Mega 9,000, T5/Legendary 15,000,
  Primal 22,500.
- If the timer hits 0 before the boss's HP does, "the Raid Battle is lost" — confirmed
  independently by a second search (Pokémon GO Hub / Fandom): defeating the boss within the time
  limit is a precondition for the catch encounter, not a formality.

This is a load-bearing, structural fact about the game that the tool currently has **no
representation of at all** — not a missing nice-to-have, a missing win condition.

## Why it sharpens the thesis, not just decorates it

The tool's headline is "survivability counted as team DPS, not raw damage — the ranking flip
point is the point." Today, "who wins" is defined purely as *which candidate's team deals more
total damage over an arbitrary simulated window* (`meanTotalDamage` + `convertUptimeToTeamDamage`,
compared as a single endpoint number). That is a proxy for what a player actually cares about,
which is binary and real: **does this team actually get the boss to 0 before the clock runs out**.
Those two questions usually agree, but they can genuinely diverge in a way current features can't
show:

- Candidate A might have a higher total-team-damage endpoint (today's sole metric, "wins") purely
  because it (or its `persistsThroughFaint` boost) keeps contributing team damage very late in an
  extended window — but if most of that damage lands *after* the real 180s/300s buzzer would have
  already ended the raid, A never actually clears the boss in a real raid.
- Candidate B might have a lower total-team-damage endpoint yet a more front-loaded trajectory
  (dies later relative to when it does its damage, or simply hits harder early) that crosses the
  boss's actual HP well inside the timer.

That is a genuinely new, independent axis of "flip" — not a re-skin of DPS/TDO — and it directly
answers the question a player brings to this tool ("which one do I actually bring to this specific
raid") in a way nothing here currently can, since nothing here currently has any notion of "the
raid is over."

## What it would add

**New engine output** (pure post-processing over data the simulator already produces — no change
to the stepwise tick loop itself):
1. A **cumulative team-damage-over-time** function, generalizing `uptime.ts`'s
   `convertUptimeToTeamDamage` (today a single scalar for "total team damage contributed over the
   whole fight") into a running total over elapsed seconds: candidate's own
   `ownDamageTrajectory` (already computed, already charted) plus a linear
   `teammateDps × elapsed-seconds-alive` ramp (continuing past the candidate's own faint only when
   `persistsThroughFaint` is set, exactly mirroring the existing scalar version's own logic — this
   is a straightforward generalization of existing math, not a new formula).
2. `timeToClearSeconds`: the first tick at which that running total reaches `boss.baseStamina`, or
   `null` if it never does within the simulated window.
3. `clearsWithinTimer: boolean` and `timerMarginSeconds` (`raidTimerSeconds - timeToClearSeconds`,
   negative when the boss would go down only after the real raid had already failed) — a literal,
   signed margin, not just a pass/fail flag, so "barely cleared" and "barely didn't" are
   distinguishable at a glance.

**New Scenario field**: `raidTimerSeconds: number` — the fixed real-world countdown for whichever
raid tier the boss belongs to (180 or 300, per the numbers above). This is new information not
derivable from any existing field (boss `baseStamina` states HP, not the timer) and every
user-facing assumption must round-trip through `Scenario` per the standing decision — flagging
this explicitly rather than leaving it implicit, since it's a new input, not a display-only
derived value. Needs a default that preserves old shared-link behavior: proposed default mirrors
`DEFAULT_STEPWISE_MAX_SECONDS` (180) so a scenario URL encoded before this field existed still
decodes to the same simulated window/behavior it always gave (per the existing pattern used for
`weather`/`holdChargedMoveUntilSafe` when they were added).

**New UI surface** (not proposing exact pixels, just the shape): a headline readout per candidate
next to the existing DPS/TDO labels — "Clears in 142s (38s to spare)" vs "Does not clear boss
within 180s timer (would need ~41 more seconds)" — plus two reference lines overlaid on the
already-existing `DamageOverTimeChart`: a horizontal line at `boss.baseStamina` (the HP threshold)
and a vertical line at `raidTimerSeconds` (the buzzer), so the crossing point (or lack of one) is
visible directly on the chart both candidates already share.

**New sensitivity check**: "Raid timer margin" — for whichever candidate is closer to the 0-margin
edge, scan `raidTimerSeconds` (or, as an alternate framing, scan `teammateDps` or party size, since
those already have their own checks and margin is a function of the same trajectory) outward to
find the nearest point the `clearsWithinTimer` boolean flips, reusing the exact same
distance-to-flip / `FlipBar` presentation already built for the other checks in
`packages/web/src/sensitivity.ts`. Deliberately proposed as an *additional* check, not a
redefinition of the panel's existing "winner" (which stays "higher total team damage," unchanged)
— see the explicit note below on why collapsing the two into one definition is a bigger, separate
call.

## Interaction with the stepwise simulator

None of `simulate.ts`'s actual tick loop changes — `timeToClearSeconds` etc. are computed by
scanning the trajectories `simulateStepwiseBattle`/`runStepwiseDistribution` already return
(`ownDamageTrajectory` per candidate, plus the same linear teammate-ramp math `uptime.ts` already
has). This is deliberately a read-only consumer of existing simulation output, the same shape as
how `uptime.ts` and the chart already consume it — not a second combat model.

## Edge cases / things worth flagging explicitly

- **Not a combat-phase toggle.** `raidTimerSeconds` doesn't change how or whether the boss throws
  a charged move, doesn't gate any in-fight behavior, and isn't a mode a user picks between "raid"
  and "not raid" — it's a fixed real-world fact about the chosen boss's tier, consumed entirely in
  post-processing after the same one continuous simulation already runs. Flagging this
  proactively since "add a raid clock" could sound adjacent to the removed phase toggle; it isn't
  the same shape (it never feeds back into the simulation itself, only interprets its output).
- **Reuses, doesn't touch, the 1.3 mega boost.** `timeToClearSeconds` reads
  `boostMultiplier`/`persistsThroughFaint` off the same `convertUptimeToTeamDamage`-shaped inputs
  already in place; this proposal never varies or treats that multiplier as a tuning knob.
- **Fixture stats aren't changed, but a previously-inert field becomes load-bearing.** This is the
  one worth naming plainly against "the hypothetical fixtures back pinned acceptance tests, don't
  casually change their stats": I'm not proposing changing `PRIMAL_KYOGRE.baseStamina` or
  `MEGA_SKARMORY.baseStamina`'s *values*, but making a field that's currently decorative suddenly
  matter for a real computed output is exactly the kind of change `engine-developer` should sanity
  check against the acceptance tests before landing, in case either pinned fixture's `baseStamina`
  was chosen for HP-flavor plausibility rather than because any test actually exercises it as a
  finish line. Worth an explicit look, not an assumption that it's free to activate.
- **No Teambuilding Analyzer creep.** This stays strictly two-candidates-vs-one-boss with the
  existing flat `teammateDps` abstraction (teammates' own survivability isn't modeled, only their
  aggregate DPS contribution) — no per-trainer mega staggering, no multi-trainer scheduling. Not
  proposing to model *when* individual teammates arrive, mega, or die; only whether the abstracted
  team total crosses the boss's real HP before the real clock runs out.
- **"Winner" stays damage-based unless the overseer wants otherwise.** I deliberately proposed the
  timer-clear check as an *addition* alongside the existing damage-based winner definition, not a
  replacement. Redefining "winner" panel-wide as "the candidate whose team actually clears the
  boss in time" (rather than "does more total team damage") is a legitimate, more thesis-pure
  product question — arguably a team that "wins" on raw damage but the raid factually fails isn't
  a real win — but it would touch how every one of the 13 existing sensitivity checks defines a
  flip, which is a bigger call than one new feature; naming it here rather than quietly deciding it
  myself.
- **Primal-specific timer number is the weakest-sourced part of this proposal** — flagged above,
  should be re-verified (ideally via leekduck.com or an official raid-mechanics summary) before
  `data-sync`/`engine-developer` hardcodes 300s specifically for Primal rather than just for
  Mega/Legendary.

## Sources
- Bulbapedia, "Raid Battle (GO)" — https://bulbapedia.bulbagarden.net/wiki/Raid_Battle_(GO)
  (fetched 2026-09-05): tier timers (180s T1/T3, 300s Mega/Legendary) and boss HP pools
  (600/3600/9000/15000/22500).
- Pokémon GO Hub, "How long is the raid timer?" — https://pokemongohub.net/post/questions-and-answers/long-raid-timer/
  (search result surfaced 2026-09-05): corroborates the 180s/300s split.
- Pokémon GO Wiki (Fandom), "Raid Battle" — https://pokemongo.fandom.com/wiki/Raid_Battle
  (search result surfaced 2026-09-05): corroborates timer-expiry-loses-the-raid and catch
  eligibility being contingent on clearing in time.
- No official Niantic blog/patch-note source was found stating these exact numbers directly; all
  three sources above are community wikis/hubs, so every number here is [community-consensus], not
  [confirmed] — flagged accordingly in the proposal body.
