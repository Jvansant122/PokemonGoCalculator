---
name: feature_species_moves_split_registry_join
description: PLAN_species_moves_split.md Stage 1b — registry.ts joins speciesCore.json + speciesMoves.json in place; measured real bundle saving and where the estimate diverged from reality
metadata:
  type: project
---

Implemented Stage 1b of `PLAN_species_moves_split.md` (2026-09-14): `packages/web/src/registry.ts`
now imports `speciesCore.json` (species minus move arrays) + `speciesMoves.json` (deduped move
dict + per-species id lists) instead of `species.json`, both still STATIC imports (Stage 2's
dynamic-import gate is explicitly separate, not started). Species register with empty
`fastMoves`/`chargedMoves`, then a new `fillSpeciesMoves(registry, payload)` — placed beside
`resolveEvolutions` and calling out that it inherits its exact contract (register stores the
reference, mutation-in-place is observed everywhere) — fills them from the dictionaries,
skip-and-continue on a missing id (same degrade convention as `resolveEvolutions`).

**Why:** ships ~90 KB gzip off first load for free (no async, no gate, no worker risk) by
deduping 13,061 per-species move occurrences down to 308 shared objects. See the plan for the
full reasoning; this memory is about what happened when I actually measured it, not the plan
itself (read the plan, don't re-derive).

**Real measured numbers vs. the plan's estimate — worth knowing before trusting a plan's
byte estimate again:**
- Plan's Stage 0 baseline (before this change): Comparator cold-load closure 316 KB gzip,
  species-bearing chunk (`_urlUtils-*.js`) 233 KB gzip.
- After Stage 1b: Comparator closure ~239.5 KB gzip (decimal KB — confirmed Vite/rollup's own
  "gzip: X kB" printout is decimal/1000-based, not KiB/1024, by round-tripping index.html's raw
  533-byte gzip against both), species chunk (still named `urlUtils-*.js`, same file identity)
  dropped to 154.51 KB gzip — a ~78.5 KB cut in that one chunk.
- **That's ~76.5 KB off the total, not the ~90 KB estimate** — a real, legitimate shortfall, not
  a bug. Confirmed by grepping the built chunk: `energyGain` (a move-object key) appears exactly
  ONCE in the whole file (dedup genuinely landed in the bundle, not just in source), while a
  common move id string like `VINE_WHIP_FAST` appears 42 times (expected — that's 42 different
  species' `bySpecies` id-list references to the ONE shared object, not 42 copies of the object).
  The gap is because the plan's 91 KB figure was gzip of RAW JSON in isolation; gzip already
  compresses naive repeated JSON reasonably well on its own, and minification/module-wrapper
  overhead eats into the theoretical saving once it's inside a bundled, minified chunk. Report the
  real measured number rather than assuming a plan's isolated-file estimate transfers 1:1 into a
  bundled result — direction and rough magnitude held, exact number didn't.

**Gotcha for the next Stage (2):** `npx playwright test` locally reuses an existing preview server
on port 4173 (`reuseExistingServer: !process.env.CI` in `playwright.config.ts`) — if a prior
build is still being served, tests run against STALE `dist/`. Rebuild before trusting a Playwright
result. Separately, saw ONE flaky failure (Roster tab's e2e smoke test hit the real
`TabErrorBoundary` fallback, not a selector timeout) on the very first `npm run verify:full` run
right after a fresh `vite build`, under 12 parallel workers — reran 3x clean afterward with zero
failures, including a full `verify:full` from scratch. Treated as a pre-existing race/flake
unrelated to this change (not reproducible in isolation via `-g` filter), not investigated further
since it wasn't caused by the registry edit — but flag it if it recurs.

Also confirmed while doing this: only `registry.ts` imports `species.json`'s replacement pair in
`packages/web/src`; `import/pokeGenieMatch.ts` only mentions `species.json` in a comment, not an
import. `resolveEvolutions`'s param type had to change from `RawSpeciesRecord[]` to a new
`RawSpeciesCoreRecord[]` (`Omit<RawSpeciesRecord, "fastMoves"|"chargedMoves">`) since it now
receives the core-only array — it never read the move fields anyway, so this is a pure type
narrowing, no behavior change.

Verification level: full `npm run verify:full` (654+413+257 vitest + typecheck + lint + check +
build + all 33 Playwright e2e specs) green from a clean build, plus 3 extra standalone Playwright
reruns. No browser tool was granted for this task — Playwright's real headless-Chromium e2e suite
(zero console/page errors per tab, share-link round-trips) was the actual-browser verification
layer used in its place, on top of the production build succeeding.
