---
name: fact-friendship-raid-attack-bonus-correction
description: CORRECTS fact_friendship_raid_scope_nuance — the trainer-friendship attack bonus (Good/Great/Ultra/Best/Forever Friend, 3/5/7/10/12%) applies to RAIDS AND GYMS, not PvP; engine's damage.ts comment has the scope backwards
metadata:
  type: project
---

[community-consensus, multi-source], researched 2026-09-09. **This corrects
[[fact_friendship_raid_scope_nuance]], which had the scope backwards** — flagging
loudly per the research brief rather than quietly re-asserting the old note.

The friendship-level attack bonus in Pokémon GO applies to **Gym and Raid Battles**,
not PvP Trainer Battles. Bulbapedia's "Friends (GO)" page (direct fetch, 2026-09-09)
states explicitly: **"Attack bonus for Gym / Raid Battles"** — with per-level values
Good Friend 3%, Great Friend 5%, Ultra Friend 7%, Best Friend 10%, Forever Friend 12%.
Corroborated independently by pokeranks.com's Friendship Level Bonuses guide (same
five numbers, explicit "these bonuses apply only to raids and gyms, not PvP trainer
battles") and by Pokébattler's original 2019 community research
(articles.pokebattler.com, "New Higher Friendship Bonus Research Results") which
tested the bonus specifically inside Tier 1/2 **raids** using a non-attacking friend
"simply providing the friend boost."

**Mechanic:** requires actually raiding in the same lobby as a friend on your
friend list; only the highest applicable friendship tier applies (bonuses don't
stack across multiple friends); applies to the player's own damage output, not a
team-wide multiplier like the mega boost.

**One numeric wrinkle, explicitly flagged rather than silently resolved:** the 2019
Pokébattler research article claimed Niantic had quietly *raised* Best Friend to 15%
and Ultra Friend to 11% at that time. Every current-dated source (Bulbapedia as
fetched today, pokeranks) states the **lower** values (10%/7%) instead, with no
source found confirming the 2019 change stuck or was reverted. Treat 3/5/7/10/12%
as the current, better-corroborated figures; the 15%/11% pair is an unresolved
historical claim, not to be used without further confirmation.

**Engine impact — this is where it matters:** `packages/engine/src/damage.ts` has
`FRIENDSHIP_BEST_BUDDY_MULTIPLIER = 1.1` (exactly the Best Friend 10% value) gated
by a `bestBuddy` flag, with the doc comment "Best-friend attack bonus (**trainer
battles only; raids/gyms do not apply this**)." That comment's scope claim is
backwards per every source found this pass. The field is also misleadingly *named*
`bestBuddy`, which collides with the unrelated Best Buddy CP Boost mechanic (see
[[fact_best_buddy_cp_boost_magnitude]]) — two genuinely different mechanics sharing
one ambiguous identifier in the code. Practically inert today: grepped and confirmed
(2026-09-05, re-confirmed 2026-09-09) that no call site ever passes `bestBuddy: true`
and `Scenario` has no field for it, so no shipped number is wrong — but the comment
itself is wrong and would mislead the next person who wires it up. This is a
documentation-accuracy finding for `engine-developer`, not a proposal to build
anything — handing back as-is.

**How to apply:** Don't cite the old scope note as settled; if `bestBuddy` is ever
wired into a real Scenario, it should be framed as "raiding with a friend" (an
raid/gym-only, other-trainer-presence mechanic, structurally similar to the mega
boost's other-trainer scope) — not as a PvP-only bonus, and probably renamed away
from `bestBuddy` to avoid the CP Boost collision.

---

**Round-2 deep dive, 2026-09-09 (same day, second pass).** Nailed the parts left
open above.

**Q1 — where in the formula, and stacking.** [confirmed via raw GAME_MASTER
datamines] The field is `attack_bonus_percentage` in a `FRIENDSHIP_LEVEL_N`
template — a direct multiplier, not an additive percentage. Confirmed via two
independently-dated decoded-dump sources: pokemongohub.net's "Game Master entries
for Friendship Levels 0 to 4 stars" (GM dump timestamped 2018-06-29:
`FRIENDSHIP_LEVEL_1..4` → `attack_bonus_percentage` 1.03/1.05/1.07/1.1) and
chewett.co.uk's PoGoAPI Friendship Level Settings API writeup (published
2020-12-26, same shape: `attack_bonus` 1.0/1.03/...). Both predate Forever Friend
(Dec 2025) so neither shows a `FRIENDSHIP_LEVEL_5` entry directly — see the Q2 note
below for that gap.
[community-consensus] For where it sits in the full formula: Bulbapedia's "Damage"
page (WebFetch, 2026-09-09) documents the complete Gym/Raid/Max-Battle modifier
chain as one product: `Type × STAB × Weather × Friendship × Dodged × Mega ×
Trainer × Charge × Party × Support × Spread × BehemothBlade × BehemothBash ×
Shield`, explicitly stating Weather/Friendship/Dodged/Mega are "1 otherwise"
outside Gym/Raid/Max Battles. **This is exactly this engine's `calculateDamage`
shape** (`packages/engine/src/damage.ts`): `stabMultiplier`, `weatherMultiplier`,
`friendshipMultiplier`, and `megaBoostMultiplier` are all separate terms
multiplied together inside one `raw` product before a single `Math.floor(...) + 1`
— i.e. the friendship bonus multiplies the **whole modifier chain alongside**
weather and mega, not the attacker's raw Attack stat in isolation and not applied
as a separate additive term to final damage. **Verdict: the engine's stacking
architecture is already correct** (multiplicative, one shared floor) — the only
gap is that `FRIENDSHIP_BEST_BUDDY_MULTIPLIER` hardcodes a single 1.1 value gated
by one boolean (`bestBuddy`) instead of a 5-tier ladder (1.03/1.05/1.07/1.1/1.12),
and per the correction above, its doc comment has the raid/PvP scope backwards.
Both are pre-existing findings, restated here because this pass confirms neither
is a stacking-order bug — it's a value-table and scope-comment gap only.

**Q2 — Forever Friend.** [community-consensus, Bulbapedia only for the exact %]
Real and current. Rollout confirmed via WebSearch corroboration (pokemongohub.net
"Forever Friends and Remote Trading now rolling out worldwide!" and LeekDuck) —
began 2025-12-08 in New Zealand, live across NA/JP/EU by 2025-12-11. Bonus is
**12%** per Bulbapedia's "Friends (GO)" page (direct fetch, 2026-09-09), listed
alongside the other four tiers in the same attack-bonus table (180 friendship
points to reach it). **Caveat, precisely scoped:** unlike tiers 0-4 (raw
GAME_MASTER field confirmed above), Forever Friend's 12% is sourced from
Bulbapedia's compiled table only — no raw post-2025-12 GAME_MASTER dump was found
this pass to directly confirm a `FRIENDSHIP_LEVEL_5`/`attack_bonus_percentage:
1.12` entry. Treat the existence and the 12% figure as solidly
community-consensus, not [confirmed] the way tiers 0-4 are.

**2019 Pokébattler 15%/11% claim — CLOSED OUT, resolved as not-persisting.**
Fetched the original article directly (articles.pokebattler.com, 2019-06-29): it
does claim Niantic had raised Best Friend 10%→15% and Ultra Friend 7%→11% (plus
hypothesized Great Friend 5%→8%, Good Friend 3%→5%), based on field-tested damage
breakpoints with a wide confidence interval (Ultra Friend measured as "9.7%-12.9%,"
which doesn't tightly pin either the old 7% or the claimed 11%). Decisive against
it persisting: chewett.co.uk's GAME_MASTER-sourced API writeup, dated **2020-12-26
— a year and a half after** the Pokébattler claim — shows the **original** lower
values (1.03/1.1, i.e. 3%/10%), and today's Bulbapedia fetch (2026-09-09) still
shows the original ladder (3/5/7/10%, plus 12% for the new Forever Friend tier).
**Conclusion: the 2019 claimed bump either never reflected the live game's real
GAME_MASTER values, was a mis-measurement from a wide-CI field test, or was
reverted quickly** — either way it did not persist past 2020 and does not reflect
the current game. Treat 3/5/7/10/12% as settled; do not re-investigate the
15%/11% claim again, this is closed.

**Q3 — does the friend need to be in the raid lobby with you?** [community-consensus,
multi-source corroborated] Yes. Bulbapedia: "Players who are friends deal bonus
damage if participating in the same Gym or Raid Battle." pokemongohub.net's
"Friendship Level Bonuses" guide (WebFetch, 2026-09-09), independently: "Only one
bonus can be active, they do not stack and the game will use the highest one
available" — confirming both co-presence-in-the-same-battle-instance AND
highest-tier-only (no stacking/averaging across multiple friends present). No
source explicitly states the solo-raid case, but it follows directly from the
`FRIENDSHIP_LEVEL_0` GAME_MASTER entry itself: `attack_bonus_percentage: 1` (no
bonus) — solo raiding is mechanically identical to raiding with a level-0
"friend," i.e. no bonus applies. This matches the engine's existing default
(`bestBuddy = false` → `NO_BONUS`).
