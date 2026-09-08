---
name: add-mega-allowlist-entry
description: Adds a real, released mega/primal form to RELEASED_MEGA_PRIMAL_ALLOWLIST so it reaches the species picker even though neither automated released-content gate (pogoapi's mega_pokemon.json roster, the live raid feed) can see it. Use when check-mega-gaps / check-mega-gates reports a missing or live-gate-only mega, when a user reports a real mega absent from the picker, or when a mega's only debut was a one-day event. Never for unreleased or datamined forms — GAME_MASTER lists forms Niantic has never shipped.
---

# Add a mega/primal allowlist entry

CLAUDE.md's "Standing decisions" records why this table exists: a mega whose debut was a
one-day event is missing from pogoapi's `mega_pokemon.json` *and* isn't a currently-live raid,
so it is invisible to both automated gates despite being real, permanently-unlockable content.
Mega Skarmory reached the picker only through the live-raid gate and vanished the moment its
rotation ended. The allowlist is the third way in — hand-reviewed, one citation per entry.

## Checklist

1. **Confirm the release with a source independent of GAME_MASTER** (and independent of
   whatever suggested the name — a `check-mega-gaps` hit is a *candidate*, not a confirmation).
   Bulbapedia's Pokémon GO mega page, a Niantic blog post, or LeekDuck's event archive with a
   debut date all qualify; GAME_MASTER's `tempEvoOverrides` does not. If you can't find one,
   stop and report that — an absent entry is honest, a speculative one isn't.

2. **Add the entry** to `scripts/sync-data/releasedMegaPrimalAllowlist.ts`. Read its header
   comment for the shape and the naming rule (`Mega X` / `Primal X`, parsed by the same
   `parseMegaOrPrimalRaidName` machinery the raid gap-fill uses). Put the citation in a comment
   directly above the entry — the allowlist test asserts one is there. Leave `lastKnownRaidTier`
   undefined rather than guessing; an absent tier falls through to the heuristic honestly.

3. **Resync and diff.** `npm run sync-data`, then `npm run diff-normalized` and read the
   species-level diff: exactly the new form should appear, with stats that match your source.
   Anything else changing is a separate finding for `data-sync`.

4. **Re-run the gate checks.** `npm run check-mega-gates` (the new form must be carried by the
   allowlist, not live-gate-only) and `npm run check-mega-gaps` if it was a Bulbapedia-diff hit.

5. **`npm run test:scripts`.** The allowlist test and the golden sentinels over
   `data/normalized/` run here. A sentinel failing on a *legitimate* data change is expected —
   update it deliberately, with the new cited value, never by loosening the assertion.

## Finish

Report the entry, its citation, and the `diff-normalized` summary. Data changes ship through
`verify-and-ship` like anything else; this skill does not commit.
