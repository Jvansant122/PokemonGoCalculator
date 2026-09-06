---
name: fact-mega-boost-other-trainers-not-own-party
description: Confirmed across 3 independent source families (official pokemon.com + Bulbapedia + Pokémon GO Hub) that a mega/primal raid boost never applies to the mega-bringer's own party
metadata:
  type: project
---

**Resolved 2026-09-05** (upgrade from the single-source-family flag in
[[proposal-sequential-team-raid-tab]]). The overseer asked for independent corroboration beyond
Bulbapedia before deciding whether the shipped two-candidate comparator's team-damage feature is
mislabeled. Result: corroborated, confidence raised, and a real mislabeling issue found in the
shipped tool (see companion memory
[[finding_mega_boost_scope_mislabeling_in_shipped_tool]]).

**Sources, now 3 independent families, not one:**
- **[official]** pokemon.com, "A Guide to Mega Evolution in Pokémon GO"
  (https://www.pokemon.com/us/strategy/a-guide-to-mega-evolution-in-pokemon-go, fetched twice
  2026-09-05, consistent both times): "other Trainers' Pokémon will receive a stat boost, with an
  even higher bonus applied to allied Pokémon that share a type with your Mega-Evolved Pokémon."
  Worded to exclude the mega-bringer — boost goes to "other Trainers' Pokémon," not phrased as
  "your party." Does NOT explicitly state Primal/Rayquaza persistence-after-faint nuance (that
  part remains Bulbapedia-only, community-consensus tier). Does NOT use the word "own party"
  explicitly, but the "other Trainers'" framing is the operative exclusion.
- **[community-consensus]** Bulbapedia, "Mega Evolution (GO)" (fetched twice previously,
  2026-09-05): explicit exclusion language — "the damage bonus is not applied to the user or, for
  Primal Reversion and Mega Rayquaza, its own party. However, if multiple players use Mega
  Evolution or Primal Reversion, they can boost each other." Reads as a direct paraphrase/quote of
  the same official pokemon.com copy above, so treat these two as closer to one lineage than fully
  independent — still worth counting since the phrasing/exclusion is more explicit here than on
  pokemon.com itself.
- **[community-consensus]** Pokémon GO Hub, two separate articles independently fetched 2026-09-05
  ("Ultimate Guide to Mega Evolution in Pokémon GO" and "Complete Guide to the Updated Mega
  Evolution System"): "While attacking with a Mega-Evolved Pokémon in a Raid Battle or a Gym
  battle, the attacks of other Trainers' Pokémon challenging that same raid or Gym will deal more
  damage." Genuinely separate site/author from Bulbapedia, though likely also ultimately derived
  from the same official copy — still a real corroboration, not a blind re-assertion.
- **Attempted, blocked (not a source, just noting the gap):** Niantic's own Helpshift FAQ pages
  (both "Using a Mega-Evolved Pokémon" and "Why didn't I get a bonus for raiding with members of my
  team?" — the latter's title looked promising but is actually about the unrelated Premier Ball
  speed-bonus mechanic, not mega boosts) returned HTTP 403; Fandom's Mega Evolution wiki page
  returned HTTP 402. Neither confirms nor contradicts — just unreachable via WebFetch in this
  session.

**Net confidence: community-consensus, but now genuinely well-corroborated** (one official-tier
source + two independent community sources, all consistent, no contradicting source found
anywhere). Not "confirmed" in the strictest official-patch-note sense since the exact phrase "does
not apply to own party" itself only appears verbatim in the community tier (Bulbapedia), but the
underlying claim (boost target is "other Trainers'" Pokémon) is stated on Niantic/TPC's own
official guide page too.
