# PLAN — Defer the species MOVE arrays out of first load (IDEAS.md #26)

**Status: not started.** Self-contained plan for a fresh session. Read `IDEAS.md` #26 (the
measurement) and `CLAUDE.md`'s worker standing decision first. Investigation done 2026-09-14 by a
read-only planning pass; every number below was independently re-measured by the overseer against
the committed `data/normalized/species.json`.

---

## 0. Read this first — the framing in IDEAS #26 was wrong in a way that matters

IDEAS #26 assumed the deferred payload is the moves **as they sit today**: 1.92 MB raw / ~119 KB
gzip. That is the naive per-species shape, and the data is massively redundant:

```
1,750 species → 13,061 move entries → 308 distinct move objects (80 fast + 228 charged)
                                       ZERO structural conflicts by id
```

Every occurrence of a given move id is byte-identical JSON across all 1,750 species. **Verified
2026-09-14: 0 conflicts.** So a move *dictionary* plus per-species id lists is provably safe today,
and it changes the economics:

| payload | gzip |
| :--- | ---: |
| today: full `species.json` | **211 KB** |
| core (species minus moves) | 78 KB |
| moves, naive per-species (what IDEAS #26 assumed) | ~119 KB |
| **moves, deduped dict + `bySpecies` id lists** | **42 KB** |

Three consequences that reshape the work:

1. **Dedup alone is worth ~90 KB gzip with no async, no gating and no worker risk** — a build-time
   data reshape plus an eager join. First load 322 → ~237 KB. Independently shippable and
   revertable, and it banks more than half the target before any risky work starts.
2. **The deferred chunk is 42 KB, not 119 KB.**
3. Final first load ≈ **195 KB gzip**, and *total* bytes for a user who simulates also fall
   (211 → 120 KB), which the naive split would not have achieved.

### The objection the dedup defuses — and which would otherwise sink this

`ComparatorView` is the default landing tab and calls `runComparatorScenario` in a `useMemo` on its
**first render**. All seven tabs simulate or move-match immediately. So "deferring" moves does not
mean most users never fetch them — essentially every user does.

Under the naive shape the trade was: paint sooner, but the first *result* arrives one 119 KB
round-trip later, with total bytes unchanged. **That is a bad trade and would have been a
legitimate reason to decline the whole idea.** Under the dedup shape the deferred chunk is 42 KB
fetched *in parallel* (kicked off at registry module-eval, not on demand), total bytes go down, and
the 2.65 MB → 0.99 MB cut in JS-object-literal parse work is a real main-thread win on mobile
independent of transfer.

---

## 1. Call-site census

526 raw occurrences repo-wide including comments and tests. What matters:

**Engine (`packages/engine/src`) — 45 refs across 11 files.** Every one is "read the array off a
`SpeciesDefinition` I was handed." No construction outside `gamemaster.ts`'s `fromGameMaster`, and
no I/O anywhere — the engine is pure by design. **Decisive: an async moves load inside the engine
would violate the no-I/O invariant and is not on the table.** The engine must keep receiving
fully-populated `SpeciesDefinition` objects synchronously.

**Web (`packages/web/src`) — ~95 non-test refs in three shapes:**

- **Shape A — pick time, ~26 sites / 7 files.** `<MoveSelect moves={species.fastMoves} />`.
- **Shape B — simulate time, ~45 sites.** `resolveMove(x.fastMoves, id)`, concentrated in `run/*.ts`
  and mirrored in the engine. **Fails loud already:** `comparison.ts:426/436` throw explicitly
  ("Boss species X has no fast move defined").
- **Shape C — length/predicate probes, ~10 sites. The dangerous ones — they degrade silently on an
  empty array instead of throwing:**
  - `run/runSpeciesReport.ts:77` — filters on `.length > 0` → silently empty report.
  - `run/runComparator.ts:240`, `run/runTeamRaid.ts:310` — `fast*charged >= 2` → silently skips the
    boss-moveset sweep.
  - `megaLevelSelect.tsx` → `canReachSuperMax` → every mega silently "ineligible".
  - `RosterEntryForm.tsx:96,109` → second-charged-move control silently hidden.
  - `rosterEntryDraft.ts:187-190` → writes **null move ids into a persisted draft**.
  - `import/pokeGenieMatch.ts:360-368` → CSV import name-matches against empty arrays, writing null
    move ids and `movesetIsDefaulted` **into localStorage**. *Sharpest data-corruption path in the
    app; the corruption survives the fix.*

**Scripts:** `scripts/run-scenario.ts:85` imports the web registry and runs it under `tsx`.
`sync-data*` touches moves on raw JSON, not the engine type. The mega/raid checkers read
`species.json` but only ids and `.boost`.

**Clustered, not scattered:** `registry.ts` + `App.tsx` + ~10 guard insertions covers it. The other
~130 call sites need no change at all.

---

## 2. The shape — recommendation, and what was rejected

### Recommended: keep the field, fill it in place, gate the app on one promise

`SpeciesDefinition.fastMoves`/`.chargedMoves` stay **required, non-optional, arrays of objects**.
`registry.ts` registers species with empty arrays, then a dynamically-imported moves payload
**mutates the registered species objects in place**.

This is the repo's *existing* pattern, not a new one: `resolveEvolutions` in `registry.ts` already
mutates registered species after registration, and its doc comment states the contract
("`register` stores the exact reference handed to it, never a copy"). `fillSpeciesMoves` sits
beside it and inherits that contract verbatim.

**Honest cost:** ~130 call sites keep compiling and working unchanged, in exchange for trading a
*type* guarantee for a *temporal* one. The compiler can no longer prove a species has its moves —
only the app-level gate and Stage 3's asserts can.

**New `registry.ts` API:**

```ts
export function speciesMovesLoaded(): boolean;
export function ensureSpeciesMovesLoaded(): Promise<void>;   // idempotent, memoized
export function assertSpeciesMovesLoaded(caller: string): void;  // throws
```

plus a module-scope `void ensureSpeciesMovesLoaded();` so the fetch starts the moment `registry.ts`
evaluates — **eager-start, lazily-awaited**. That is what makes this a parallel-fetch reshape
rather than a serial deferral, and it is the difference between worth doing and not.

**Loading mechanism: a dynamic `import()` of a relative JSON path, NOT `fetch()`.** All three
reasons are load-bearing:

- The site deploys under `base: "/PokemonGoCalculator/"`. A hand-written `fetch("/data/…")` works in
  dev and breaks on Pages — the classic silent-in-CI break. `import()` goes through Rollup, becomes
  a hashed asset, and gets base handling free.
- It must resolve in **three** environments: the Vite build, **vitest** (`packages/web/vitest.config.ts`
  is its own config and does **not** load `vite.config.ts`'s plugins), and **tsx**
  (`scripts/run-scenario.ts`). A relative JSON path works in all three; a Vite virtual-module plugin
  works in exactly one. **Do not use a Vite plugin here.**
- Dynamic JSON import under tsx was verified working with no import attribute. (If you re-test with
  `tsx -e` and top-level `await` and it rejects, that is an artifact of `-e` compiling to CJS, not
  of tsx. Root `package.json` is `"type": "module"`.)

**Gate placement: exactly one site in `App.tsx`.** Wrap the existing `<TabErrorBoundary>`/`<Suspense>`
block so **all seven views sit behind one gate**, never seven. The masthead, tab `<nav>`,
`<main role="tabpanel">` and share-link parsing stay *outside* it so the shell paints immediately —
the entire point. React 18.3 has no stable `use()`, so this is a small hook
(`speciesMovesReady.ts`), not Suspense. Render the existing `<TabLoadingBar />` while pending (it is
`position: fixed`, occupies no box, causes no layout shift) and an inline retry panel on error.
**Never render a view with empty movepools.**

### Rejected

| Option | Why not |
| :--- | :--- |
| Async load **inside the engine** | Violates the engine's no-I/O invariant, and cascades `async` through ~45 engine sites, `runComparatorScenario`, `runRosterPlanner`, `teamRaid.ts` and the worker message contract. Hundreds of sites. Non-starter. |
| Move **ids** + separate lookup table | Type-honest and compiler-enforced — genuinely better design. But it rewrites ~45 engine sites, ~26 `MoveSelect` props, ~45 `resolveMove` sites, plus every fixture that constructs a species (`powerUp.test.ts` 53, `teamRaid.test.ts` 49, `shadowEnrage.test.ts` 25…). 300+ sites across two packages for **zero additional bytes**. |
| **Getter** on the registry that throws pre-load | Loud everywhere for free — attractive. But getters are not structured-cloned, so the worker would receive an object with **no `fastMoves` key at all**; also breaks `{...species}` and `JSON.stringify`. Stage 3's asserts buy ~90% of the loudness with none of this. |
| Make the fields **optional** | `strict` + `noUncheckedIndexedAccess` ⇒ a compile error at ~170 read sites. Same cost as the ids option without its benefit. |

---

## 3. The worker constraint — satisfied, and how a reviewer proves it

**The worker needs zero changes.** `rosterPlanner.worker.ts` imports only `@pogo-analyzer/engine`
and receives fully-resolved plain-JSON `RosterPlannerInputs` via `postMessage`; resolution happens
on the main thread in `run/runRosterPlanner.ts`. Because the recommended shape fills the *existing*
species objects in place, those resolved inputs carry complete move arrays exactly as today. **This
is the strongest single argument for in-place fill over every alternative.**

Two notes: dedup gives the worker a bonus (structured clone preserves reference identity within one
message, so 13,061 move objects collapse to 308 — the roster `postMessage` gets *smaller*); and the
client's main-thread fallback path is reached from UI already behind the gate, so it needs no extra
handling.

⚠️ **Move objects are never mutated today** — `megaLevel.ts:365`'s `chargedMoveAtMegaLevel` returns
`{...move, power}`, a copy. Confirmed. **If a future change ever mutates a move object in place, the
dedup silently corrupts every other species carrying that move.** Put that warning in
`fillSpeciesMoves`'s doc comment.

### Two guards — add both

**Guard 1 (static).** `eslint.config.js` is a flat config; add a `packages/web/src/**/*.worker.ts`
block with `no-restricted-imports` banning `**/registry`, `**/registry.js`, `**/data/normalized/*`,
with a message naming CLAUDE.md. Fails at `npm run lint`, before any build. **Until now this
constraint has been prose in two doc comments and nothing else.**

**Guard 2 (empirical — the one that proves bytes).** New `scripts/check-bundle-split.mjs` reading
`dist/.vite/manifest.json` (enable `build.manifest: true`). Four assertions, each catching a
different silent failure:

1. **Worker chunk raw size ≤ pinned budget.** If the worker ever pulls in `registry.ts` it gains
   ≥717 KB raw and blows this instantly. *The double-bundling check.*
2. **The moves chunk is NOT a static import of the entry** — walk the entry's `imports` transitively
   and assert the moves chunk is reachable only via `dynamicImports`. *The deferral check*, and the
   one that catches "someone changed `import()` to a static import and the saving quietly
   evaporated while every test passed."
3. **Cold-load closure for the default tab ≤ budget.** The headline number; pin it with the measured
   value and date in a comment.

   ⚠️ **CORRECTED 2026-09-14 by Stage 0 — the original wording of this assertion was broken.** It
   said "sum of gzip over the *entry's* static-import closure", which measures **48 KB** and would
   have passed trivially forever *without ever seeing the species payload*. The manifest entry
   (`index.html`) has **no static imports at all** — only 7 dynamic ones. The 233 KB species-bearing
   chunk (`_urlUtils-*.js`) is statically imported by all seven **view** chunks and several shared
   chunks, never by the entry, so it arrives as a static dependency of whichever lazy view loads
   first. The correct metric is **entry closure ∪ the default view's static closure**, plus their
   CSS. Measured 2026-09-14 at HEAD: **Comparator 316 KB**, Power-Up Optimizer 366 KB, Roster
   301 KB. Assert against the Comparator number — it is the default landing tab.
4. **Total raw bytes across all emitted JS ≤ budget.** Catches duplication anywhere.

⚠️ **Wiring trap.** `npm run verify` is `test && typecheck && lint && check && build` — `check` runs
**before** `build`, so a dist-inspecting checker **cannot** live in `npm run check`; it would pass
vacuously against a stale or absent `dist/`, which is exactly the silent pass it exists to prevent.
Append it after the build instead.

---

## 4. Staging — four stages, each green and revertable

### Stage 0 — baseline and spikes — ✅ DONE 2026-09-14

`build.manifest: true` added to `packages/web/vite.config.ts` with a comment explaining that
nothing in the app reads it. Measured at HEAD:

| quantity | measured |
| :--- | ---: |
| worker chunk raw (Guard 2 #1 budget pins here) | **70 KB** |
| entry static closure | 48 KB gzip — **meaningless, see below** |
| cold load → Comparator (default tab) | **316 KB gzip**, 10 chunks |
| cold load → Power-Up Optimizer | 366 KB gzip, 16 chunks |
| cold load → Roster | 301 KB gzip, 9 chunks |
| species-bearing chunk `_urlUtils-*.js` | 233 KB gzip |

**Two findings that change the plan, both recorded above where they apply:**

1. **The worker chunk does NOT appear in `dist/.vite/manifest.json`.** The filename-glob fallback
   (`/^rosterPlanner\.worker-.*\.js$/` over `dist/assets`) is required, not optional.
2. **Guard 2's assertion #3 was broken as originally written** — see the ⚠️ under Guard 2. The entry
   has no static imports; the species chunk hangs off the *view* chunks. Measuring the entry's
   static closure would have produced a guard that passes forever while the payload regresses
   freely.

Still to confirm before Stage 1: that `diff-normalized.mjs` (dispatches on filename at ~`:320`/
`:351`) tolerates two new files in `data/normalized/` without crashing or emitting a useless
full-file diff.

### Stage 1 — dedup only, still synchronous (ships ~90 KB gzip on its own)
1. `scripts/sync-data.ts` (write block ~line 3192): keep `species.json` **exactly as today** —
   canonical, pretty-printed, every existing script and golden test untouched — and additionally
   write `speciesCore.json` and `speciesMoves.json`
   (`{fastMoves: Record<id,FastMove>, chargedMoves: Record<id,ChargedMove>, bySpecies: Record<speciesId,{f:string[],c:string[]}>}`).
   The derivation **must assert** every `(kind,id)` maps to structurally identical JSON across all
   species and **throw the sync** if not. True today (308 ids, 0 conflicts) — it is the precondition
   for the whole dedup and must be re-checked every sync, never assumed.
2. New `scripts/check-species-split.mjs` in `npm run check`: re-join the two derived files and
   assert deep equality with `species.json`, making staleness mechanically impossible.
3. `registry.ts`: swap the `species.json` import for the two derived files (both still **static**),
   add `fillSpeciesMoves(registry, payload)` beside `resolveEvolutions`, call it from
   `buildRegistry()`. Type the payload via an explicit interface and cast — do not let TS infer a
   274 KB literal. Mind `noUncheckedIndexedAccess`: `dict[id]` is `Move | undefined`; skip-and-continue
   on a miss, matching `resolveEvolutions`' existing degrade-rather-than-crash convention.

**Verify:** `npm run verify:full`; `registry.test.ts` (12 specs) and `run.smoke.test.ts` (19
assertions) both exercise the real committed dataset and must pass unchanged. Run
`check-bundle-split.mjs` manually and confirm the entry closure dropped ~90 KB gzip. **Commit here.**

> **Rejected alternative:** deriving the split at build time into a gitignored directory to avoid
> ~991 KB of committed duplication. A fresh clone's `npm test` would then fail until a build had
> run, and it breaks the tsx CLI path entirely. The join checker makes committed duplication safe;
> a missing build artifact is not.

### Stage 2 — make the moves payload dynamic
Convert to a memoized `ensureSpeciesMovesLoaded()` with a module-scope eager kick-off; add
`speciesMovesReady.ts`; add the single `App.tsx` gate; add `packages/web/vitest.config.ts`
`setupFiles` → `src/testSetup.ts` with a top-level `await ensureSpeciesMovesLoaded()` (**globally,
not per-file** — 9 test files import the registry and a tenth will forget); add one top-level await
in `scripts/run-scenario.ts`.

**Verify:** `npm run verify:full`, then `npm run build --workspace=packages/web && node
scripts/check-bundle-split.mjs` — moves chunk reachable only via `dynamicImports`, worker chunk not
grown, entry closure ≈195 KB gzip. **Then load the built site and click every tab**: the gate is UI
behaviour and this repo has no component-test suite by deliberate policy.

### Stage 3 — make the Shape C sites loud
`assertSpeciesMovesLoaded("<caller>")` at the top of the 9 `run*Scenario` entry points **and**
`import/pokeGenieMatch.ts`'s entry point. ~10 one-line additions converting every silent-degrade
site into a thrown error naming the caller. Add the never-mutate-a-shared-move warning to
`fillSpeciesMoves`. Add one unit test that calls a `run*Scenario` against an unfilled registry and
asserts it throws — otherwise the asserts are untested code.

⚠️ **Ship `pokeGenieMatch`'s assert WITH Stage 2, not after.** A CSV import during the broken window
writes null move ids into localStorage, and **that corruption survives the fix**.

### Stage 4 — mechanize the guards
ESLint worker block; `check-bundle-split` appended to `verify` after the build with pinned budgets
and the measured values/date in a comment; `IDEAS.md` #26 → Shipped with final numbers;
`CLAUDE.md`'s worker note gains "enforced by `eslint.config.js` and `scripts/check-bundle-split.mjs`";
`HANDOFF.md` per `close-session`.

**Verify:** `verify:full` from clean, then **deliberately break each guard once** (make the worker
import `registry.js`; change the dynamic `import()` to static) and confirm each fails. An unfalsified
guard is not a guard.

---

## 5. Risk

**Where the existing suites catch a regression:** `run.smoke.test.ts` (19 move refs against the real
registry and each tab's real defaults) is the highest-value net; `registry.test.ts` catches a
mis-joined registry; `comparison.ts:426/436` already throw on the mainline simulate path; the
scripts suite still guards the untouched canonical `species.json`; Playwright (33 specs) exercises
the real dynamic-import path under the real `base`.

**Where they miss:**

- **They cannot see bytes.** Every test passes identically whether `species.json` is bundled once,
  twice, or statically. The entire saving can evaporate with a green suite. `check-bundle-split.mjs`
  is the *only* thing that would notice — non-optional, and must be falsified in Stage 4.
- **No component tests, by policy.** The Stage-2 gate is verified only by Playwright and by hand.
  Budget real browser time.
- **Shape C sites are invisible to every suite** until Stage 3 exists.
- **The CSV import path is the worst case and is untested end-to-end.**
- `noUncheckedIndexedAccess` will surface real nullability at the join — handle it, don't `!`-assert.
- TS literal-type inference over a 274 KB JSON could slow `typecheck:web`; cast through an explicit
  interface and check wall time in Stage 1.

**What would justify NOT doing this:**

1. **If the dedup precondition ever fails** — a future sync emitting two different objects for one
   move id. The deferred chunk reverts to ~119 KB, the total-bytes win vanishes, and only the
   marginal deferral trade remains. Stage 1's assert makes this a loud sync failure. **If it fires,
   stop and re-evaluate rather than working around it.**
2. **If Stage 1 alone is enough.** 322 → 237 KB for a build-time reshape with zero async, zero
   gating, zero worker risk and no new failure modes is an excellent trade. Stage 2 buys a further
   42 KB at the cost of an async gate, a loading state, an error path, a test-setup file, a CLI
   await and a permanently mechanized bundle checker. That is a *fair* trade, not an obvious one.
   **Shipping Stage 1 and parking Stage 2 is a legitimate outcome**, and the staging exists so that
   call can be made with real numbers rather than in advance.
3. **If `check-bundle-split.mjs` cannot be made reliable.** Without an empirical byte guard, Stage
   2's saving is unprotected and will silently regress — paying all the complexity for a benefit
   nothing can confirm still exists. Do not ship Stage 2 without Guard 2 working *and* falsified.

---

## Critical files

- `packages/web/src/registry.ts` — the join, the new API, the eager kick-off
- `packages/web/src/App.tsx` — the single gate
- `scripts/sync-data.ts` — the derived-file writes and the conflict assert
- `packages/web/vite.config.ts` — `build.manifest: true`
- `packages/web/src/rosterPlanner.worker.ts` — **read-only reference. Must remain unchanged; it is
  the constraint, not a target.**
