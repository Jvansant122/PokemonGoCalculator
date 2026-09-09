---
name: fact-friendship-raid-scope-nuance
description: two distinct friendship mechanics exist (PvP-only attack-bonus multiplier vs. broader Best Buddy CP Boost) — don't conflate them when deciding whether damage.ts's bestBuddy flag should extend to raids
metadata:
  type: project
---

**SUPERSEDED 2026-09-09 — see [[fact_friendship_raid_attack_bonus_correction]].**
This entry's conclusion ("the friendship attack multiplier is PvP-only, raids
excluded") turned out to be backwards. A 2026-09-09 pass found Bulbapedia,
pokeranks.com, and Pokébattler's own raid-testing research all agreeing the
bonus is **raid/gym-only**, not PvP. Left below unedited as the historical
record of how the earlier (wrong) conclusion was reached; do not treat the
body text below as current.

[community-consensus], researched 2026-09-05. `damage.ts` has a comment: "Best-friend
attack bonus (trainer battles only; raids/gyms do not apply this)" backing
`FRIENDSHIP_BEST_BUDDY_MULTIPLIER = 1.1`. A WebSearch this pass surfaced results implying
Best Buddy status DOES boost raid/gym performance via a "CP Boost" — this looked like a
contradiction at first read, but it's actually two separate mechanics:

1. **Best Buddy CP Boost** — a small stat/CP increase active whenever that Pokémon is
   your current buddy, applies broadly (raids, gyms, Team GO Rocket, trainer battles).
2. **Friendship attack-bonus multiplier** (Good/Great/Ultra/Best Friend → escalating attack
   multiplier, topping out at Best Friend) — the specific damage-formula bonus
   `damage.ts`'s `bestBuddy` flag models — is the one that's PvP-trainer-battle-only per
   longstanding community consensus (Silph Road/GamePress-tier sourcing, not re-verified
   with a fresh fetch this pass).

Did not find a source clean enough to confidently say mechanic #2 also applies in raids —
so the existing code comment/design (bestBuddy multiplier excluded from raid modeling)
still stands unchallenged. **No proposal was made to wire bestBuddy into raids** — this
memory exists so a future pass doesn't re-open this as if it were an obvious gap, and so
a future pass knows the search-result contradiction was investigated and resolved as "two
different mechanics," not "code comment is wrong."

**How to apply:** If revisiting this, look specifically for a Niantic/Silph Road source
that disambiguates "CP Boost" from "friendship attack multiplier" before changing
anything — don't take a surface-level "yes it applies to raids" search result at face
value without checking which of the two mechanics it's describing.
