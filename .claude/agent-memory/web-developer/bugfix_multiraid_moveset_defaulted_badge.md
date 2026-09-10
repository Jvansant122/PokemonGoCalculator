---
name: bugfix-multiraid-moveset-defaulted-badge
description: Fixed 2026-09-10 - multi-raid Power-Up Optimizer's guessed-moveset state was visible only in the import table, never on the ranked/benched/never-competitive result rows it actually drove
metadata:
  type: feedback
---

## The bug and the fix

`pokeGenieMatch.ts`'s `RosterEntry.movesetIsDefaulted` (and `unmatchedMoveNames`) was
rendered ONLY in `RosterImportPanel.tsx`'s own table — never joined onto the multi-raid
result rows (`RosterPowerUpCandidate`/`RosterNeverCompetitiveEntry`/`RosterBudgetStep`, all
`packages/engine/src/rosterPlanner.ts` types) that actually RECOMMEND spending real stardust.
Confirmed live: Rayquaza (191,000 stardust) and Toxtricity (103,000 stardust) both carried a
fully-guessed moveset with zero signal anywhere near the number.

Took **route 1 (web-only join)**, exactly as the task suggested, but with a nuance worth
remembering: "web-only join" does NOT mean "only reuse pre-existing fields" — it means "never
touch the ENGINE's own result type." `pokeGenieMatch.ts`'s `RosterEntry` is itself a WEB-owned
type (Phase 1 of the roster-optimizer plan, nothing to do with `packages/engine`), so it was
fully in-scope to EXTEND it with 4 new fields the join actually needed:
`fastMoveIsDefaulted`/`chargedMoveIsDefaulted` (booleans) plus
`fastMoveUnmatchedName`/`chargedMoveUnmatchedName` (nullable strings, non-null only when a name
was present but didn't resolve). **The pre-existing `movesetIsDefaulted` + `unmatchedMoveNames`
pair is genuinely ambiguous** for "both moves defaulted, exactly one raw name was unrecognized" —
`unmatchedMoveNames.length === 1` can't say WHICH slot that name came from. Don't try to recover
per-slot detail from the combined pair; store it per-slot at the source (`buildRosterEntry`)
instead.

## Extending a type that's fixture-built in 5 other test files

Adding 4 REQUIRED fields to `RosterEntry` broke `tsc` in **5 files I hadn't opened**:
`rosterCandidateDedupe.test.ts`, `rosterPool.test.ts` (`fakeEntry`), `run/run.smoke.test.ts`
(TWO inline pool builders), `run/runRosterPlanner.test.ts` (`fakeImportedEntry`) — on top of the
2 files I meant to touch (`pokeGenieMatch.ts` itself, `rosterPool.ts`'s
`StoredRosterEntry`/dehydrate/hydrate). **The `post-edit.mjs` hook's `tsc --noEmit` output after
each edit was the complete, authoritative list** — just kept fixing until it went quiet, never
had to manually grep for fixture builders. **How to apply:** before hand-searching for "who else
builds this type," just make the interface change and let the hook enumerate every call site;
it's faster and can't miss one.

`rosterPool.ts`'s `hydrateRosterEntry` needed `stored.fastMoveIsDefaulted ?? false` /
`?? null`, not a bare passthrough, even though `StoredRosterEntry`'s own field types are
"required" — a pool already sitting in a user's localStorage from before this change won't carry
these keys at all, and TS's static requiredness doesn't survive `JSON.parse` any more than a
`Scenario` field does on an old share link (same CLAUDE.md-documented pattern, just applied to
`localStorage` instead of a URL). Didn't bump `ROSTER_POOL_SCHEMA_VERSION` — that would have
WIPED an old stored roster outright (`normalizeParsedPool` treats a version mismatch as
"start empty"), a worse outcome than an old cached entry just not showing the new badge until
re-imported.

## Badge design

Reused `.badge-approximate` (zero new CSS) for all 6 label variants — the task explicitly asked
to reuse vocabulary, and "we guessed because no better data existed" is exactly what that badge
already means (`"candy unverified"`/`"approx level"`/`"approx IVs"` are the same class). Six
labels from a 2×2-ish decision (both-defaulted vs. one-defaulted) × (any-unrecognized vs.
all-blank): `"default moveset"` / `"moveset not recognized"` / `"default fast move"` /
`"fast move not recognized"` / `"default charged move"` / `"charged move not recognized"` — full
per-slot detail (which move, blank-vs-unrecognized, which move this tool assumed instead) lives
in the `title` tooltip, never the label itself. Extracted the whole decision into a standalone
`rosterMovesetBadge.ts` (pure function, narrow structural param type — not the full
`SpeciesDefinition` — so its own test builds a 4-line fixture, no registry needed) rather than
inlining it in the already-2180-line `PowerUpOptimizerView.tsx`. Built the `entryId -> badge` map
via `useMemo` right next to the pre-existing `entryIdentities` map (identical shape/pattern,
just a second lookup) — reuse the established "map once from hydratedPool, join by entryId at
each render site" convention rather than inventing a new one.

**Scope call, stated explicitly so it doesn't read as silent creep:** the task named 3 surfaces
(ranked candidates, benched, never-competitive). Also wired the SAME map into the budget-plan
"Steps" table (`MultiRaidBudgetStepRow`) and got "Excluded from this plan" for free (it shares
`ExcludedEntriesTable` with "Never competitive" — one optional prop addition covered both
call sites at once). Reasoning: a committed spend step is at least as much "a row that recommends
an action" as a ranked candidate is, and the marginal cost was one more prop thread, not a new
component.

## Two real Playwright gotchas found while verifying (multi-raid Power-Up Optimizer specifically)

**`PowerUpOptimizerAssumptionPanel.tsx` ALSO renders a `table.time-series-table`** — the
per-family candy editor — which can innocently contain the exact same species name text (e.g.
"Rayquaza") as a row in the results table, and renders EARLIER in DOM order (it's in the
Assumptions panel, above the results). A naive
`page.locator("table.time-series-table tbody tr", {hasText: "Rayquaza"}).first()` silently grabs
the candy-editor row instead (near-empty innerText — Chromium inserts a literal TAB between
`<td>`s, so a 3-cell "species label + 2 number inputs" row prints as `"Rayquaza\t\t"`, which is
the actual tell if this happens again). Fix: scope to "the table immediately following a specific
heading" via `xpath=//*[self::h2 or self::h3][contains(normalize-space(.), "Ranked
candidates")]/following::table[1]` rather than a bare class selector. **How to apply:** any view
with more than one `.time-series-table` on screen at once needs a heading-scoped table locator,
not a bare class one, in any future Playwright script against it.

**A bare `text=` wait can resolve against the WRONG one of two independently-finishing async
sections.** The ranked-sweep and fixed-budget-plan sections both render their own "computed
off/on the main thread" text from the SAME click, but finish at different times (budget plan is
consistently slower — matches `feature_power_up_optimizer_fixed_budget_plan.md`'s own measured
gap). Waiting on `text=/computed (off|on) the main thread/` without scoping can resolve on the
FASTER section while the slower one (or even the same section's own table rows) hasn't repainted
yet — one run genuinely read 0 rows in the ranked table a few hundred ms after that text appeared.
Fixed with an extra explicit wait plus a real row-count check before trusting the DOM, not just a
longer fixed sleep. Confirmed [[feature_multi_raid_roster_optimizer_phase3a]]'s "no fake
percentage, just running/done/failed" design is the reason this couldn't be waited on more
precisely from outside — there's no single one-shot "both are done" signal, so a verification
script over multi-raid results should always double-check with content, not just a status string.

Reconfirms [[feature_species_report_type_rank_readability]]'s "`CollapsibleSection`'s `id` is NOT
a DOM `id`" finding — used `page.locator("summary", {hasText: ...})` / role-based heading
locators to expand sections, never `#id`.

## Verification

Live dev server (already running on :5173) driven via a scratch Playwright script inside
`packages/web/` (created, run, screenshotted, deleted — same pattern as every prior session's
own scratch-e2e proof). Imported the repo's own `import/test/pokeGenieSample.csv`, switched to
multi-raid mode, ran a real sweep against today's live boss set: **Rayquaza's row showed
191,000 stardust with a "default moveset" badge titled "...assumed Air Slash. ...assumed
Outrage." and Toxtricity's showed 103,000 stardust with "...assumed Acid. ...assumed Acid
Spray."** — exact dollar-for-dollar match to the bug report's own numbers, confirming this is
the identical scenario, not a coincidentally similar one. Bonus real-world proof of the OTHER two
cases, found unprompted in the same sweep: Dialga's row read "default charged move" (blank,
partial) and Raticate (Alola)'s read "charged move not recognized" (the real "Return" case,
partial+unrecognized) — every one of the three distinctions the task asked for showed up
correctly in one real run, not just in unit tests. Screenshots at 1920×1080 confirmed badges wrap
cleanly onto their own line under the IV caveat text with no column overflow or broken layout.
Zero console/page errors throughout. `npm run test:web` (205/205, 22 files), `npm run typecheck`
(all 3 packages), `npm run lint` (0 errors, the 1 pre-existing `SpeciesPicker.tsx` warning
untouched), and `npm run check-scenario-roundtrip` (114/114 — the +1 over this task's stated
113-field baseline is a concurrent, unrelated session's `showDetailedAssumptions` field, confirmed
via `git status --porcelain`: `powerUpOptimizerScenario.ts` wasn't even in this session's modified
file list) all green. Reconfirms [[feedback_concurrent_sessions_shared_worktree]] yet again — a
~9-file unrelated concurrent diff (data resync, Super Max moves, a new Comparator toggle) was
sitting in the same tree throughout this task and never touched.
