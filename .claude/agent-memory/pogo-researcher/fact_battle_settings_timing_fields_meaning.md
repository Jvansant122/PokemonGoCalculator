---
name: fact-battle-settings-timing-fields-meaning
description: Semantics (not just schema/values) for enemyAttackInterval, retargetSeconds, and swapDurationMs from BATTLE_SETTINGS — answers Q2/Q3 of the 2026-09-09 round-3 pass; enemyAttackInterval has real, if circumstantial, corroboration, the other two remain largely unconfirmed
metadata:
  type: project
---

Researched 2026-09-09, round 3 overnight pass (answers Q2 and Q3). Builds on
[[fact_boss_energy_multiplier_still_unsourced_2026]], which schema-confirmed the field list of
`GymBattleSettings`/`BATTLE_SETTINGS` (`energyPerSec`, `dodgeEnergyCost`, `retargetSeconds`,
`enemyAttackInterval`, `attackServerInterval`, `roundDurationSeconds`, `bonusTimePerAllySeconds`,
`maximumAttackersPerBattle`, `sameTypeAttackBonusMultiplier`, `maximumEnergy`,
`energyDeltaPerHealthLost`, `dodgeDurationMs`, `minimumPlayerLevel`, `swapDurationMs`) without
resolving what any of the less-obvious ones actually govern. This pass chased meaning, not
existence.

## The message type name is a real, structural clue, worth stating plainly

All of these fields live in a protobuf message literally named `GymBattleSettings`, not something
raid-neutral. That strongly suggests (my own inference, not a stated source) this settings block
originates from the pre-Raid (2016-launch) Gym combat system and was reused wholesale when Raid
Battles launched in July 2017, rather than raids getting their own purpose-built settings message.
This is consistent with — and gives a plausible mechanism for — Bulbapedia's own explicit
statement (see below) that one specific behavior in this block applies to "both Gym and Raid
Battles."

## Q2: `enemyAttackInterval: 1.5` — real, if circumstantial, corroboration it's the low end of a
## documented boss/defender inter-attack pause, not a retarget/AI-polling tick

**Direct fetch, Bulbapedia's `Gym (GO)` raw wikitext**, 2026-09-09 — quoted verbatim (not a
WebFetch summary I should distrust; corroborated internally by other facts in the same list
that are already independently sourced elsewhere, e.g. the 0.7s dodge flash and the 50%
charged-move chance):

> "In both Gym and Raid Battles, the AI Pokémon behaves in the following pattern:
> * Does not dodge attacks
> * Pauses for 1.5 to 2.5 seconds between attacks
> * Has a 50% chance of casting a Charged Attack, given enough energy
> ** If a defender knows two Charged Attacks and has enough energy for both, it will randomly cast
>    either one"

No footnote/reference is attached to this list on Bulbapedia itself — it's presented as
established, untagged community knowledge, not hedged as "reportedly."

**Separately**, a WebSearch synthesis of a now-404/redirected GamePress Q&A page ("Attack rate of
defending pokemon," `gamepress.gg/pokemongo/q-a/attack-rate-defending-pokemon` — confirmed dead,
301s to `pokebase.app` which does not carry the content either, consistent with the existing
`fact_boss_charged_move_decision_cadence.md` note flagging this same GamePress-domain migration
killing an unrelated article) states: "Defenders get a delay of two seconds, on average (it is a
uniform distribution between 1.5 and 2.5 seconds) outside of... the second attack." This is
**weak tier** on its own — a search engine's cached-snapshot synthesis of a page I could not fetch
directly — but the range (1.5–2.5s, low end 1.5) is an **exact numeric match** to Bulbapedia's
directly-quoted range, from what appears to be an independently-worded source (different phrasing,
same two numbers). Two sources converging on the identical low bound that also exactly matches
`enemyAttackInterval`'s live value is a real signal, not coincidence — treat this as
`[community-consensus]`, moderately corroborated (Bulbapedia direct quote is the load-bearing
half; the GamePress echo adds weight but not tier).

**INFERRED reading (mine, not stated by either source): `enemyAttackInterval` is the base/minimum
value of a randomized post-move pause the boss/defender takes between completing one attack and
initiating its next — additional to, not inclusive of, that move's own `durationMs` animation.**
Neither source explicitly ties the raw field name to the described behavior; I'm connecting a
schema-confirmed number to a described mechanic via numeric coincidence, not a citation that
names the field. Bulbapedia's phrasing ("between attacks," not "between fast attacks") reads as
covering all AI attacks generically, not fast-moves only — but I could not confirm whether this
pause is empirically visible on charged-move-to-charged-move transitions given many charged moves
already run longer than 2.5s on their own (Solar Beam 5.0s, Fire Blast 4.0s per
[[fact_damage_window_fields_and_2024_decoupling]]'s table) — so this pause may in practice mostly
express itself between fast moves, or between a fast move and the following charged move, without
a source that isolates which transitions it applies to.

**This creates a real, worth-flagging tension with an earlier recommendation.**
`fact_raid_boss_attack_timing.md` (2026-09-08) recommended keeping
`boundedJitteredChargedMoveInterval`'s floor at `durationSeconds` alone, explicitly arguing
*against* padding with any extra fixed gap, on the grounds that no source stated one and that
boss energy-from-damage-taken could theoretically close the whole gap during the previous move's
own animation. This pass's finding is the closest thing yet to a sourced extra-gap number
(1.5–2.5s, generically "between attacks") — it does not fully overturn that recommendation (the
energy-driven argument for why a *hard floor* shouldn't be padatted still holds: a sufficiently
fast attacker could still theoretically close the gap via damage-taken energy), but it is real
evidence that a *typical* (not minimum) real-game inter-attack gap is meaningfully wider than
`durationSeconds` alone in the common case. Recording this tension for whoever next touches boss
cadence modelling — do not silently resolve it either direction without re-reading both notes.

## Q3: `retargetSeconds: 0.5` and `swapDurationMs: 1000` — meaning still largely unconfirmed

**No source found this pass that names either field directly or explains its function.** What I
have is circumstantial:

- `swapDurationMs`'s presence in the same shared-with-gyms settings block, plus a WebSearch
  synthesis (no citable page found — I could not trace this claim to any single article I could
  fetch and quote, so treat as **weak, uncited**) describing manual Pokémon swaps as having "no
  penalty" but an auto-swap after a faint carrying "a brief revival screen pause" — is consistent
  with (but does not confirm) `swapDurationMs = 1000ms` being the length of that transition/pause,
  applying to a faint-triggered auto-swap. Whether the *same* 1000ms also applies to a
  manually-initiated swap (tapping a different party member mid-battle) or only the auto-swap case
  is **not established by anything I could source this pass** — the "no penalty" framing in the
  uncited claim could mean "no *extra* penalty beyond this same swap animation," or it could mean
  manual swaps genuinely skip it. Flag as open, don't presume either reading if this gets modelled.
  This directly bears on the Team Raid Simulator's `swapCostSeconds` knob (currently defaults to
  0) — a real 1.0s constant would be a defensible non-zero default *if* the auto-swap reading is
  right, but I cannot currently hand this back as a confirmed number, only as circumstantial
  support for "a real constant almost certainly exists here and it's plausibly 1.0s."
- `retargetSeconds: 0.5` has **no corroboration of any kind found this pass**, direct or
  circumstantial. My best (fully speculative, INFERRED, not worth treating as more than a guess)
  reading, given the field sits in a *Gym*BattleSettings block used for both single-target gym
  defense and raids: it could govern how quickly the AI's attack-animation visually reacquires a
  new target when the previously-targeted attacker faints/swaps out — a client-rendering detail
  more than a damage-affecting one. I found nothing that confirms this, and it is not
  distinguishable from several other plausible readings (a multiplayer-lobby AI decision-refresh
  tick, a UI-only camera/animation retarget). **Do not cite a specific meaning for
  `retargetSeconds` beyond "unknown, plausibly cosmetic/targeting-animation, not confirmed."**

## Engine status

No numeric constant in `packages/engine` currently derives from either field.
`Scenario`'s `swapCostSeconds`/`reviveCostSeconds` (Team Raid Simulator, per
`fact_raid_timer_and_revive_flow.md`) default to 0 by deliberate honest-design choice absent a
sourced number — this pass's finding is circumstantial support for a *plausible* non-zero
`swapDurationMs`-derived default (1.0s) if that gets revisited, but not sourced enough to change
the default unilaterally; hand back as "circumstantial lead, not a citation" if this is ever
acted on.
