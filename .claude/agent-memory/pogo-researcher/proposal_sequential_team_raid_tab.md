---
name: proposal-sequential-team-raid-tab
description: Design-only proposal for a new "Team Raid Simulator" tab modeling a single trainer's own 6-Pokémon sequential lineup against a boss's real HP pool and raid timer; Section 9 (2026-09-05) corrects the original full-team-wipe-as-loss framing to a revive-and-continue mechanic
metadata:
  type: project
---

Proposed 2026-09-05, design-only pass (explicitly requested — no implementation). Follow-up to,
and generalizes, [[proposal-raid-clear-timer-hp]] (read that first; this reuses its boss-HP/timer
grounding rather than re-deriving it). Status: design proposed, not routed/built as of 2026-09-05.

## 0. The gap this closes vs the prior proposal

The prior proposal ("raid clear timer + boss HP pass/fail") modeled team survivability using the
existing two-candidates-vs-boss abstraction: ONE simulated candidate plus a flat `teammateDps`
scalar standing in for "the rest of the team." The overseer's correction: a real player brings
their OWN team of up to 6 Pokémon, and when the active one faints, the NEXT one in the lineup
steps in — the raid only fails if the timer expires or all 6 have fainted before the boss's HP
hits zero. A flat scalar cannot represent that sequential-swap structure; this design replaces
that piece specifically (not the whole prior proposal — the boss-HP-pool and raid-timer concepts
from that proposal are inherited wholesale, not redone).

## 1. The real mechanic (researched 2026-09-05)

**One active Pokémon at a time, sequential swap-in on faint** — [community-consensus, confirmed
via Bulbapedia's "Raid Battle (GO)" fetch and a targeted search]: raids behave like Gym battles —
a trainer selects up to 6 Pokémon before entering, but only one is "out" fighting at any moment.
When it faints, the trainer picks (or the game auto-selects) the next one from the remaining
roster. If all 6 faint, the trainer is bounced to the lobby and can heal/re-select before
rejoining (free re-entry, no second raid pass needed) — this matches the task's stated framing
exactly, not something I had to guess at.

**Switching resets energy to 0, but ONLY for the switched-out Pokémon** — [community-consensus,
Bulbapedia's "Energy (GO)" article, surfaced via search 2026-09-05]: "In Gyms and Raids, if a
Pokémon is switched out, its energy will be reset to 0... this mechanic is specific to raids and
gyms [not PvP]." This is actually a confirmation that the EXISTING simulator's per-call behavior
(`simulateStepwiseBattle` always starts `energy = 0`, full HP, for whatever `StepwiseAttacker` it's
given) is already exactly correct for modeling a freshly-swapped-in teammate — no new "energy
carryover" logic is needed for that side of the swap.

**No confirmed fixed swap-in delay/lockout duration.** Multiple community sources (search results
surfaced 2026-09-05, no single article fetched in full — general search-summary consensus only,
flagged as the weakest-sourced part of this design) describe "a brief revival screen pause" when a
Pokémon faints, avoidable by manually switching just before the KO lands (no time cost for a
**voluntary** pre-faint switch). No source gives a specific second count for the involuntary
post-faint pause, and it reads as substantially player-reaction-time-driven (how fast you tap
through the screen) rather than a fixed engine constant like a move's `durationSeconds`. I am
explicitly not fabricating a number here. Whether the real-world raid *timer* itself keeps
counting down during that pause is also unconfirmed by any source I could reach — I could not find
an article that states this explicitly either way. Treat both as open, flagged uncertainties (see
`swapCostSeconds` below), not settled facts.

**No boss "enrage"/rage mechanic** — I found no source, official or community, describing a
Pokémon GO raid boss changing its attack rate, damage, or defense as its HP depletes (unlike some
other games' boss-rage patterns). This matters directly for the design: it means a raid boss's
own attack cadence and stats are constant for the whole encounter regardless of remaining HP or
which specific attacker is currently facing it — a real simplifying assumption this design can
make with confidence, not one it has to hedge.

**Only one Pokémon may be Mega Evolved at a time — confirmed [official, pokemon.com]**, "A Guide
to Mega Evolution in Pokémon GO" (fetched 2026-09-05): "Only one of your Pokémon may be Mega
Evolved at a time... if you choose to Mega Evolve a different Pokémon before the eight hours is
over, the first Mega-Evolved Pokémon will return to its previous state." This is a *global*,
account-wide restriction (an 8-hour timer, far longer than any raid), not a raid-specific rule —
so within one raid encounter a trainer can have **at most one** of their 6 slots actually in mega
form. This directly matches, and validates, the existing engine's single-candidate mega-boost
model's implicit assumption. Confirms the design must enforce "at most 1 of 6 slots may be
mega/primal" as a hard input constraint, not a soft recommendation.

**The single biggest finding of this research pass — the mega/primal team-wide damage boost does
NOT apply to the mega's own trainer's own team.** [community-consensus, but an unusually specific
and consistent quote across two independent Bulbapedia fetches 2026-09-05, "Mega Evolution (GO)"]:
> "Note that the damage bonus is not applied to the user or, for Primal Reversion and Mega
> Rayquaza, its own party. However, if multiple players use Mega Evolution or Primal Reversion,
> they can boost each other."

And separately, on the "must be actively battling" nuance: "For most Mega-Evolved Pokémon, the
Mega-Evolved Pokémon must be present on the battlefield for the damage bonuses to be active...
For Primal Reversion and Mega Rayquaza... the damage bonuses are active even if the transformed
Pokémon is never sent out or has fainted." (Also consistent with the existing
`persistsThroughFaint` fact already in memory — [[fact_mega_boost_persists_after_faint]] — this
research pass adds the "or never sent out at all" detail on top of the previously-recorded
"survives its own faint" detail, and adds the self/other-trainer split, which the earlier pass had
not surfaced.)

**Why this is a big deal, stated plainly:** the existing engine's `convertUptimeToTeamDamage`
(`packages/engine/src/uptime.ts`) computes "team damage this mega's presence is attributable for"
using `teammateCount`/`matchingTeammateCount`/`teammateDps` fields whose doc comments read as if
they describe *this candidate's own party* ("How many of `partySize`'s teammates share the lead
candidate's boosted type..."). If the Bulbapedia quote above is accurate — and I could not find
anything contradicting it — then for a **solo trainer** (no other trainers present in the raid),
that entire computed quantity should be **zero**, always, regardless of `teammateDps` or
`matchingTeammateCount`: your own mega never boosts your own bench. The existing model would only
be correct if `teammateDps`/`matchingTeammateCount`/`partySize` are silently meant to represent
*other trainers in the same raid lobby*, not this trainer's own other Pokémon — and nothing in the
current field docs says that explicitly. **I am flagging this as a standalone, load-bearing
research finding for the overseer's attention, separate from the new-tab design below** — it
potentially affects the correctness of the *existing* two-candidate tab's team-damage numbers, not
just this new one, and re-litigating that is out of scope for a "design a new tab" task. Not
proposing a fix here; just refusing to quietly build a new feature on top of an assumption I have
reason to believe may already be backwards elsewhere in the tool.

## 2. What this means for the new tab's design specifically

Because a solo trainer's own mega does not boost their own bench, the sequential 6-slot team's
"does my team clear the boss" question, **for a solo raid**, reduces to something simpler and more
honest than the existing team-boost math: only the mega slot's *own* damage output benefits from
being mega-evolved (via `ownBoostMultiplier`, already correct and untouched by this finding — that
part of the mechanic isn't in question). The other 5 slots get no team-wide multiplier from your
own mega at all. If the design wants to model the *real* team-boost mechanic faithfully, it needs
an explicit "how many other trainers are in this raid, and do any of them have a mega active"
input — which is a different, genuinely optional axis (see "Open question: other trainers" below),
not something to fold into the 6-slot roster itself (those 6 slots are unambiguously one trainer's
own Pokémon, per the task).

## 3. Inputs — a full 6-slot team builder

**Per-slot fields** (array of 6, order-sensitive):
- Species ID (or empty/unset — a team can field fewer than 6 if the user chooses, "unset" slots
  simply never enter the fight and don't count toward the 6-faint loss condition).
- Fast move ID override (null = species' first fast move, matching existing per-candidate
  convention in `Scenario.candidateFastMoveIds`).
- Charged move ID override (same convention).
- `isMega: boolean` — whether THIS slot is the one Mega/Primal-evolved Pokémon for the whole raid.
  **Hard constraint: at most one slot may have `isMega: true`, and only for a species that actually
  has a `boost` defined** (`SpeciesDefinition.boost`) — enforced at the input-validation layer, not
  left as a silent no-op. This directly encodes the "only one mega at a time" confirmed mechanic
  above; UI should almost certainly implement this as radio-button-style exclusivity across the 6
  slots' mega toggle, not 6 independent checkboxes.

**Order**: user-settable, defaults to entry order (slot 1 = intended lead). See "Does order matter"
below — **recommendation: yes, let the user freely reorder (drag-to-reorder or up/down controls),
and additionally offer 2-3 canonical auto-orderings as one-click alternatives** (see 3c). Do not
force a single "correct" order silently — per the product's own ranking-flip thesis, showing how
the SAME roster's clear/no-clear outcome changes under different orderings is itself a legitimate
flip to surface, not a decision to make for the user.

**Shared-across-all-6-slots fields** (recommended simplification, justified below):
- `level: number`, `ivs: IVSpread` — ONE shared level/IV spread applied to all 6 slots, exactly
  mirroring the existing `Scenario.level`/`Scenario.ivs`'s current "same assumption for both
  candidates" precedent. **Justification**: real raid rosters do have genuinely varying IVs per
  Pokémon, so this is a real simplification, not a mechanical fact — but the marginal analytical
  value of per-slot IV granularity is small next to species/moveset/order choice, and 6 independent
  IV spreads is real added UI surface for a first cut. **Flagging as an open product question**,
  not deciding it myself: the overseer may reasonably want per-slot IVs for a "my actual box"
  fidelity use case.
- `dodgeModel: DodgeBehavior`, `dodgeFastAttacks: boolean` — ONE shared dodge assumption for the
  whole roster. **Justification, higher-confidence than the IV call**: dodge skill is a property of
  the *player's reflexes*, not of which of their own Pokémon happens to be out — there's no real
  mechanic reason a player suddenly dodges better or worse when their 4th teammate swaps in. Reuse
  directly, no new field needed.
- `weather: WeatherCondition` — one shared value, reused directly from the existing `Scenario`
  field (weather is a property of the encounter, not the attacker).
- Boss selection: `target: string`, `bossFastMoveId`/`bossChargedMoveId` — reused directly; one
  boss for the whole encounter (bosses don't change species mid-raid).
- `raidTimerSeconds: number` and the boss's `baseStamina`-as-HP-pool concept — inherited directly
  from [[proposal-raid-clear-timer-hp]]; this design assumes that proposal's groundwork (boss HP as
  a depleting resource, a real countdown) is either already built or gets built alongside this one
  — see "Sequencing dependency" below.
- New: `swapCostSeconds: number` (default 0) — an explicit, honestly-uncertain modeling knob for
  "how many seconds of the raid clock does a forced post-faint swap cost," defaulting to 0
  (fastest-possible-play / no penalty) precisely because no source could confirm a real number.
  Exposing it as a user-adjustable assumption (rather than silently assuming 0 *or* fabricating a
  "realistic" default like 2s) is the honest way to handle a real-but-unquantified game cost —
  the UI should visibly label it as an estimate/knob, not a researched constant.

**3c. Canonical auto-orderings** (one-click alternatives to manual reordering, not a replacement
for it): "as entered," "own-DPS descending" (front-load the hardest hitters to beat the clock),
"bulk/survivability descending" (front-load whichever slot survives longest, e.g. useful if the
goal is stalling for teammates rather than racing the clock — less obviously useful given no boss
enrage exists, but cheap to offer). **Not proposing full 6!=720-permutation exhaustive search as
the default** — flagging it as a possible stretch goal only, given the combinatorial cost is real
and the analytical payoff of the 721st ordering over the best of 3-4 sensible heuristics is likely
small.

## 4. Outputs

Reusing the prior proposal's core math (cumulative team damage vs. boss HP over time, checked
against the raid timer), now driven by concatenated per-slot segments instead of one continuous
candidate fight://
- **`clearsWithinTimer: boolean`**, **`timeToClearSeconds: number | null`**, **`timerMarginSeconds`**
  — same shape as the prior proposal, but `timeToClearSeconds` now scans across the *concatenated*
  cumulative-damage trajectory of however many slots actually fought, not one candidate's.
- **`clearingSlotIndex: number | null`** — which of the 6 slots's damage actually pushed cumulative
  team damage over `boss.baseStamina` (new — has no equivalent in the single-candidate version,
  since there was only ever one attacker to credit).
- **`slotsUsed: number`**, **`slotsFainted: number`** — how many of the 6 were actually sent out
  before the fight ended (by clear, timer expiry, or all-6-fainted), and how many of those fainted.
- **`teamWiped: boolean`** — true specifically when all 6 fainted before either the boss's HP or
  the timer ran out — the third, genuinely new loss condition this design introduces that the
  single-candidate version had no way to express at all (a lone candidate "fainting" was always
  already a loss by definition; a *team* can lose a slot without losing the raid).
  **SUPERSEDED 2026-09-05 — see Section 9.** This bullet is factually wrong about the real game:
  a full team wipe is not a loss condition at all, it's a re-enterable, time-costing event. Kept
  here unedited (rather than silently rewritten) so the correction in Section 9 is visible as a
  correction, not backfilled as if it were always right.
- **Per-slot breakdown**: each slot's own `secondsActive`, `ownDamageDealt`, `faintedAtSeconds |
  null` (null if it never got sent out, or was still alive when the raid ended) — lets a user see
  *why* the team did or didn't clear, not just the aggregate verdict.
- **Chart**: generalizes the existing `DamageOverTimeChart` to plot the concatenated team-damage
  trajectory with a vertical divider at each slot handoff (so a viewer can see "slot 2 took over
  here"), plus the same horizontal boss-HP line and vertical timer line the prior proposal already
  proposed adding.

## 5. Interaction with the stepwise simulator — reuse vs. new code, stated explicitly

**Cleanly reusable as-is, per slot**: each slot's fight is genuinely just one more call to the
existing `simulateStepwiseBattle`/`runStepwiseDistribution`, built from a `SpeciesDefinition`
exactly the way `runSustainedComparison` (`packages/engine/src/comparison.ts`) already does per
candidate today. Each slot's `StepwiseAttacker` starts at full HP and 0 energy — which the Bulbapedia
finding above confirms is already the mechanically-correct behavior for a freshly-swapped-in
teammate, not an approximation this design has to work around.

**Boss-HP depletion — recommend pure post-processing, no change to the per-tick loop.** Run each
slot's fight to its own natural completion exactly as today (attacker faints or hits its own
`maxSeconds`), completely ignoring boss HP during the tick loop itself — identical in spirit to the
prior proposal's `timeToClearSeconds`, which was explicitly "a read-only consumer of existing
simulation output... not a second combat model." Then, in an orchestrating function ABOVE
`simulateStepwiseBattle` (new code, but thin): concatenate each slot's `ownDamageTrajectory` with a
running time offset, scan the concatenated series for the first point where cumulative damage
reaches `boss.baseStamina` (stopping the concatenation/orchestration there — no need to even run
slot 4 if slot 3 already cleared it), and separately check the running clock against
`raidTimerSeconds` (stopping there too if hit first). Neither check requires teaching
`simulateStepwiseBattle` anything new about boss HP as a resource.

**One genuinely new small piece is required: boss charged-move-cooldown continuity across the
slot handoff.** The boss doesn't reset its own attack cadence just because the trainer's active
Pokémon changed — it's one continuous encounter from the boss's side (no source I found suggests
otherwise, and it would be a strange design if a boss's cooldown reset every time any attacker,
across up to ~20 simultaneous trainers, switched). `StepwiseBoss` already has exactly the field
this needs — `chargedMoveWarmupSeconds` — whose own doc comment already anticipates this exact use
case (currently phrased for the multi-*trainer* case, but the mechanic is identical for a single
trainer's own slot handoff): "modeling a mega that tags in mid-fight against a boss an earlier
trainer's mega already left partway charged." The one missing piece: `StepwiseRunResult` doesn't
currently expose *how much cooldown was left* on the boss's charged move when a slot's segment
ended — that's a small, additive new field (e.g. `bossChargedMoveResidualSeconds: number | null`)
for `engine-developer` to add, fed forward into the next slot's `chargedMoveWarmupSeconds`. This is
the one true "new engine surface," and it's small and additive, not a rearchitecture.

**RNG continuity across slots** — minor, already has precedent: `runStepwiseDistribution` already
offsets each iteration's seed (`baseSeed + i * 7919`) so repeated calls don't correlate. The
orchestrator should do the same across slot index (not reuse one seed for all 6 calls), otherwise
slot 2's boss-hit jitter draws would replay the identical sequence as slot 1's. No new RNG
machinery needed, just consistent seed-offsetting, already an established convention in this
codebase.

**Net assessment**: mostly reuse, one small additive engine field, one new (but thin) orchestrating
function that concatenates existing outputs rather than reimplementing combat math. Not a second
combat model.

## 6. Scenario / sharing — recommend a new, separate `TeamScenario`

**Recommendation: a new sibling type, not an extension of `Scenario`.** Reasoning:
- `Scenario.candidates`/`candidateFastMoveIds`/`candidateChargedMoveIds`/
  `candidateMegaBoostDisabled` are explicitly 2-tuples (`[string | null, string | null]`) by type —
  already flagged as a real migration cost in [[proposal-field-survey-ranked-table]] if ever made
  N-length. A 6-slot team needs genuinely different array lengths (6, with per-slot order and an
  `isMega` flag that has no 2-candidate equivalent at all) — trying to force one shape to serve
  both a strict-pair comparator and an ordered 6-slot roster risks exactly the "silently reverts to
  a default on a shared link" bug class CLAUDE.md calls out, since a scenario decoder would have to
  guess which shape it's looking at.
- Shared concerns (boss `target`/move IDs, `level`, `ivs`, `dodgeModel`, `dodgeFastAttacks`,
  `weather`, `raidTimerSeconds`) are common to both `Scenario` and the new `TeamScenario` — I'm
  flagging this duplication explicitly rather than proposing a shared base type myself, since
  factoring that out is a real engine-design call (does a shared sub-type risk coupling the two
  tabs' evolution together, e.g. a future `Scenario`-only field accidentally landing on the shared
  base?) that belongs to `engine-developer`, not to a design-only research pass.
- `TeamScenario` needs its own `encodeTeamScenario`/`decodeTeamScenario` mirroring `Scenario`'s
  existing base64url-JSON pattern (`scenario.ts`) exactly — same round-trip discipline, same
  "must survive a shared link" requirement, just a different shape underneath. Whether it shares
  the same URL query param (`s`) as `Scenario` (distinguished by which tab is active) or gets its
  own (`ts`) is a `web-developer`/routing decision, not a research one — flagging it needs an
  explicit choice, not leaving it implicit.
- **This is itself a new user-facing assumption surface** (per the standing decision that every
  user-facing assumption must round-trip through `Scenario`) — `swapCostSeconds`, per-slot
  `isMega`, per-slot order, and everything else new above must all be encodable in whatever shape
  is chosen, named explicitly here rather than left implicit, per the task's own instruction.

## 7. Standing-decision tension — addressed head-on, not silently resolved

CLAUDE.md rules out a **"Teambuilding Analyzer" (multi-trainer mega staggering across a raid,
since the mega boost doesn't stack)** as out of scope, explicitly ruled out once already.

**My reasoning for why this design is a different feature, not a repackaging of that one:**
1. The ruled-out feature is about **multiple trainers** coordinating **when each brings their own
   mega** into a shared raid (since simultaneous megas don't stack, there's a scheduling/staggering
   optimization problem across *different people's accounts*). This design is about **one
   trainer's own 6-Pokémon lineup**, sequentially swapped by faint — no other trainer, no
   scheduling-across-accounts question, appears anywhere in it.
2. The research finding above (mega team-boost doesn't apply to the mega-bringer's own party at
   all) actually makes this design *further* from the ruled-out concept than it might first appear:
   there is no "when should I mega within my own 6" optimization to solve here at all, because a
   solo trainer's own mega never boosts their own other 5 slots regardless of order — the only
   place mega *timing* would matter across trainers is precisely the ruled-out multi-trainer
   staggering question, which this design deliberately does not touch (see "Open question: other
   trainers" immediately below).
3. That said, I flag this explicitly rather than deciding it silently, per the task's instruction,
   because **the "other trainers present in the raid" extension I mention as optional/deferred
   below is the one place this design could drift toward the ruled-out territory if scope crept**
   — modeling *when other trainers' megas come online* to boost this trainer's team would be
   exactly the ruled-out feature. My recommendation is to explicitly NOT build that extension as
   part of this tab; if the overseer wants "other trainers' aggregate DPS" modeled at all (e.g. a
   flat `otherTrainersDps` add-on to the boss-damage total, analogous to today's `teammateDps` but
   correctly rescoped as "other trainers," not "my own bench"), that should be scoped and named as
   its own explicit decision, not something this design backs into by default.

**Open question for the overseer, not decided here**: should this tab model "other trainers in the
raid" at all (relevant for the vast majority of real Tier-5/Mega/Primal raids, which are rarely
solo)? My recommendation is to ship a first cut modeling **solo-trainer-only** (the literal ask —
"a player's own team of up to 6"), with "other trainers" as an explicitly separate, later decision
— both because it's the literal scope of the task, and because folding it in now is the fastest
route back toward the very thing CLAUDE.md ruled out.

## 8. Recommended concrete design, in one paragraph

A new "Team Raid Simulator" tab (the app currently has no tab/routing concept at all — `App.tsx`
is one continuous page — so this needs a small new top-level view switcher, itself worth flagging
as net-new UI scaffolding, not a detail hidden inside "add a tab"), backed by a new `TeamScenario`
type (boss/level/IV/dodge/weather/timer fields shared in spirit with `Scenario` but a separate,
duplicated shape rather than a forced-shared migration) with a 6-slot ordered roster (species +
per-slot move overrides + exactly one `isMega` flag, enforced exclusive) and a new, honestly-labeled
`swapCostSeconds` knob defaulting to 0. Engine-side: a new thin orchestrating function that calls
the existing `simulateStepwiseBattle` once per slot (each slot built exactly as
`runSustainedComparison` already builds a `StepwiseAttacker` today), concatenates their
`ownDamageTrajectory`s with a running clock and running boss-HP counter entirely in
post-processing, and carries the boss's charged-move-cooldown residual forward slot-to-slot via
one new additive `StepwiseRunResult` field. Output: clears/doesn't-clear, time-to-clear-or-timeout,
which slot landed the finishing blow, per-slot faint/survive breakdown, and a generalized
damage-over-time chart with slot-handoff dividers plus the boss-HP and timer reference lines from
the prior proposal. Order is user-settable with a few one-click canonical auto-orderings, not
silently decided by the tool. Explicitly solo-trainer-scoped; "other trainers present" is named as
a deliberately separate, deferred decision to avoid drifting into the ruled-out Teambuilding
Analyzer territory.

## 9. ADDENDUM 2026-09-05 — full team wipe is a time-cost-and-continue event, not a loss

Follow-up correction requested by the overseer to Section 4's `teamWiped: boolean` framing above.
Re-researched, don't-guess, per the task's five numbered questions.

### 9.1 Findings, each tagged

**(Q1) You can rejoin the same raid attempt after a full wipe, and the raid's own timer is the
single shared clock governing the whole thing — there is no separate frozen "healing state."**
[community-consensus, moderate-to-high confidence, Bulbapedia direct quote + corroborating
community threads, all surfaced/fetched 2026-09-05]: Bulbapedia, "Raid Battle (GO)" — "If all six
of a player's Pokémon faint, the player is returned to the lobby, where they can heal their
Pokémon using items from their Bag" and, separately, "After spending a Raid Pass, a player may
repeatedly attempt that same raid until either they defeat the Raid Boss or the raid's timer
expires." That second sentence is the load-bearing one: it names exactly one timer ("the raid's
timer") governing all repeated attempts, not a per-attempt sub-timer that resets or pauses — which
is the strongest textual support I could find for "one shared clock, not a separate/frozen state."
I could not find a primary source with the literal sentence "the timer visibly ticks through the
lobby/reselect screen with zero pause" — the closest I have to that specific sub-claim is a
search-engine-summarized characterization (not an independently fetched, quotable primary source)
stating the timer counts down during lobby healing. **I'm flagging the distinction explicitly**:
"one shared clock spans all attempts within a raid" is well-supported; "that clock's countdown
display never pauses for even a frame during the lobby screen itself" is a weaker, inferred
sub-claim I could not independently verify to the same standard. For design purposes this
distinction doesn't matter — either way, time spent healing/reselecting is time the trainer does
not get back against the same raid's finite clock, which is the only thing the model needs to be
true.

**(Q2) Reviving during the lobby-return flow costs real Bag items — Potions/Revives/Max
Revives — not a separate free heal.** [community-consensus, direct quote, Bulbapedia, fetched
2026-09-05]: the same sentence above — "heal their Pokémon **using items from their Bag**" — is
explicit that this is the ordinary inventory, not some raid-specific free-heal mechanic. This
directly answers the task's "get this right" ask: it is a real resource constraint, not
assumed-away by the game itself.

**(Q3) No stated cap on the number of wipe-and-rejoin cycles, provided the trainer doesn't
voluntarily quit.** [community-consensus, direct quote, Bulbapedia, fetched 2026-09-05]: "a player
may repeatedly attempt that same raid until either they defeat the Raid Boss or the raid's timer
expires" states no count limit at all — the only two stopping conditions named are boss-defeated
and timer-expired. There IS a sharp, separate exception worth flagging: "If a player specifically
chooses to quit a Raid Battle, either from the lobby or after the start of the Raid Battle, they
cannot rejoin that same challenge" [Bulbapedia, same fetch] — a **voluntary** quit forfeits
re-entry entirely, unlike a **forced** all-6-faint bounce, which doesn't. This tool's simulator has
no notion of "the trainer rage-quits" (it only models "does this team, played out, clear the
boss"), so the voluntary-quit case is mechanically real but not something this design needs to
represent — flagging it here so it's not silently forgotten if the tool ever grows a
"player gives up" scenario, not because it changes anything about this design's math.
Separately noted, off to the side: **Unity Raids** (a distinct raid type) reportedly auto-revive a
wiped team after a delay with no item cost [community-consensus, surfaced via search only, not
independently fetched from a primary source] — this is a different raid *type* with different
mechanics, not the standard Mega/T5/Primal raids this design targets, and I am not folding it into
this design; flagging only so a future "raid type selector" doesn't get built assuming one uniform
wipe-recovery rule across all raid types.

**(Q4) No official fixed number for the rejoin-flow time cost — but a concrete, named
community-sourced estimate exists, stronger footing than `swapCostSeconds` had.**
[community-consensus / estimate, Pokémon GO Hub, "Tips for short-manning raids," fetched
2026-09-05]: "Healing all of them usually takes between 12 to 15 seconds (each time all your
Pokémon faint), depending on how good your phone is and how fast you can do it." The source's own
wording flags it as player/hardware-dependent, exactly the same caveat this design already applied
to `swapCostSeconds` — I am not upgrading this to a "confirmed constant," but it is a real,
named, numeric community estimate (not a search-summary paraphrase), which is better sourcing than
`swapCostSeconds` had. The same article separately mentions a raid-desync **glitch** where "the
raid boss will regenerate a little bit of its health back" if trainers heal at the same lobby
moment as other trainers — noted as a known bug, not a mechanic to model (out of scope, and only
relevant to real multiplayer lobby timing, not this solo-trainer design).

**(Q5) Energy resets to 0 for a revived, rejoining Pokémon — by direct analogy to the already-confirmed
general rule, not independently re-confirmed for this exact sub-case.** The earlier research
already sourced, from Bulbapedia's "Energy (GO)" article: "In Gyms and Raids, if a Pokémon is
switched out, its energy will be reset to 0." I re-fetched that article specifically looking for
language about the post-full-wipe-revive case and found **no sentence addressing it directly** —
the article's stated rule is phrased generally ("if a Pokémon is switched out"), and a revived
Pokémon re-entering the field after a lobby bounce is, mechanically, a Pokémon newly entering
battle exactly like any other swap-in. I'm treating "0 energy on rejoin" as a reasonable
same-mechanism inference, not an independently-quoted fact for this specific sub-case — flagged at
slightly lower confidence than the general switch-reset rule itself, but nothing I found
contradicts it and no source describes any different, special-cased behavior for a revived
Pokémon (e.g., "keeps partial energy") that would need separate modeling.

### 9.2 What this changes about the design (Sections 3-6 above)

**The loss condition collapses to exactly one: the raid timer (`raidTimerSeconds`) expiring with
cumulative team damage still short of `boss.baseStamina`.** A full team wipe is not, by itself, a
loss — it's an event that costs clock time and then continues, exactly as the overseer's framing
states. `teamWiped: boolean` (Section 4) should be deleted as an output; there is no longer a
condition it would represent as fatal on its own.

**Orchestration (Section 5) needs an actual structural change, not just a renamed field.** The
prior design ran each of the 6 slots' fights once, in a straight line, and stopped after slot 6
(the last one) fainted — because under the old (wrong) assumption, that faint WAS the loss. Under
the corrected mechanic, if all 6 configured slots have fainted but there is still boss HP
remaining AND `raidTimerSeconds` has not yet elapsed, the trainer heals (paying a new
`reviveCostSeconds` cost) and re-enters with the same roster, restarting from slot 1. Per Q5, a
revived slot's fight is statistically identical in expectation to its first run (full HP, 0
energy) — so no new combat math is needed, only a looping orchestrator: instead of iterating the 6
slots once, iterate in cycles, and after each full-roster faint-out, add `reviveCostSeconds` to
the running clock and loop back to slot index 0, stopping only when (a) cumulative team damage
reaches `boss.baseStamina` (clear), or (b) the running clock reaches `raidTimerSeconds` (loss) —
whichever comes first, checked continuously, not just at cycle boundaries. This does need one
implementation-safety note for `engine-developer`, not a mechanic finding: an all-zero or
near-zero net-damage roster could in principle loop close to indefinitely before the timer catches
it, so the orchestrator needs a hard iteration/wall-clock cap as a code-safety guard — that cap is
an engineering concern, not a real game rule (the real game imposes no count cap, per Q3).

**New Scenario field: `reviveCostSeconds: number`** — mirrors `swapCostSeconds` exactly in shape
and honesty: a full-wipe-only cost (distinct from the existing `swapCostSeconds`, which is paid
per individual mid-roster faint, no lobby return involved), paid once per full-roster wipe cycle.
**Recommended default: 0**, for the same reason `swapCostSeconds` defaulted to 0 (fastest-possible
play, no fabricated constant baked into old shared links) — but given the stronger sourcing here
(a named 12-15s community range, not just a vague "brief pause"), the UI should offer a clearly
labeled non-default preset (e.g., "~13s, per Pokémon GO Hub community estimate") rather than
leaving the user to guess a value with zero grounding. This is a genuinely different sourcing
situation than `swapCostSeconds`'s, worth treating slightly differently in the UI even though the
recommended *default* is the same. Must round-trip through `Scenario`/`TeamScenario` per the
standing decision, same as every other new field this design introduces.

**Output shape changes** (Section 4): `teamWiped: boolean` → replaced by `wipeCount: number` (how
many times the full roster fainted out and had to be revived-and-rejoined before the encounter
ended, 0 for a clean single-pass clear) — a diagnostic/descriptive stat, not a loss flag. The
per-slot breakdown becomes per-*cycle*-per-slot (a given slot can now faint and refight more than
once across cycles), so `slotsUsed`/`slotsFainted`/`clearingSlotIndex` need a cycle index alongside
the slot index to stay unambiguous — e.g. `clearingCycle`/`clearingSlotIndex` as a pair, and the
per-slot breakdown becomes a flat list of `(cycle, slotIndex, secondsActive, ownDamageDealt,
faintedAtSeconds | null)` entries rather than one row per slot. The chart's slot-handoff dividers
(Section 4) need a distinct visual treatment for a "wipe-and-revive" divider (pay
`reviveCostSeconds`, restart at slot 1) versus an ordinary "next slot in line" divider (pay
`swapCostSeconds`, next slot) — these are now two visually and mechanically distinct event types
on the same trajectory, not one.

### 9.3 Open product question — flagging, not deciding

**Item scarcity (Revive/Max Revive/Potion stock) is a real resource constraint the game enforces
(Q2), and this design does not model it.** Per the task's explicit instruction to get this right
rather than quietly assume it away: I am recommending this design **explicitly declare v1 assumes
unlimited healing items** — i.e., a trainer can always pay `reviveCostSeconds` and continue,
however many times a cycle repeats, for as long as the raid timer allows. This follows the same
precedent already set elsewhere in this same design doc (Section 3, shared level/IV across all 6
slots: "a real simplification, not a mechanical fact... flagging as an open product question, not
deciding it myself"). The honest alternative — modeling a finite `revivesAvailable`/
`maxRevivesAvailable`/`potionsAvailable` budget that could turn "ran out of healing items" into a
**second, genuinely distinct loss condition** separate from timer expiry (a real way real players
lose real raids, especially under-prepared solo players) — is a legitimate, larger product
question I am naming explicitly rather than resolving. It would add real new `Scenario` input
surface (item counts) for a real mechanic this research confirms is true, so it's not a strawman;
it's just bigger than "add one `reviveCostSeconds` knob" and belongs to the overseer to accept or
defer, not to me to fold in by default.

### Sources (addendum)
- Bulbapedia, "Raid Battle (GO)" — https://bulbapedia.bulbagarden.net/wiki/Raid_Battle_(GO)
  (re-fetched 2026-09-05, targeted quote extraction): "returned to the lobby... heal... using items
  from their Bag"; "repeatedly attempt that same raid until either they defeat the Raid Boss or the
  raid's timer expires"; "If a player specifically chooses to quit... they cannot rejoin that same
  challenge."
- Bulbapedia, "Energy (GO)" — https://bulbapedia.bulbagarden.net/wiki/Energy_(GO)"
  (re-fetched 2026-09-05, targeted): confirms the general switch-resets-energy-to-0 rule again; no
  sentence found addressing the post-full-wipe-revive sub-case specifically (noted as an inference,
  not an independent confirmation, in 9.1/Q5 above).
- Pokémon GO Hub, "Tips for short-manning raids" —
  https://pokemongohub.net/post/guide/tips-for-short-manning-raids/ (fetched 2026-09-05): "Healing
  all of them usually takes between 12 to 15 seconds... depending on how good your phone is and how
  fast you can do it"; also notes an unrelated boss-HP-regen desync glitch, flagged as a known bug
  not a mechanic.
- General web search (2026-09-05, search-summary level, not independently fetched to a single
  quotable primary source): characterization that the raid timer counts down through the lobby
  healing screen without pausing — flagged as the weaker half of the Q1 finding, see 9.1 for the
  explicit confidence split between "one shared clock across attempts" (well-supported) and
  "zero-pause tick-by-tick through the lobby screen" (inferred, not independently quoted).
- Search-surfaced mention of "Unity Raids" auto-revive exception (not independently fetched) — noted
  as a different raid type/mechanic, explicitly out of scope for this design.

## Sources
- Bulbapedia, "Raid Battle (GO)" — https://bulbapedia.bulbagarden.net/wiki/Raid_Battle_(GO)
  (fetched 2026-09-05): one-Pokémon-at-a-time/sequential swap structure, all-6-faint → lobby
  bounce-and-reheal behavior.
- Bulbapedia, "Energy (GO)" (surfaced via search 2026-09-05, not independently fetched in full):
  switching resets energy to 0 in Gyms/Raids specifically (not PvP).
- Pokemon.com, "A Guide to Mega Evolution in Pokémon GO" —
  https://www.pokemon.com/us/strategy/a-guide-to-mega-evolution-in-pokemon-go (fetched 2026-09-05):
  [official] only one Pokémon may be Mega Evolved at a time (8-hour global timer).
- Bulbapedia, "Mega Evolution (GO)" — https://bulbapedia.bulbagarden.net/wiki/Mega_Evolution_(GO)
  (fetched twice, 2026-09-05, consistent both times): [community-consensus] the team-wide damage
  bonus does NOT apply to the mega-bringer's own party — only to other trainers, who can boost each
  other if multiple bring their own mega/primal; also the "present on the battlefield" vs "never
  sent out" distinction between standard megas and Primal/Mega-Rayquaza.
- General web search (2026-09-05, no single article fetched in full, search-summary only): "brief
  revival screen pause" on faint, no confirmed fixed duration; no source found on whether the raid
  timer itself pauses during that screen. Flagged as the weakest-sourced part of this design.
- No source (official or community) found describing a raid boss "enrage"/rage mechanic tied to
  its own remaining HP — treated as confidently absent given the total absence of any hit.
