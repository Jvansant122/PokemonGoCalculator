---
name: fact-powerup-cost-data-source
description: Real stardust/candy power-up cost table source for a future Power-Up Optimizer feature
metadata:
  type: project
---

Researched 2026-09-07 for the "Power-Up Optimizer" idea in `IDEAS.md`.

**Real data source found**: pogoapi.net has a dedicated endpoint,
`GET /api/v1/pokemon_powerup_requirements.json` (confirmed via its own
documentation page, 2026-09-07 fetch), keyed by current level, each entry
carrying `candy_to_upgrade`, `xl_candy_to_upgrade`, `stardust_to_upgrade`,
`current_level`, `level_after_powering`. Covers levels 1-50. Per the docs,
cost is **universal across all standard Pokémon** — no per-species/rarity
variation in the base table. [community-consensus, but pogoapi.net is the
same data source this project's `scripts/sync-data.ts` already treats as
primary/near-official — see `sync-data.ts` module docstring — so this is
as trustworthy as any other pogoapi endpoint already wired into this repo]

This endpoint is **not currently fetched or synced** by `scripts/sync-data.ts`
as of 2026-09-07 (grepped `data/raw` and `scripts/sync-data.ts` for
stardust/candy — zero hits outside a motivating-comment in
`packages/web/src/IvBreakpointsView.tsx`). Any Power-Up Optimizer work needs
new `data-sync` work to fetch/normalize this endpoint — do not hand-author
the table.

**Modifiers on top of the base table** (Bulbapedia "Power up" page, two
independent WebFetch passes on 2026-09-07 agreed on the percentages, though
the *cumulative total* stardust/candy figures the same fetches produced
disagreed with each other across attempts — treat any single "total cost
1->50" number pulled via WebFetch summarization as unreliable; only the
per-level API endpoint above should be trusted for exact figures):
- Lucky: 50% of listed Stardust only (candy unaffected).
- Shadow: 1.2x listed Stardust AND Candy.
- Purified: 90% of listed Stardust AND Candy (rounded up).
- Lucky+Purified stack multiplicatively on Stardust (down to ~45%).

Important distinction for engine modeling: Lucky/Purified are **not** combat
stat multipliers (unlike Shadow, which already has real combat multipliers
built — see `fact_shadow_pokemon_stats.md` / `packages/engine/src/shadow.ts`).
Lucky only affects catch-time IV odds; Purified simply removes the Shadow
combat penalty (a purified Pokémon is combat-equivalent to `isShadow: false`
in this engine's existing model — no new combat flag needed). Lucky/Shadow/
Purified matter to a Power-Up Optimizer **only on the cost side** (which
multiplier applies to the stardust/candy math), not the combat/DPS math,
which the engine already covers via existing `isShadow`.

See `proposal_powerup_optimizer_flesh_out.md` for the full proposal this
research fed into.
