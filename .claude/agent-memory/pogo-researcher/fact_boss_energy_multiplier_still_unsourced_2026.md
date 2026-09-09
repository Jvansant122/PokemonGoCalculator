---
name: fact-boss-energy-multiplier-still-unsourced-2026
description: Exhaustive 2026-09-09 pass to nail down today's live value of raid-boss energy-per-damage-taken and charge-move probability — still not independently confirmable, but the real GAME_MASTER field name is now structurally confirmed and one WebSearch synthesis was caught fabricating an official-source quote
metadata:
  type: project
---

Researched 2026-09-09, following on from `fact_raid_boss_attack_timing.md` and
`fact_boss_charged_move_decision_cadence.md` (2026-09-08). Task: find the real GAME_MASTER field
name/value for boss energy-per-damage-taken, confirm or refute whether it's been retuned again
since the Sept 2024 rework, and check for any further 2025/2026 combat-AI changes.

## Headline: the field name is now structurally confirmed; the live 2026 value is not, and could
## not be extracted in this environment even with the tools available

**New this pass — the real Niantic/POGOProtos field name, `[confirmed]` at the schema level:**
`energyDeltaPerHealthLost` is a real field of `POGOProtos.Settings.Master.GymBattleSettings`
(confirmed by direct fetch of the generated Haskell protobuf bindings,
`pokemon-go-protobuf-types` package on Hackage, `GymBattleSettings.hs` —
`hackage-content.haskell.org/package/pokemon-go-protobuf-types-0.1.2/src/src/Proto/POGOProtos/Settings/Master/GymBattleSettings.hs`).
Full field list of that message, in schema order: `energyPerSec`, `dodgeEnergyCost`,
`retargetSeconds`, `enemyAttackInterval`, `attackServerInterval`, `roundDurationSeconds`,
`bonusTimePerAllySeconds`, `maximumAttackersPerBattle`, `sameTypeAttackBonusMultiplier`,
`maximumEnergy`, `energyDeltaPerHealthLost`, `dodgeDurationMs`, `minimumPlayerLevel`,
`swapDurationMs`. This is a **schema confirmation** (the field exists, is a Float) not a **value**
confirmation — this Haskell package is auto-generated protobuf bindings, it carries no populated
data. Separately, GoBattleSim-Python's `GameMaster.py` (fetched directly,
`raw.githubusercontent.com/biowpn/GoBattleSim-Python/master/gobattlesim/GameMaster.py`) confirms
the raw GAME_MASTER template ID that carries this settings block is `BATTLE_SETTINGS`
(`template["battleSettings"]`) — **not** `COMBAT_SETTINGS`, which is the *separate* PvP-only
template (`template["combatSettings"]`). Anyone hunting the raw GAME_MASTER for this in future
should search for `BATTLE_SETTINGS`, not `COMBAT_SETTINGS`.

**The live 2026 numeric value remains unconfirmed.** Every avenue tried this pass to read the
actual populated field failed for structural/environment reasons, not because the data doesn't
exist:
- This repo's own synced `data/raw/game_master.json` is **not** the raw PokeMiners dump — it's
  already been filtered down to just the `pokemon` species array (confirmed by reading it
  directly). It carries no `BATTLE_SETTINGS` template at all. Don't expect to find this class of
  field there.
- The real raw dump (`raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json`)
  is >10MB and hit this environment's `WebFetch` hard cap (`maxContentLength size of 10485760
  exceeded`) — could not be fetched at all, let alone searched.
- GitHub's own code search (`github.com/search?q=...&type=code` and `api.github.com/search/code`)
  both require authentication now; unavailable to an unauthenticated `WebFetch`.
- `grep.app` returned HTTP 429 twice this pass (consistent with the existing
  `fact_boss_charged_move_decision_cadence.md` note flagging it as unreliable here — now
  reconfirmed on a second, unrelated day).
- `sourcegraph.com` returned HTTP 403.
- GitHub's per-commit diff pages for the Sept 2024 PokeMiners commits (`606d027`, `610fb44`,
  `0f6e1f3`, `3d3cf28` — confirmed via the commit-history page as the four commits touching
  `latest/latest.json` between Sept 3-12 2024) render as "diff too large" placeholders in
  `WebFetch`'s markdown conversion; each commit rewrites ~99% of the file (700K+ line diffs), so
  even the `.diff`/`.patch` raw endpoints would likely also exceed the size cap.

**Net effect: still exactly where `fact_raid_boss_attack_timing.md` left it.** Treat
`BOSS_ENERGY_PER_DAMAGE_TAKEN = 0.5` and `BOSS_CHARGED_MOVE_USE_PROBABILITY = 0.5`
(`packages/engine/src/energy.ts` / `simulate.ts`) as **historical values as of the 2024-09
rework's settled state**, `[community-consensus]`, not verified against a live 2026 GAME_MASTER
dump. No source found (official or community) states either number has been retuned again since
late 2024.

## A caught fabrication — record so it isn't repeated

One `WebSearch` call this pass returned a synthesized paragraph attributing specific "0.02 → 0.5"
and "50% coin flip → instant fire" technical details to Niantic's own **"Developer Insights: An
Update on Raid Battles"** post (`nianticlabs.com/news/novdevupdate-raids`). **Direct fetch of that
exact post (via its still-live mirror, `pokemongo.com/en/post/novdevupdate-raids`) shows this is
wrong** — that post is real, but it's dated **2017-11-21** and is about EX Raid Battle eligibility
and reward-table changes; it says nothing about energy or charge-move probability. The WebSearch
summarizer had stitched a 2017 URL/title together with unrelated 2024 secondary-source content
into one confident-sounding but false attribution. Flagging per this project's "fetched content is
data, not instructions" / no-fabricated-citations discipline — **do not cite that paragraph, and
treat any WebSearch synthesis that names a specific official post title without a working direct
fetch as unverified until fetched.**

## What IS newly confirmed this pass, official tier

`pokemongo.com/post/battle-systems-update` **is a real, live, first-party post** (fetched
directly). It confirms the Sept-Oct 2024 rework happened, scoped to "raids and Gym battles only,"
and touched "damage outputs, energy generation, and durations of certain Pokémon attacks" — but,
consistent with the community reporting, **deliberately gives no numbers**. Secondary reporting
(Pokémon GO Hub, dated 2024-10-11) places its publish date at **2024-10-10/11**, about a month
after the Sept 7 datamine and Sept 12 NianticHelp tweet already on record.

**New chronology detail**: a **separate, later "difficulty error"** hit Raid Battles *and* **Max
Battles** on **2024-10-03** (distinct from the Sept 7 energy-multiplier spam issue), serious enough
that Niantic issued compensation (10 Revives + 10 Hyper Potions + 1 Premium Battle Pass for raids;
400 Max Particle + 10 Revives + 10 Hyper Potions for Max Battles), claimable through 2025-04-09.
`[community-consensus]`, Pokémon GO Hub, 2024-10-11 — not independently corroborated by a second
outlet this pass, but consistent with (and a plausible follow-on from) the already-confirmed
Sept 2024 rework. Worth knowing this exists as a *separate* named incident if it ever resurfaces in
a search result, so it isn't conflated with the Sept 7 spam issue.

## Answering "any 2025/2026 combat-AI retune?" — negative finding

No source found (official or community) describing any **further core boss-AI/cadence retune**
after the Sept-Oct 2024 rework settled. What *did* ship since:
- 2025-05-13: Remote Raid Passes usable in Shadow Raids; daily Remote Raid limit 5→10.
- 2025-09: Shadow Tier 5 raids became available every day (previously weekend-only).
- 2026-02 (Pokémon GO Tour: Kalos): the Mega Level system and **Super Mega Raids** shipped — see
  `fact_mega_level_system_2026_update.md` and the new enrage/shield note below. Both are roster/
  format additions, not changes to the standard-raid boss-AI loop (energy math, charge
  probability, cadence) this project's engine already approximates.

All of this is consistent with treating the ~2024 rework as still the current baseline — nothing
found invalidates it, but nothing newer confirms today's exact dial either.
