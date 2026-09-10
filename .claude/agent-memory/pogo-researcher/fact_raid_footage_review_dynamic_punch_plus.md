---
name: fact-raid-footage-review-dynamic-punch-plus
description: User's own 12-frame raid clip (zMewtwoX vs Mega Houndoom) reviewed for non-timing content 2026-09-10 - closes off "can footage give a Dynamic Punch+ number" as no, and records what the HUD actually shows
metadata:
  type: project
---

Reviewed 2026-09-10, a 12-frame (~0.83s/frame) clip the user filmed of their own device (phone +
monitor stopwatch), separate from the swap-cost timing analysis already in MECHANICS.md. Full
findings handed back in-conversation; only the durable, reusable facts are kept here. Related:
[[fact-super-max-plus-move-mechanics-detail]].

## The headline negative result — record this before anyone re-asks

**Standard Pokemon GO client footage cannot supply a numeric damage/power reading for any move,
Dynamic Punch+ included.** The live UI shows only "SUPER EFFECTIVE!"/"NOT VERY EFFECTIVE" text and
HP-bar depletion — never a damage number. It also shows **no Mega Level tier badge** anywhere
on-screen during combat (Base/High/Max/Super Max is not displayed), so even a successful
back-calculation from HP-bar width couldn't be pinned to a known tier. Back-calculating from
bar-width pixels on a camera-of-a-monitor photo, against an uncertain total-HP-per-tier and
uncertain boss DEF/CPM, would compound too many unknowns to be reliable — declined rather than
guessed. **Future asks to "read a move's power off gameplay footage" should expect this same
negative result** unless Niantic ever adds a damage-number overlay.

## What the footage DID corroborate (all [observed], moderate-to-high confidence given camera blur)

- Dynamic Punch+ fired repeatedly in a ~7.5s window (the "SUPER EFFECTIVE!" callout persisted/
  re-triggered across f_01-f_09) while the dimmed "PSYCHIC" button (Not Very Effective vs Dark)
  never highlighted — internally consistent with MECHANICS.md's `DYNAMIC_PUNCH` 2500ms duration
  assumption (~3 uses in 7.5s), a nice real-world corroboration though not a rigorous timing proof.
- Two small circular badges appear next to both nameplates (attacker and boss), colored
  pink+red-orange for zMewtwoX (Psychic/Fighting) and black+orange for Mega Houndoom (Dark/Fire).
  Colors line up with each Pokemon's real dual-typing. Read as **type-icon badges**, moderate
  confidence (too small/blurry to see the actual glyphs) — confirms nothing new, just that the
  client agrees with the type pairs this engine already uses.
- The boss HP bar behaves as one continuous pool with no visible notches/segments/discrete phase
  boundaries at any point from ~55% down to ~15% observed — corroborates
  [[fact-no-normal-raid-hp-threshold-ai]] (no HP-threshold AI on an ordinary, non-Shadow,
  non-Super-Mega raid boss). A colored outline/flash around the bar appears to be a transient
  "just took a hit" indicator, brightest right after a hit and fading before the next, not a fixed
  HP-position marker — i.e., not evidence of a hidden phase system.
- "MEGA HOUNDOOM USED CRUNCH! DODGED!" stayed on-screen essentially unchanged across most of the
  clip. Read as the callout being sticky/static until the boss's next charged move overwrites it,
  not a fresh per-frame event — a caution for future footage reviews: don't treat a persisting
  callout as proof of repeated events without other evidence.
- A large HP-bar drop is visible right around the Mewtwo-faint-to-Keldeo-swap boundary (f_11-f_12).
  Consistent with (not new evidence beyond) the already-recorded swap-cost mechanic where the
  incoming Pokemon's damage lands before it's fully rendered — not re-litigated in depth per the
  task's explicit instruction to skip timing.

## No contradiction found

Nothing in the frames contradicted anything currently in MECHANICS.md (dodge multiplier/duration,
swap cost, type effectiveness, Dynamic Punch+'s SE-vs-Dark typing, no HP-phase AI). Reported as a
clean, disciplined "nothing to change" outcome — worth recording so this specific clip isn't
mis-remembered later as having settled the Dynamic Punch+ power question. It did not.
