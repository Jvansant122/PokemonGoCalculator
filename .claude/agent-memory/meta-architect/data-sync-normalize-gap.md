---
name: data-sync-normalize-gap
description: data-sync.md's fetch section never instructs the agent to run `npm run sync-data`; it reads as if the agent hand-normalizes into data/normalized/ itself, duplicating scripts/sync-data.ts's canonical transform. Flagged 2026-09-05, not fixed (review scope, no edit requested).
metadata:
  type: project
---

`data-sync.md`'s "Source" section ends: "Fetch sequentially... Cache raw responses under
`data/raw/`... **and write normalized output to `data/normalized/`**." It never mentions running
`npm run sync-data` / `scripts/sync-data.ts`.

**Evidence this is a real gap, not a style choice:** `scripts/sync-data.ts`'s own header comment
(lines 7-11) says: "This script does NOT re-derive the GameMaster transform — it imports and calls
`fromGameMaster`/`fromGameMasterMove` from `@pogo-analyzer/engine` directly, so there is exactly
one place... that knows how a raw pogoapi record becomes a SpeciesDefinition." If `data-sync`
follows its own doc literally and hand-normalizes, it creates a second, competing implementation
of that transform via whatever tool it picks (WebFetch/Bash), which is exactly the drift CLAUDE.md's
"single code path" rule and the script's own header are trying to prevent.

Further evidence the intended design *was* fetch-raw → run script → report the script's own
output: `data-sync.md`'s "Output format" spec (`SYNCED: <endpoints>, <n> species, <n> moves` /
`CHANGED:` / `AFFECTS SCENARIOS:` / `WARNINGS:`) is near-verbatim the shape of
`scripts/sync-data.ts`'s own final `console.log` (line 726) — strongly suggesting the agent was
meant to run the script and relay its summary line, not compute one itself.

Also confirmed: `scripts/sync-data.ts` does NOT fetch the 7 standard pogoapi endpoints or the
ScrapedDuck raids feed itself (only `mega_pokemon.json` and mega sprite URLs are self-fetched,
via `fetchAndCacheMegaPokemon`/`fetchMegaSpriteUrls`) — it assumes `pokemon_stats.json` etc. and
`raids.json` are already sitting in `data/raw/`. So the *raw-fetch* half of `data-sync.md`'s
current body is correctly the agent's job; only the *normalize* half is stale/wrong.

**Proposed fix (not applied, review scope):** add a "## Normalize" section after "Fetch
sequentially...": run `npm run sync-data` from repo root after raw responses are cached; report
its own `SYNCED`/`WARNINGS` output rather than hand-computing one. Trim "and write normalized
output to `data/normalized/`" from the Source section's closing sentence.

**How to apply:** if `data-sync` is invoked for a real sync and produces `data/normalized/*`
output that doesn't match what a manual `npm run sync-data` run produces, this is very likely why
— check first whether it ran the script or hand-rolled the transform.
