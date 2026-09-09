---
name: fact-critical-hits-and-stamina-loss-scalar
description: Q4/Q5 of the 2026-09-09 round-3 pass — criticalChance is real but not part of Pokémon GO's live PvE damage formula (2 independent direct-fetch confirmations), engine correctly omits it; staminaLossScalar's meaning could not be resolved by any source, and one WebSearch synthesis attributing it to gym motivation decay is flagged as almost certainly wrong
metadata:
  type: project
---

Researched 2026-09-09, round 3 overnight pass (answers Q4 and Q5).

## Q5: critical hits — field is real, but not live in raid/gym PvE damage. Engine is correct to
## omit it.

`criticalChance: 0.05` is a real, schema-confirmed field on `MoveSettings` (per-move, alongside
`accuracyChance`, `healScalar`, `staminaLossScalar`, `damageWindowStartMs/EndMs`, `energyDelta` —
full field order confirmed via the same Haskell protobuf-bindings source already used for
`GymBattleSettings`, this pass).

**Two independent, directly-fetched, current Pokémon GO Hub articles** give the canonical PvE
damage formula and **neither includes a critical-hit term**:

- "Damage Mechanics in Pokémon GO" (fetched 2026-09-09): `Floor(½ × Power × Atk/Def × STAB ×
  Effectiveness) + 1`
- "How is move damage actually calculated?" (fetched 2026-09-09, separate article, separate URL):
  `Floor(0.5 * Power * Atk/Def * STAB * Effective) + 1` — same formula, independently phrased.

Neither article mentions critical hits, `criticalChance`, or a crit multiplier anywhere — the
topic is simply absent from both, not explicitly denied. This is **absence-of-evidence across two
independently-authored current community reference pages describing the exact formula this
project's engine also implements**, which is about as strong a negative confirmation as a wiki
tier source can give without an explicit "Pokémon GO does not have critical hits" sentence (I did
not find that exact sentence stated anywhere, including on Bulbapedia — there is no
`Critical_hit_(GO)` Bulbapedia page at all, 404 confirmed). Tag: `[community-consensus]`, but a
strong, doubly-corroborated one — this matches long-standing general community understanding that
Pokémon GO has never implemented critical hits in raid/gym combat (distinct from the mainline
games), though I could not find a single official or wiki source stating this as an explicit,
citable fact rather than by omission from every formula reference found.

**`packages/engine/src/damage.ts` confirmed by direct read, 2026-09-09**: `calculateDamage`'s
formula (`floor(0.5 * power * atk/def * STAB * effectiveness * weather * friendship * megaBoost) +
1`) has no critical-hit term of any kind — matches the two community formulas exactly, modulo the
extra named modifiers (weather/friendship/mega) this engine adds on top, which are real, sourced
mechanics the simplified community write-ups don't bother restating. **This is correct, not a
gap** — do not propose adding a crit mechanic; the schema field existing with a populated 0.05
value does not mean it's consumed by the raid/gym battle engine.

## Q4: `staminaLossScalar` — genuinely unresolved. No source explains it. One WebSearch synthesis
## flagged as likely wrong.

Schema-confirmed field, sits in `MoveSettings` immediately after `healScalar` (field order:
`power`, `accuracyChance`, `criticalChance`, `healScalar`, `staminaLossScalar`,
`trainerLevelMin/Max`, `vfxName`, `durationMs`, `damageWindowStartMs/EndMs`, `energyDelta`).
Values given this pass (Flamethrower 0.09, Earthquake 0.1, Fire Blast 0.11, Brave Bird 0.04, Mud
Shot 0.01) are real per-move numbers, not disputed.

**No source found — official, wiki, or community forum — that explains what this field does.**
Specifically checked and came up empty:
- Bulbapedia, GamePress, Pokémon GO Hub: no article found discussing this field by name.
- A French community forum thread, `pogo-gamer.fr`, literally titled (translated) "What is the
  purpose of the 'stamina_loss_scalar' parameter for attacks?" — surfaced by search, but the
  domain is now dead (`getaddrinfo ENOTFOUND` on both `www.` and bare hostnames), so even the
  community's own attempt to answer this question is unreachable. Its mere existence is
  informative though: it confirms this was an open question for datamining communities too, not
  something with settled, forgotten-because-obvious community knowledge.
- One `WebSearch` call returned a synthesized claim that `staminaLossScalar` "controls how quickly
  a defending Pokémon's motivation (CP) decreases" in gym motivation decay. **I am flagging this
  as almost certainly wrong, not citing it.** Reasoning: gym motivation decay is a time-based
  function of a *defending Pokémon's CP*, computed independently of which moves are used against
  it (per `pokemongohub.net`'s own "How Defender Decay works" writeup, which the same search
  surfaced but which never actually mentions `staminaLossScalar` in its own text) — it is not a
  per-move quantity at all. `staminaLossScalar` living on `MoveSettings` (a per-attack template,
  populated on offense moves generally, not just ones with special secondary effects) doesn't fit
  a decay-rate role. This reads as the same "search-summarizer stitches two unrelated retrieved
  snippets into one confident-sounding but false claim" failure mode already caught and recorded
  in `fact_boss_energy_multiplier_still_unsourced_2026.md`'s "caught fabrication" section — same
  discipline applies, don't cite it, note it happened.

**My own weak, explicitly-labelled speculation (not sourced, offered only as a structural
observation):** its adjacency to `healScalar` in the schema (a field that plausibly governs
HP-restoring effects on moves that have them, e.g. draining attacks) hints these two fields might
be a paired mechanic for secondary move effects — but Pokémon GO's raid/gym combat has no
status-effect or drain-effect system that's ever been documented as live (unlike the mainline
games), and the field being populated on ordinary attacking moves like Flamethrower/Earthquake/Mud
Shot (which have no drain/heal effect in-game) undercuts that theory rather than supporting it.
**Net verdict: treat `staminaLossScalar` as unexplained, most plausibly vestigial/unused data in
the current raid/gym engine (same category as `criticalChance`, though even less evidenced either
way) — do not build a mechanic around it, and do not repeat the motivation-decay claim.**

## Engine status

`packages/engine` does not reference `staminaLossScalar` or `criticalChance` anywhere (confirmed
via direct read of `damage.ts`). No change indicated for either — this pass found no live
mechanic that either field should feed.
