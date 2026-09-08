---
name: fact-raid-boss-attack-timing
description: Real mechanics governing raid boss charged-move cadence/timing, researched to source simulate.ts's bossChargedMoveCadenceClamped floor
metadata:
  type: project
---

Researched 2026-09-08 at the user's request, to source (or debunk) an engine-side clamp floor for
`boundedJitteredChargedMoveInterval` in `packages/engine/src/simulate.ts` (already implemented as
`durationSeconds` at the time of research — this note evaluates that choice, doesn't propose a
different one from scratch).

## Headline finding: boss charged-move cadence is energy-driven, not a fixed interval — and the
## engine's own mean+jitter shape is a known, already-flagged simplification of that

**[community-consensus, weakly corroborated]** A raid boss's charged-move timing in the real game
emerges from an energy-accumulation process with **two energy sources**, not one:

1. Its own fast-move casts, at that move's `energyGain` per cast — this is exactly what
   `bossChargedMoveReadySeconds` (combat.ts) already computes, and it's already correctly
   documented there as a **lower bound**, not an exact time.
2. **Energy gained from damage TAKEN** — i.e., the boss itself gains energy proportional to HP it
   loses to the attacker(s), mirroring `energyFromDamageTaken`/`ENERGY_PER_DAMAGE_TAKEN` (energy.ts),
   which this engine already models **for the attacker** but explicitly does NOT model **for the
   boss** — `combat.ts`'s doc comment on `bossChargedMoveReadySeconds` already says this out loud:
   "not the energy the real game also grants bosses from damage taken, which this engine doesn't
   model on the boss side. That omission is deliberate: this function answers 'cannot happen sooner
   than X,' a lower bound, not 'happens at exactly X.'" This research confirms that omitted mechanic
   is real, not hypothetical.

**Sourcing tier and a real caveat on it**: every source found traces back to the same underlying
claim — a PokeMiners social-media post (Threads, dated 2024-09-07) datamining a GAME_MASTER value
change. I could not fetch that post directly (X/Threads both blocked direct fetch in this
environment), so what follows is **[community-consensus], not confirmed**, and specifically
suffers from citation convergence: Sportskeeda, Pokémon GO Hub, Dexerto, and Massively Overpowered
all repeat the identical "0.02 → 0.5" and "50% chance → always fires" framing in near-identical
wording, which reads as one datamine report propagating through gaming-news aggregators rather than
several independent confirmations. Treat it as one report, not four.

**The claimed numbers** (2024-09-07 datamine, per that chain of secondary sources):
- Raid boss energy-per-HP-lost was **0.02** (2% of damage dealt to it, converted to energy)
  historically, briefly changed to **0.5** (matching the attacker-side `ENERGY_PER_DAMAGE_TAKEN`
  constant this engine already uses) around 2024-09-07.
- Separately, raid bosses previously had a **50% chance per opportunity** to fire a charged move
  once energy-ready (a "coin flip"); the 2024-09-07 change made it **fire every time** it's ready.
- The combination caused raid bosses to "spam charged moves like fast moves," widely reported as a
  live-game problem by players.
- **Niantic's own response, dated 2024-09-12** (its X/Twitter account, @NianticHelp — I could not
  fetch the tweet directly, HTTP 402 from this environment, so relying on the quoted text as
  reported by Dexerto/Sportskeeda): *"Trainers, in response to increased difficulty of Raid Battles
  we have reduced the rate at which Raid Bosses release charged attacks. Note that there may be
  more changes later in order to balance the difficulty of Raid Battles."* This is the one piece of
  this whole thread that's genuinely first-party (official Niantic support account), though I
  only have it as a quoted secondary re-report, not a direct fetch of the original post.
- **The reverted/current settled numbers are NOT documented anywhere I could find.** Niantic's
  statement says "reduced the rate," not a number, and no source I could reach states what the
  energy-per-HP-lost or fire-probability settled to afterward, or whether either has changed again
  since 2024. This is nearly two years stale (today is 2026-09-08) — treat any specific numeric
  value here (0.02, 0.5, 50%) as **historical**, not necessarily what's live today. **Do not use
  0.02/0.5/50% as sourced current constants; they're the shape of the mechanism, not today's dial.**

## Answering the four questions directly

**1. Documented attack pattern.** A boss interleaves its own fast moves between charged moves,
gaining energy from them the same way a player Pokémon does (this part is already correctly
modeled in `bossChargedMoveReadySeconds`). It *also* gains energy from damage taken — a real,
sourced (if imprecisely-dated) mechanic this engine's boss side doesn't model at all. No source
found describes a fixed post-charged-move lockout beyond the move's own stated duration (consistent
with this project's existing `fact_no_post_charged_move_lockout.md`, community-consensus, not
confirmed). The boss's first charged move does have a real "warmup" in the sense that it starts at
0 energy — `bossChargedMoveReadySeconds` already models the fast-move-only lower bound for this
correctly; the true real-game value is equal to or *shorter* than that bound once damage-taken
energy is folded in (attackers dealing damage early speeds up the boss's own first charged move,
same mechanism as the ongoing cadence).

**2. The true minimum interval, and a direct verdict on the chosen floor.** No source states a
flat inter-charged-move floor number (e.g. "~1.5–2s") as the user's prompt hypothesized — the "1
second minimum" that surfaced in a cooldown-chart search result is about the shortest *charged move
duration in the game*, not an additional gap layered on top of any move's own duration; it's a
different concept and doesn't apply here.

Given the two-energy-source mechanism above, **`durationSeconds` alone (the choice already made in
`boundedJitteredChargedMoveInterval`) is the defensible physical floor — and padding it with
"duration + one boss fast-move cycle" would actually move it further from the true minimum, not
closer.** Reasoning: if the boss also gains energy from damage taken, a sufcuffiently hard-hitting
attacker (or multi-trainer lobby) could complete the boss's *entire* post-cast energy requirement
via damage-taken energy alone, within the time the previous charged move's cast animation is still
playing — making the true hard minimum gap approach `durationSeconds` in the limit, with no
guaranteed extra fast-move cycle required at all. A "duration + 1 fast move" floor would be a
*plausible typical case*, not a true floor — and inventing that additional padding as a hard
constant would itself be exactly the kind of fabricated number this project has already been burned
by. **Recommendation: keep the floor at `durationSeconds` alone; do not add fast-move-cycle
padding.** This is consistent with the code comment already in `simulate.ts` reasoning about why it
chose `durationSeconds` alone — that reasoning holds up against this research, it isn't just
asserted.

**3. Is "mean interval + jitter" the right model shape?** No — it's a **known, already-disclosed
simplification** of an energy-accumulation process, not a mechanically faithful model. Real cadence
should, if modeled exactly, depend on (a) the boss's own fast-move energy rate — already available
per-move in this engine's data — and (b) cumulative damage dealt to the boss by whoever's attacking
it, which is *exactly* the team-DPS quantity this project's whole thesis already centers on. That
second dependency is not present anywhere in `simulate.ts` today (the boss's cadence is drawn
independent of how hard the attacker is hitting it). This is worth stating plainly: **a boss facing
a higher-DPS attacker would, in the real game, throw its charged moves faster, not just take more
damage per fast-move exchange** — an interaction this engine currently doesn't capture at all. The
mean+jitter shape is a reasonable statistical stand-in for "however the real distribution nets out,"
but it should be documented as an intentional simplification (partially already is, via the module
comment's honesty about jitter and jitter-vs-clamp interaction) rather than implied to be a faithful
mechanic. See "Proposal" below.

**4. Dodge timing interaction — three constants directly corroborated.** Fetched
`pokemongohub.net`'s "Close Calls: Dodging Mechanics in Pokémon GO" article directly (not just a
search snippet) and cross-checked against a WebSearch aggregate pulling GamePress/Fev
Games/pkmngotrading — all three of this project's existing dodge constants check out:
- `DODGE_DAMAGE_MULTIPLIER = 0.25` — corroborated ("successfully dodging an attack negates 75% of
  the damage," i.e. 25% remains). [community-consensus], multiple independent community wikis agree.
- `DODGE_COST_SECONDS = 0.5` — corroborated ("dodging itself has a cooldown of 500ms"). Same tier.
- `DODGE_WINDOW_SECONDS = 0.7` — corroborated ("a yellow flash... means you have 700ms to dodge").
  Same tier. Note this project's own comment on this constant already says it's consumed only as
  prose justification, never computationally — this research doesn't change that; it just confirms
  the number quoted in that prose is right.

One new, mildly interesting wrinkle for this constant specifically: the same GamePress-sourced
chart (referenced, not directly fetched) apparently documents **per-move windup delays before the
dodge flash appears** — e.g. Flamethrower ~1.0s, Groudon's Earthquake ~1.3s, Solar Beam ~2.3s, Fire
Blast ~2.9s — meaning the "flash-to-dodge" telegraph varies by move rather than being a flat 0.7s
across the board. `breakpoints.ts`'s comment on `DODGE_WINDOW_SECONDS` currently states "data
pogoapi.net doesn't expose at all" for per-move windup timing — that's still true of pogoapi
specifically, but a *community-compiled* chart of these per-move numbers apparently exists
(referenced by the Hub article, not independently verified by me here). Flagging as a finding, not
re-opening the existing modeling decision — `perfectlyDodgeable`'s current hand-set-only status
already covers this gap pragmatically, and building a per-move windup table would be new scope, not
something this pass is resourced to chase down and verify.

Does a dodged charged move still occupy the same cast duration? Yes — nothing found suggests
dodging shortens or otherwise alters the boss's own move duration; it only reduces the damage that
lands. Consistent with `simulate.ts`'s existing model (dodge changes `dodgeMultiplier`, not the
move's timing).

## Recommendation for the user's immediate decision

Keep `boundedJitteredChargedMoveInterval`'s floor at `durationSeconds` alone. It is not just
"the minimal defensible choice absent better data" (as the existing code comment frames it) — this
research found a real, if loosely-dated, mechanism (boss energy from damage taken) that makes
`durationSeconds` alone the *more* correct choice than any padded alternative, because a padded
floor would silently assume away a real path by which the boss can recharge faster than fast-moves
alone would allow. Do not add a flat "duration + 1 fast-move-cycle" or "duration + 1.5–2s" padding
constant — it would be exactly the kind of unsourced load-bearing number this project has already
been burned by, and the sourced mechanism actually argues against padding, not for a different
padding number.

## Proposal (separate from the sourcing question, since the user only asked to be routed a
## recommendation, not asked for new engine scope)

See PROPOSALS in the researcher's reply for a boss-cadence-scales-with-attacker-damage idea (item
2 below) — flagged here only as the "if you ever want to model this more faithfully" pointer, not
as something to build now.
