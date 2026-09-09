---
name: feature-roster-optimizer-phase1-csv-import
description: Multi-raid roster optimizer Phase 1 (Poke Genie CSV import) — the dex/mega-matching gotcha, compact-vs-hydrated pool storage, and working cleanly alongside a parallel engine-editing session
metadata:
  type: feedback
---

Built Phase 1 of `PLAN_multi_raid_roster_optimizer.md` (2026-09-08): pure
`packages/web/src/import/pokeGenieCsv.ts` (RFC-4180 parser) +
`pokeGenieMatch.ts` (6-step species-matching ladder) + `rosterPool.ts`
(localStorage persistence, deliberately kept OUT of `PowerUpOptimizerAssumptions`
per the plan's §3.2 exception) + `RosterImportPanel.tsx` (collapsed `<details>`
section wired minimally into `PowerUpOptimizerView.tsx`). 23/23 real fixture
rows matched; `npm run check-scenario-roundtrip` stayed green (proof the pool
never leaked into the Scenario).

**A mega form's `imageUrl` does NOT encode its real dex number — only base/
regional/gender/Shadow forms do.** `species.json` has no `dexNumber` field yet
(Phase 0 of the plan), so the only way to recover a dex number today is
parsing the trailing digits out of `imageUrl` (`.../pokemon/134.png`).
Confirmed directly against the data: `raichu-alola`, `sneasel-hisuian`,
`stunfisk-galarian`, `sneasel-shadow` etc. all reuse the BASE form's sprite
(so the parsed number IS the real dex) — but `delphox-mega`'s sprite is
`10293.png`, not Delphox's real dex 655 (a PokeAPI alt-form id). Building one
dex-indexed lookup map from this parse and then querying it for a Mega
candidate by dex number silently fails/misfires. Fix: for the "Form: Mega"
matching step, never trust the mega candidate's own derived dex at all —
instead resolve the BASE (non-mega) species for that dex to get its
canonical name, then search the whole registry by NAME prefix ("Mega
<canonical name>"). Isolated this reasoning in `findMegaCandidate`'s own doc
comment so Phase 0 landing a real `dexNumber` field doesn't accidentally
"simplify" the mega step back into a dex lookup that would still be wrong for
every mega/primal species.

**Regional/gender form-token matching must anchor to a whole hyphen-segment,
never a raw substring.** Species ids don't share one suffix convention
(`raichu-alola`, `sneasel-hisuian`, `stunfisk-galarian`, `indeedee-male`) — a
naive `id.includes("male")` substring check falsely matches
`indeedee-female` too (which contains "male"). Fixed by splitting the id on
`-` and checking `segment.startsWith(token)` per segment
(`idSuffixSegments`/`candidatesByFormToken`). Pinned as an explicit
regression test ("must not also match -female").

**Roster pool storage needed a compact/hydrated split, not one shared shape.**
`RosterEntry` (used everywhere in memory: matcher output, UI table) embeds
the full `SpeciesDefinition` object. Persisting THAT to localStorage would
balloon a 164-row pool from the plan's own measured ~12KB ("a compact slot
shape") to something enormous, since every species carries its whole
fastMoves/chargedMoves array. `rosterPool.ts` defines a separate
`StoredRosterEntry` (species ID string only) and `dehydrateRosterEntry`/
`hydrateRosterEntry` at the localStorage boundary — same "hydrate at the
edge, keep the rich type everywhere else" shape as other tabs' registry
lookups, just applied to persistence instead of a fetch.

**Confirming which uncommitted files were mine vs. the parallel session's,
via `git status --porcelain`, was essential and correct** — the task's hard
constraints named specific engine/web files as off-limits, but a NEW
untracked engine test file (`energyGatedIntervalBossCadence.test.ts`) that
wasn't explicitly named also turned out to be the other session's (git
status showed it `??`, and its 2 lint errors were pre-existing, unrelated to
anything I touched). `npm run verify` stops at the first failing step
(`lint`), so once that out-of-scope failure was confirmed not mine, I ran
`npm run check` and `npm run build --workspace=packages/web` directly to
prove my own slice was clean end-to-end rather than reporting a blocked
verify run. **How to apply:** whenever a task names a parallel session
touching specific files, always cross-check the FULL `git status` diff
(not just the named files) before assuming a lint/test failure is yours to
fix — a new untracked file in a shared area is very likely the other
session's, not a sign your own new files are broken.

**A literal BOM character (U+FEFF) typed directly into a regex or template
literal trips eslint's `no-irregular-whitespace`, AND is invisible/identical
to the Edit tool's diffing** — `old_string`/`new_string` containing the same
literal BOM glyph read as "no changes to make" even though the visible
intent (regex literal vs. `﻿` escape) differed, because the tool
compares the actual characters, and both looked like an ordinary space
glyph-wise. Fixed by dropping to `Bash` + `node -e` doing a
`charCodeAt`/`indexOf("﻿")` splice to swap the raw BOM char for the
6-character escape-sequence TEXT `﻿`, verified via `charCodeAt` before/
after rather than trusting a visual diff. Same fix applied at the SOURCE
level too: `pokeGenieCsv.ts`'s own BOM-stripping code uses
`text.charCodeAt(0) === 0xfeff` instead of a `/^﻿/`-style regex literal
containing a raw BOM char, sidestepping the lint rule entirely rather than
fighting it.

**`FastMove` (the engine type) does NOT declare `energyCost` or
`vulnerableWindowSeconds` — only `ChargedMove` does**, even though CLAUDE.md
correctly says every REAL synced move object carries both fields at
runtime (`gamemaster.ts`'s `fromGameMasterMove` returns a `FastMove &
ChargedMove` intersection). That's a runtime-data fact about the intersection
type real species use, not a structural guarantee of the narrower `FastMove`
interface alone. A hand-built test fixture typed as `FastMove` that includes
`vulnerableWindowSeconds` in its object literal fails TS's excess-property
check. Not a real bug — just don't copy real move JSON shape into a
`FastMove`-typed test helper; use only the fields the interface actually
declares.

**An ad-hoc Playwright verification script must live inside `packages/web`
(or wherever `node_modules/playwright` actually resolves from), not the
scratchpad directory** — Node ESM resolves `import { chromium } from
"playwright"` relative to the FILE's own location, not `cwd`, so a script
run via `node <scratchpad-path>/check.mjs` throws `ERR_MODULE_NOT_FOUND`
even when invoked with `cwd` inside `packages/web`. Fix: copy the script
into `packages/web/` temporarily, run it, delete it before finishing (same
"create + verify + delete, never commit" pattern as engine scratch scripts
in earlier sessions — see [[verification_without_browser_tool]]). Confirmed
this way, live: paste-import → 23/23 matched, 0 unmatched, 11 approximate
badges rendered, roster count survives a full page reload (localStorage),
zero console errors.
