---
name: fact-remote-raid-penalty-removed
description: remote raid damage penalty was permanently removed 2023-06-01 (official Niantic Support announcement); remote and in-person raiders deal identical damage since — engine correctly models neither, since there's nothing left to model
metadata:
  type: project
---

[community-consensus quoting an official Niantic Support announcement],
researched 2026-09-09. Remote raiders once dealt reduced damage vs. in-person
raiders (a penalty present since Remote Raid Passes launched in 2020, tuned
various ways across 2021-2023). Niantic Support announced 2023-05-31 that equal
damage for remote vs. in-person raiding, previously only a temporary seasonal
bonus, became a **permanent** standard feature starting 2023-06-01 (Hidden Gems
season). Quoted wording (via secondary aggregation, primary Niantic Support post
URL not independently re-fetchable this pass — a direct fetch of
futuregamereleases.com's writeup 403'd/connection-refused): "the damage dealt by
Pokémon participating in raids remotely will be permanently increased to the same
amount of damage dealt by Pokémon participating in raids in person."

**No 2024/2025/2026 reversal found.** Remote and in-person raid damage remain
identical as far as every source checked this pass indicates.

**Engine: correctly models nothing here, because there is nothing to model** — no
remote/in-person distinction exists anywhere in `packages/engine`, which is exactly
right for the current game state. Recording this so a future pass doesn't
"discover" the old penalty in an outdated source and propose adding it back as a
missing feature; it was real, but it has been gone for three-plus years.
