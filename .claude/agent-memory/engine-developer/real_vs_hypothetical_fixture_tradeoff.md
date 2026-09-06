---
name: real-vs-hypothetical-fixture-tradeoff
description: When to pin an acceptance test against a hand-authored hypothetical fixture vs. a real synced species from data/normalized/species.json
metadata:
  type: feedback
---

When a pinned acceptance test needs a stable attacker/boss pair, prefer a
freshly hand-authored, clearly-hypothetical fixture over a real synced
species from `data/normalized/species.json`, even though real species with
`bossRaidTier`/`statsArePrecomputed` support are now perfectly usable as
candidates/bosses.

**Why**: an exact pinned number (a percentage delta, an exact damage value,
an exact "faints at t=X.Xs") is much easier to keep correct and to
re-derive by hand when the underlying stats were chosen for that purpose.
Real species stats are outside this project's control — historically stable,
but not a guarantee — and a future `data-sync` resync (movepool additions,
a stat correction upstream) could invalidate a precise pin for reasons
completely unrelated to an actual engine bug, silently breaking a test years
after the fact with a very confusing failure (a suite failure "in" the
engine when the actual root cause was a data refresh).

**How to apply**: reach for a real species pair only when the property under
test is fundamentally ABOUT real-game data fidelity itself (e.g.
`raidBossTier.test.ts`'s real-tier derivation tests, which exist specifically
to prove the real per-tier formula engages for non-precomputed species — see
`REAL_STYLE_BOSS`/`PRECOMPUTED_STYLE_BOSS` there, both synthetic on purpose).
For everything else — general formula/mechanic regression guards — a fresh
hand-authored fixture with numbers verified once via the engine's own code
(never hand-arithmetic alone; run it through vitest/a throwaway script and
copy the actual output) is the more robust pin. See
[[fixture-deletion-hypothetical-duo]] for the concrete precedent.
