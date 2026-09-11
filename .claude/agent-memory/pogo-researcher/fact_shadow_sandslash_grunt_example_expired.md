---
name: fact-shadow-sandslash-grunt-example-expired
description: MECHANICS.md's 2026-09-09 "Shadow Alolan Sandslash has never raided, grunt-only" example expired within 2 days — it is now a live 3-Star Shadow Raid boss (confirmed 2026-09-11, two sources + own raidHistory.json). Corrected in place. Also flags an unresolved Sandshrew-vs-Sandslash naming mismatch between CLAUDE.md and MECHANICS.md.
metadata:
  type: project
---

2026-09-11 audit pass. MECHANICS.md's "Which species can be Shadow at all" section (written
2026-09-09, field-researcher-sourced) named Shadow Alolan **Sandslash** as the confirmed live
example of a species the first-party GAME_MASTER `shadow` block anchors that had *never* raided as
Shadow — grunt-only. That claim is now false: `pokemongohub.net` ("Current Pokémon GO Raid Bosses",
self-dated "Last Updated: September 11, 2026") and `leekduck.com/raid-bosses/` (fetched same day)
both independently list "Shadow Alolan Sandslash" as an active 3-Star Shadow Raid boss, and this
project's own `data/normalized/raidHistory.json` already caught it (`sandslash-alola-shadow`,
`source: "live-feed"`, `firstSeenAt: 2026-09-09T23:05:29.048Z` — i.e. it started raiding within
hours of the original field-researcher observation the same day, `lastSeenAt` still current as of
the 2026-09-11T11:56 sync).

**Read this as a positive validation of [[fact-mega-boost-other-trainers-not-own-party]]-adjacent
design discipline**, not a failure: `sandslash-alola-shadow` was already present in `species.json`
via the GAME_MASTER-anchor synthesis (IDEAS.md #15, shipped 2026-09-11) *before* it ever raided.
Only the illustrative prose example needed correcting, which I did in place in MECHANICS.md
(don't re-add a stale reference to this species as "grunt-only" without re-checking the live raid
feed first).

**Open, unresolved by this pass**: `CLAUDE.md`'s shadow-synthesis standing decision cites "Shadow
Alolan **Sandshrew**" (the pre-evolution) as its own illustrative grunt-only example — a different
real species from Sandslash. I did not verify Sandshrew's current raid status; this is either two
independently-true examples or a stale/wrong species name in one of the two docs, sitting
unreconciled. Flagged for the overseer; not mine to edit (CLAUDE.md is out of my remit). A future
pass checking shadow-roster claims should verify Sandshrew specifically before reusing it as an
example.

**Lesson for future passes**: an illustrative "confirmed live/never-live" example tied to a specific
species is more perishable than a general mechanic — the raid rotation moves faster than this file's
own re-verification cadence. Prefer citing the *mechanism* (GAME_MASTER shadow-block anchoring) over
a specific named species when the claim is "this one has never raided," or re-check the live feed
in the same pass before restating it.
