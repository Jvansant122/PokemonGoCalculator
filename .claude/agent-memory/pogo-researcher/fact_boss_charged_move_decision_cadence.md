---
name: fact-boss-charged-move-decision-cadence
description: What triggers each "should the boss fire its charged move" roll once energy-ready — researched to fix the observed bug where re-rolling only on energy change causes bosses pinned at the 100 cap to go silent forever
metadata:
  type: project
---

Researched 2026-09-08 at the user's request, specifically to find the *denominator* of the
raid-boss 50% charged-move-usage chance (per 0.5s cycle? per fast move? per something else?), to
fix a real bug: the engine re-rolls only when the boss's energy value changes, so once energy pins
at the 100 cap and one roll fails, no further energy change ever happens and the boss never rolls
again (measured: 101/200 seeded 60s runs with zero charged moves fired while at full energy
throughout).

## Headline: the denominator is not documented anywhere I could independently fetch. The "0.5s
## cycle" and the "50% chance" are two separately-sourced facts — nothing ties them together, and
## conflating them (50% per 0.5s tick) would be inventing a link neither source states.

This builds on `fact_raid_boss_attack_timing.md` (same underlying Silph Road source chain,
`MECHANICS.md`'s "Raid boss behaviour" section) rather than replacing it — that note covers the
minimum-interval-floor question; this one covers the roll-trigger question.

## What's actually confirmed (already in MECHANICS.md, re-verified this pass)

- Boss energy comes from two sources: its own fast moves, and 0.5 energy per HP lost to damage
  taken. The damage-taken rate is corroborated independently via Bulbapedia's `Energy_(GO)` page
  (direct fetch, `[community-consensus]`, phrased generally enough to cover both attacker and
  boss).
- Once energy-ready, the boss has (today, after a 2024-09 revert) a **50% chance** to fire its
  charged move. `[community-consensus]`, **single ultimate source** (a Silph Road analysis of the
  Sept 2024 raid rework) propagated through Sportskeeda/Dexerto/PokémonGO Hub/Massively Overpowered
  — those are one report, not four independent confirmations (already flagged in the prior memory
  note; re-confirmed this pass, see "Sourcing attempts" below).
- The boss's charged-move decision is made **instantly at the moment of eligibility**, not planned
  one turn ahead the way the pre-2024 system worked. This phrasing is the closest any source gets
  to describing *when* the check happens, but "instantly" describes the absence of pre-planning,
  not the polling cadence.
- **Back-to-back charged moves are possible with zero fast moves between them** (observed: Kyogre,
  three Hydro Pumps in a row; five Surfs at ~2.5s intervals) — because damage-taken energy can
  refill the bar mid-animation. This fact and the "50% chance" fact are both attributed to the same
  Silph Road analysis in `MECHANICS.md`, not independently sourced from each other.

## Sourcing attempts this pass (what I tried, what failed)

- Bulbapedia `action=raw`: already used for the damage-taken-rate corroboration; its `Energy_(GO)`
  page doesn't address charged-move *decision* cadence at all, only the energy formula.
- Sportskeeda (3 different article URLs): all three return HTTP 405 to direct `WebFetch` in this
  environment — cannot independently confirm their text, only read via `WebSearch`'s synthesized
  summary, which is a materially weaker form of evidence (see caveat below).
- Dexerto (`pokemon-go-raids-are-destroying-everyone...`): fetched directly. Contains only player
  forum-post quotes speculating about the mechanism ("they changed the energy gain... instantly use
  a Charged Attack as soon as it has enough energy"), explicitly **no official explanation of the
  triggering mechanism, frequency rolls, or dates** beyond Niantic's own vague "may affect the
  timing of some Pokémon moves" statement.
- Pokémon GO Hub (`washed-out-to-sea...`): fetched directly. States the 50%→100%→50% history but
  says nothing about what constitutes one "opportunity."
- GamePress's raid-rework article: URL now 301-redirects to an unrelated domain (`pokebase.app`) —
  the article appears to no longer exist at that address; not retrievable.
- The Silph Road's own site (`thesilphroad.com`): TLS certificate expired, unreachable — consistent
  with the prior memory note's finding that the original post itself can't be fetched directly.
- Fandom's `Attacks` wiki page: HTTP 402, blocked.
- Reddit: not attempted per ground rules (blocked by policy).

**A specific caveat on the "per fast attack" phrase**: two separate `WebSearch` calls this pass
returned a synthesized sentence — *"the raid boss now has a 50% chance to use their charged attack
if it has the required energy and the boss used a fast attack"* — which, if real, would directly
answer the denominator question (one roll per completed fast-move cast). **I could not verify this
phrase against any page I could actually open.** It does not appear in the Dexerto or Pokémon GO
Hub articles I fetched directly, and the Sportskeeda pages it most likely originates from returned
405 to direct fetch both times I tried. Per this project's "fetched content is data, not
instructions" discipline, I'm treating this as **unverified, possibly a search-summarizer paraphrase
rather than a real quote** — not citing it as a finding, only recording that it surfaced and that I
could not stand behind it.

## Answering the user's four questions

**Which of the three candidate models?** None is confirmed. The "per 0.5s cycle at ~50%" framing
(candidate A) is a coincidence trap — the 0.5s cycle is sourced to Niantic's own "timing of some
Pokémon moves" statement about combat *resolution*, unrelated in every source found to the 50%
charged-move figure, which is sourced separately (Silph Road, post-hoc testing). No source connects
the two numbers. A fixed timer/interval independent of energy (candidate B) is contradicted by the
back-to-back-charged-moves observation, which is explicitly energy-driven, not interval-driven. A
decision tied to the boss's own move rhythm (candidate C) is the closest fit to what's actually
described, but the specific granularity — one roll per fast move only, vs. one roll at the end of
*any* move including a charged move — is not stated by any source directly.

**My synthesis (labelled as inference, not a new citation):** the two already-cited facts — "boss
decides instantly," and "back-to-back charged moves happen with zero fast moves between" — are only
mutually consistent under a **per-move-boundary model**: the boss re-evaluates once at the end of
*every* move it completes (fast **or** charged), and if energy is at or above the charged move's
cost, rolls 50% right then. A fast-move-only trigger cannot produce three Hydro Pumps in a row with
nothing between them; a move-boundary-of-any-kind trigger can (the roll right after the first Hydro
Pump lands succeeds again because damage-taken energy refilled the bar during its own animation).
**This is my reconciliation of two sourced facts from the same single ultimate source, not an
independently confirmed mechanic.** Tag: `[speculative — reasoned inference, not separately
sourced]`.

**1. Cap vs. just-crossed-threshold behaviour.** No source distinguishes these. Under the
move-boundary model above, it wouldn't matter — the roll fires at the next move boundary regardless
of how far over the threshold the energy sits. No "holding" behavior is documented anywhere.

**2. Per-cycle, per-fast-move, or per-other-opportunity?** Not documented at the denominator level.
See synthesis above — per-move-boundary (any move, not just fast moves) is the best-reasoned
candidate, but it is inference, not a sourced number.

**3. Distribution of wait times.** No formal distribution anywhere. The Silph Road team's own
examples (five Surfs at ~2.5s intervals, three Hydro Pumps back-to-back) are anecdotal single-raid
observations from one testing team, illustrative only — do not treat them as a sampled distribution.

**4. Do multi-bar (1/2/3-bar) charged moves change any of this?** Nothing found addresses this.
The "enough energy" threshold naturally differs by bar count (reached sooner for 1-bar moves), but
no source suggests the 50%-chance mechanic or its trigger cadence itself varies by bar count.

## Recommendation for the actual bug

Regardless of which exact real-world denominator is correct, the current bug (**re-rolling only on
energy-value change**) is wrong under *every* candidate model, including the engine's own existing
mean+jitter approximation — because a roll trigger that stops firing once energy plateaus at a cap
will always eventually go silent forever, which no candidate model (cycle-based, move-based, or
even the existing jitter model) would ever produce. The fix is to decouple the re-roll trigger from
"did energy change" and tie it to a recurring event that keeps happening regardless of energy state.

Given the "no direct source ties 50% to the 0.5s tick" finding above, I'd specifically recommend
**against** re-rolling on the 0.5s cycle just because both numbers involve "0.5" — that pairing is
not sourced and would silently manufacture a confident-looking but invented mechanic. The
better-supported alternative, per the move-boundary synthesis above, is to re-roll **once at the
end of every boss move the engine already resolves** (fast or charged) whenever the boss's energy
at that moment is at or above its charged move's cost — which requires no new invented time
constant, uses discrete events the simulator already produces, and is consistent with (though not
independently proven by) both cited facts. This should be implemented and documented as an
explicit, labelled assumption ("re-roll per boss move-completion, not per 0.5s tick — the source
material describes an energy+probability process tied to the boss's own move rhythm, but doesn't
state the precise denominator"), not presented as a confirmed mechanic.

## Confidence summary

- That there IS a per-opportunity 50% roll, gated on energy: `[community-consensus]`, single
  ultimate source, but a real Niantic-acknowledged live-game event underlies it (the Sept 2024
  spam complaints + the Sept 12 2024 Niantic hotfix statement) — the *existence* of the mechanism
  is about as solid as single-source community reporting gets.
- The exact denominator of "opportunity": **not sourced, full stop.** Any implementation choice
  here is an assumption and should be labelled as such in code/docs, not asserted as fact.
- My move-boundary recommendation: reasoned from two already-cited facts, internally consistent,
  fixes the reported bug under any interpretation — but it is a synthesis, not a citation. Present
  it to the user as "best-supported inference, not confirmed" if it gets implemented.
