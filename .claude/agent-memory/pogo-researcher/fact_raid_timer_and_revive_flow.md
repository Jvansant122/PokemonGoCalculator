---
name: fact-raid-timer-and-revive-flow
description: confirms 180s (tier 1-4) / 300s (tier 5/mega/primal/shadow) battle timers, 2-min lobby countdown (10s after all-Ready), and that the real full-wipe rejoin has NO forced wait — the main timer keeps ticking during manual healing, validating the engine's existing honest zero-default for reviveCostSeconds/swapCostSeconds
metadata:
  type: project
---

[community-consensus, Bulbapedia direct-fetch corroborated], researched
2026-09-09.

**Battle timer lengths**, confirmed by direct fetch of Bulbapedia's "Raid Battle
(GO)" page plus WebSearch corroboration: **180 seconds** for Tier 1-4 raids,
**300 seconds** for Tier 5/Mega/Primal raids. Shadow raids also confirmed at 300s
(separate WebSearch source). Elite raids: capped at 20,000 HP (already recorded,
see [[fact_elite_raid_tier_gap]]) but no source found stating its timer explicitly
— reasoned as very likely 300s given it's Tier-5-equivalent difficulty, but this is
an inference, not a confirmed number; flagging rather than asserting it.

**Lobby countdown:** 2 minutes before battle start, reducible to 10 seconds if
every present trainer taps Ready. Confirmed via Bulbapedia direct fetch.

**Full-roster-faint flow, the part that matters for `reviveCostSeconds`:** per
Bulbapedia and a WebSearch-sourced Q&A page, a trainer whose whole 6-slot team
faints is dropped back to the raid lobby, must manually heal (Potions/Revives from
their Bag) and re-select 6 Pokémon, and **the raid's main timer keeps counting down
the entire time** — there is no forced/fixed wait imposed by the game itself. No
new Raid Pass or lobby countdown is required to rejoin; a trainer can re-enter as
many times as they like before the timer expires. The real "cost" of a wipe is
therefore purely however fast the human plays — healing taps, re-selection,
re-entry — not a Niantic-set constant.

**This directly validates, rather than corrects, the engine's existing design.**
`teamRaid.ts`'s doc comments already state "No official fixed value exists —
defaults to 0" for both `reviveCostSeconds` and `swapCostSeconds`, citing a
community ~12-15s estimate (Pokémon GO Hub, "Tips for short-manning raids") as a
UI-facing preset only, not a hardcoded truth. This research pass found nothing
that contradicts that honesty — if anything it strengthens the case that these
should stay user-adjustable knobs, since the real number is a human-speed variable,
not a game constant.

**Single-Pokémon mid-raid faint (not full wipe):** the game auto-swaps to the next
party slot after "a brief delay," per community WebSearch summary — no source
found anywhere quantifies that delay in seconds. Matches the engine's own
`swapCostSeconds` default of 0 (fastest-possible play) as the honest baseline;
there's still no sourced non-zero number to replace it with.

**One adjacent finding, out of scope for this engine but recorded so it isn't
"discovered" as a bug later:** a separate raid format called **Unity Raids**
(dataminded pre-launch, debuted GO Fest 2026: Global with Mega Mewtwo X/Y as the
first bosses) auto-revives a trainer's fainted team after a short period instead of
requiring manual healing — the opposite of the standard flow described above. This
is a distinct raid mode, not a retuning of standard raids; standard raids (which
this engine models) still work as described. Same category as Max Battles
([[fact_max_battles_separate_system]]) — structurally a different battle system,
not an approximation target. **Deepened 2026-09-09 (round 2): see
[[fact_unity_raid_distinct_system]] for the full picture and the explicit
exclude-don't-approximate recommendation** — auto-revive turns out to be only one
of three divergences (also a crowd-charged "Unity Attack" requiring trainers to
physically raise their phones together, and a "thousands of trainers, cannot
flee" lobby scale), which is why a `reviveCostSeconds≈0` knob on the standard
model would NOT correctly represent it.
