---
name: project-audit-2026-09-11-checkpoint
description: Full-project audit pass 2026-09-11 (mechanics drift + content gaps + ideation) found the roster complete (59 megas/2 primals matching theclick.gg's independent count), the 1.3/1.1 boost split reconfirmed unchanged, one stale MECHANICS.md example corrected (Shadow Alolan Sandslash), and no new feature proposal — existing IDEAS.md/REJECTED_IDEAS.md already cover the space. Use as a "last known good" checkpoint before re-deriving any of this from scratch.
metadata:
  type: project
---

Requested by the overseer as a full audit: MECHANICS.md entry-by-entry drift check, mega/primal/
shadow content-gap check, and feature ideation. Full report written to the session scratchpad (not
persisted in the repo — see the overseer's own summary/HANDOFF if this needs recovering).

**Why this is worth a checkpoint memory**: this project had *just* run an unusually dense research
cycle (2026-09-08 through 2026-09-11, dozens of memory files already exist) before this audit, so a
future pass tempted to re-derive any of the below from scratch should check here first.

- **1.3/1.1 mega boost split**: reconfirmed via fresh WebSearch, no contradiction anywhere. This is
  the single check worth repeating every pass given how load-bearing it is — took under 5 minutes.
- **Mega/primal roster**: `data/normalized/species.json` (synced `2026-09-11T11:56Z`) has 59 Mega +
  2 Primal entries, independently matching `theclick.gg`'s "59 total as of September 10, 2026"
  count. `releasedMegaPrimalAllowlist.ts`'s 12 hand-added entries all still needed and all still
  correctly excluding Mega Staraptor (real debut 2026-09-19, still future as of this audit).
- **Current live raid roster**: `activeRaids.json` (same sync) matches `leekduck.com/raid-bosses/`
  (the actual ScrapedDuck upstream) exactly. One discrepancy against a SECOND source
  (`pokemongohub.net` claiming "Mega Houndoom" also active) traced to a WebFetch summarization
  artifact, not a real gap — see [[fact-shadow-sandslash-grunt-example-expired]] for the general
  "don't trust a single WebFetch pass, cross-check the actual upstream" lesson, same pattern.
- **One MECHANICS.md correction made**: see [[fact-shadow-sandslash-grunt-example-expired]] — a
  named "never raided" example expired in 2 days of real time. General lesson: prefer citing a
  *mechanism* over a specific perishable species example when documenting a live-roster claim.
- **No new feature proposal.** Read `REJECTED_IDEAS.md` in full and `IDEAS.md` in full before
  concluding this — the Shipped table already covers party-size crossover, boss-moveset sweep on
  Team Raid, dodge-error sensitivity, and Shadow enrage simulation (all things I would otherwise
  have proposed). One candidate (a sensitivity axis across boss-cadence *model choice*, not just the
  existing continuous mean-interval sweep within one model) was considered and explicitly rejected
  as risking an end-run around `IDEAS.md`'s own "energy-driven cadence blocked pending the 50%-roll
  denominator" gate — don't repropose without a source for that denominator (`LINKS.md` #4, still
  open, re-attempted this pass with a fresh 2026 query, still nothing found).
