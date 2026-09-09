---
name: fact-dodge-dec2024-window-fix
description: Two distinct, dated post-Sept-2024 dodge events — a Nov/Dec 2024 dodge-stacking exploit and its patch, and a separate Dec 16 2024 "dodge window fixed" reliability change; dodging charged attacks only remains current advice
metadata:
  type: project
---

Researched 2026-09-09, overnight dodging deep-dive (answers Q3 and Q4).

## Two separate, dated events — don't conflate them

**1. A dodge-stacking exploit, live sometime after the Sept 2024 rework, patched ~Nov 2024,
reported 2024-12-09 (Dexerto, "Pokemon Fans roast Niantic for fixing actually helpful dodging
glitch," fetched directly).** Players could throw multiple dodges within a short window and each
one's reduction stacked multiplicatively — one player-reported example: three dodges on a super-
effective hit brought damage to "essentially no damage." Reported as discovered via r/TheSilphRoad
and confirmed patched by Niantic before the article's publish date. This is a **bug that got
fixed**, not a mechanic to model — the engine already applies exactly one `DODGE_DAMAGE_MULTIPLIER`
per dodge attempt (`simulate.ts`), so it never had this bug to begin with.

**2. A separate "dodging finally fixed" reliability change, dated 2024-12-16 (Pokémon GO Hub,
fetched directly).** Describes the *practical* dodge window as now spanning "any time between the
text notification that the boss is using an attack and the actual damage window occurring...
across all moves and bosses," explicitly contrasted with an earlier, narrower/unreliable window.
Caveat in the same article: "some attacks remain hard to dodge, because they deal damage quite
quickly, and the damage dealing window is quite short" — so per-move variation in effective
dodgeability still exists post-fix, it's just no longer as unreliable/inconsistent as it was
immediately post-Sept-2024. No specific replacement numbers given (no new flat-window-seconds
value) — so this doesn't give a number to swap in for `DODGE_WINDOW_SECONDS`, just narrative
confirmation that "the window is roughly the whole windup," which is qualitatively consistent
with the per-move damage-window-start values in [[fact_damage_window_fields_and_2024_decoupling]]
being wider than a flat 0.7s tail for slow-cast moves.

## Q3: the 0.5s dodge cost is a fixed engine constant, not an animation-length coincidence

`dodgeDurationMs: 500` sits in a global `PvEBattleSettings`/`COMBAT_SETTINGS` block (see
[[fact_dodge_gamemaster_field_confirmed]]), not per-species or per-move — and pokemongohub.net's
2019 article independently describes it as "a cooldown of 500ms," i.e. a fixed tax on the
attacker's own timeline for the *act* of dodging, regardless of what move is being dodged or by
whom. No source found describes any additional lockout beyond this — consistent with the
already-recorded [[fact_no_post_charged_move_lockout]] (a different but related question, about
charged-move cooldown rather than dodge cooldown specifically; both land on "the stated duration
is the whole window, no hidden extra tax").

## Q4: does dodging still work, and is "charged moves only" still the right call in 2026?

**[community-consensus].** Every 2024+ source found (the Dec 2024 fix article, the Sept 2024
rework article, general raid-guide search results) treats dodging charged attacks as a live,
worthwhile, standard tactic post-fix — no source found argues dodging stopped being worth doing.
Fast-attack dodging is still not separately recommended anywhere found; this matches the engine's
existing `dodgeFastAttacks` being a distinct, off-by-default boolean from `dodge` (charged-only)
in `simulate.ts`/`breakpoints.ts`, whose own doc comment already states the "0.5s cost rarely
worth it for fast attacks" reasoning. No source found changes that verdict for 2026. I did not
find a dedicated recent (2025/2026) community writeup re-litigating "is dodging worth it" from
scratch — the 2024-12-16 fix article is the most recent dodge-specific piece found, and nothing
post-dates it disputing its "reliable and easy" framing.

## Engine status

No change indicated for `DODGE_DAMAGE_MULTIPLIER`, `DODGE_COST_SECONDS`, or the
charged-only/fast-attack-separate `DodgeBehavior` split — all already correctly shaped per this
research. The dodge-stacking exploit needs no engine counterpart (it was a bug, now patched, never
present in this engine's model). The Dec 2024 window-widening has no numeric engine consequence
since `DODGE_WINDOW_SECONDS` was already prose-only.
