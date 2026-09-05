---
name: sprite-mechanism-dropped
description: The mega/hypothetical sprite-fetching mechanism (fetchMegaSpriteUrls, data/raw/mega_sprite_urls.json cache, kyogre-primal-attacker rename-lookup gotcha) is live in scripts/sync-data.ts and scenarioA.ts but is absent from every agent body and CLAUDE.md after the 2026-09-05 six-agent split. Flagged, not fixed (review scope).
metadata:
  type: project
---

The pre-split CLAUDE.md had a "Species images" section describing: real Normal-form species get
a dex-id sprite URL with no extra request; real mega/primal species and the 4 hypothetical
fixtures each need a PokeAPI name-slug lookup (`scripts/sync-data.ts`'s `fetchMegaSpriteUrls`,
cached to `data/raw/mega_sprite_urls.json`); and — the actually load-bearing gotcha — when a
species id gets renamed to dodge a collision (e.g. `kyogre-primal-attacker`), the sprite lookup
must use the *natural* pre-collision name, because PokeAPI has never heard of the renamed id.

**Confirmed still live and current in code** (not a fossil worth cutting): `scripts/sync-data.ts`
lines 222/237/414/520/524/741 (`MEGA_SPRITE_CACHE_PATH`, `fetchMegaSpriteUrls`, the
`kyogre-primal-attacker` rename comment) and `fixtures/scenarioA.ts`'s hand-set `imageUrl` values
on all 4 hypothetical species. This is real, current, load-bearing mechanism — not something that
should have been trimmed as changelog narrative like [[claude-md-changelog-drift]]'s finds.

**Where it should have landed and didn't:** `data-sync.md` owns `scripts/sync-data.ts` (has a
whole "## Normalize" and "## Known gap: raid bosses" section) but has zero mention of sprites,
`mega_sprite_urls.json`, or `fetchMegaSpriteUrls` anywhere. `engine-developer.md` (owns
`scenarioA.ts`, where the hand-set `imageUrl` values actually live) has only one truncated
sentence pointing sprite-lookup responsibility at `scripts/sync-data.ts` — it doesn't carry the
rename-collision gotcha, which is exactly the trap someone editing `scenarioA.ts` or renaming a
species id to dodge a future collision would hit with no doc trail.

**Proposed fix (not applied, review scope):** add a short paragraph to `data-sync.md` (its "##
Normalize" or a new "## Sprites" section) covering `fetchMegaSpriteUrls`'s caching and the
rename-lookup gotcha; optionally a one-line cross-reference in `engine-developer.md`'s Fixtures
section reminding that a renamed fixture id needs its sprite looked up under the natural
pre-collision name.

**How to apply:** if this comes up again (e.g. a new hypothetical fixture gets an id rename for a
collision and ships with no `imageUrl`, or `data-sync` is asked about mega sprites and has to
guess), this is the gap. Fix by restoring the paragraph above into `data-sync.md`, not by
re-adding it to CLAUDE.md.
