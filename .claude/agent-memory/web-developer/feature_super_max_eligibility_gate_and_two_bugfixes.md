---
name: feature-super-max-eligibility-gate-and-two-bugfixes
description: Three independent UI fixes (2026-09-10) — megaLevelSelect.tsx gates Super Max on canReachSuperMax (3-way eligible/ineligible/unknown, stale-value-kept-but-relabelled), IvSweepReport.tsx got the prose-details relocation IV Breakpoints had missed, SpeciesPicker.tsx select-all-on-focus — plus a real e2e break found+fixed and a concurrent-session test failure correctly NOT fixed
metadata:
  type: feedback
---

Three independently-scoped fixes in one session, done while a separate concurrent agent was
mid-edit (354 uncommitted lines) in `TeamRaidView.tsx`/`PowerUpOptimizerView.tsx`/
`PowerUpOptimizerAssumptionPanel.tsx`/`rosterPool.ts` — none of those four touched.

**Fix 1, Super Max eligibility gate (`megaLevelSelect.tsx`).** Engine's `canReachSuperMax(species)`
already existed (checks for an `isPlusMove` charged move) but was imported nowhere in `packages/web`
— the dropdown offered "Super Max" on every mega regardless, and the engine silently clamped it to
"Max". Fixed with a **3-way** classification, not boolean — `megaLevelEligibility(species):
"eligible" | "ineligible" | "unknown"` (`"unknown"` only for the one `forceVisible` roster-wide
call site, Power-Up Optimizer multi-raid, which passes `species: null` since there's no single
Pokémon to check). `selectableMegaLevels(eligibility, currentValue)` drops `"super-max"` from the
rendered `<option>`s only when `"ineligible"` — **with one deliberate exception: kept in the list
when `currentValue` is ALREADY `"super-max"`** (a stale share-link, or the user switched FROM an
eligible species TO an ineligible one without touching Mega Level — megaLevel is NOT reset on a
species change, unlike the fast/charged move id fields). Dropping it unconditionally would leave a
controlled `<select>`'s `value` matching no rendered `<option>`, which shows a blank/wrong-looking
selection — the engine's own clamp already makes the COMPUTED result correct either way, so this is
purely about not misrepresenting what the stored value actually is. That kept-but-unreachable option
gets relabelled `"Super Max (not reachable here)"` (`megaLevelOptionLabel`) plus a visible (not just
tooltip) `<p className="species-picker-hint">` explaining it computes as Max instead — the ordinary
"why is the option missing" case (nothing stale selected) only gets a `title` tooltip, deliberately
NOT a permanent visible paragraph, since ~39 of 54 released megas are ineligible and a paragraph on
the majority case would fight this project's active decluttering trend
([[feature_caveat_prose_relocation]]). The roster-wide `"unknown"` case always offers the full
4-tier ladder (omitting Super Max would be just as dishonest as forcing it — some roster entries
really can reach it) and gets its own honest note ("Not every mega/primal form in a roster can reach
Super Max...") only when the user actually picks it. All three pure functions
(`megaLevelEligibility`/`selectableMegaLevels`/`megaLevelOptionLabel`) exported + unit-tested in a
new `megaLevelSelect.test.ts` (9 tests) — `canHaveMegaLevel` (the OUTER "does this species even
mega-evolve" gate, `.boost` only) is untouched and stays separate; these are two independent gates
at different layers, same "don't conflate" discipline as `canHaveMegaLevel` vs `hasActiveBoost`
already established in [[feature_mega_level_all_six_tabs]].

**A real e2e break this fix caused, found and fixed correctly (not worked around):**
`share-link.spec.ts`'s "team-raid: a slot's Mega Level survives a shared link round trip" test
picked `"super-max"` on Team Raid's default slot-0 species (`latios-mega`) — which turns out to have
NO "+" move (confirmed via `data/normalized/species.json`, 15 of 61 mega/primal species qualify:
beedrill/houndoom/raichu-x/raichu-y/victreebel/dragonite/malamar/falinks/mewtwo-x/mewtwo-y/starmie/
chesnaught/delphox/greninja/skarmory — all "-mega" suffixed). Once the option was correctly gated
out, `.selectOption("super-max")` timed out (30s) waiting for an option that no longer existed. This
is the EXACT INTENDED CONSEQUENCE of the fix, not a regression to work around — fixed the test itself
(switched to `"high"`, which still proves the identical round-trip mechanism without depending on
species eligibility) rather than touching the new gating logic. **Lesson for any future "add an
eligibility gate to an existing dropdown" task: grep e2e specs for hardcoded option values on that
control BEFORE assuming green — a previously-unconstrained option becoming conditionally-unavailable
will break any test that picked it on a species/slot that happens to be ineligible.**

**Fix 2, IV Breakpoints methodology relocation (`IvSweepReport.tsx`).** The 2026-09-10 caveat-prose-
relocation pass ([[feature_caveat_prose_relocation]]) covered the Assumptions panel but missed this
tab's OWN result panel — its "Impact across every raid target..." section had two open-by-default
`<p className="caveats">` paragraphs ("Outperforms" here means...", "Honest limitation:...", ~90 and
~120 words) sitting directly under the verdict + breakdown table. Applied Species Report's exact
established pattern (`SpeciesReportView.tsx`'s "How ... are actually computed" toggle,
[[feature_species_report_type_rank_readability]]): verdict sentence + table stay visible, both
paragraphs move VERBATIM (word-for-word, including the "Honest limitation" hedge — the task
explicitly warned not to soften it) into one `<details className="prose-details"><summary>How
"outperforms" is scored, and what the tier-4+ restriction excludes</summary>`. Deliberately did
**not** touch `IvPerLevelTable.tsx` — its one paragraph (3 diverging-level counts + "highlighted
below, bolded" convention note) is a live COMPUTED readout tied directly to the table's own visual
highlighting, category 2 in the caveat-prose-relocation classification (stays inline), not category
1 (background/methodology prose that moves). Confirmed live via Playwright: the two paragraphs are
genuinely absent from `.isVisible()` while the nested `<details>` is closed (browsers don't just
visually hide a closed `<details>`'s non-summary children, they produce no box at all — `isVisible()`
correctly reflects this) and reappear verbatim after clicking `<summary>`.

**Fix 3, SpeciesPicker select-all-on-focus (`SpeciesPicker.tsx`).** One-line fix:
`onFocus={(e) => { setOpen(true); e.target.select(); }}` — plain DOM `.select()`, not React state,
so it can't disturb the controlled-input/listbox wiring. Confirmed live (not just read) that this
doesn't regress the existing `onMouseDown preventDefault` trick that keeps the input focused across
an option click (see next paragraph for why that interacts with THIS exact fix), nor the deferred
`onBlur` close, nor keyboard Tab-in-then-type. Left the pre-existing `react-hooks/set-state-in-effect`
lint warning at line 47 (the `useEffect` that syncs `query` from `selected?.label`) completely alone
per the task's own instruction — unrelated code, several lines below my change.

**A genuine, non-obvious interaction discovered while writing my OWN verification script (test-
harness gotcha, not a product bug):** clicking a listbox OPTION does not blur the text input
(SpeciesPicker's own `onMouseDown={(e) => e.preventDefault()}` on each option button exists
specifically to prevent that blur so the click registers before the list unmounts) — which means a
SECOND real click directly on the already-focused input immediately afterward does **not** refire
the DOM `"focus"` event (browsers only fire `focus` on an actual focus transition), so
`.select()` does NOT run a second time and a plain click just repositions the caret without
selecting. This is CORRECT, expected, standard behavior (identical to a browser URL bar: click once
away then back in re-selects, clicking twice while already focused does not) and matches the actual
reported bug's trigger condition exactly (the user's box was NOT already focused when they clicked
in) — nothing to fix here. But any FUTURE Playwright script driving this exact picker repeatedly
needs a genuine blur between picks (click a neutral element first) or every click after the first
silently no-ops the select-all and types get inserted mid-string instead of replacing it — cost
about 10 minutes of confusion (a `getByRole("option", ...)` timeout with no useful error, since the
typed text just never matched anything) before tracing it to this.

**A concurrent-session test failure correctly diagnosed and NOT fixed.** `npm run verify`'s test
step started failing partway through this session on `run.smoke.test.ts`'s
`runPowerUpOptimizerScenario > reports a non-null bestBlockedCandidate...` (`expected null not to be
null`) — reproduced deterministically across 3 separate reruns over several minutes, so not a one-off
flake. Traced conclusively to the OTHER concurrent agent's own in-progress, uncommitted work (NOT
mine): `git status`/`ls -la --time-style=full-iso` showed `PowerUpOptimizerView.tsx`'s mtime landing
at the EXACT moment my first `npm run verify` run started (this test passed cleanly, 214/214, in a
run 10 minutes earlier, BEFORE that mtime), `git diff --stat` on the four off-limits files showed a
genuinely large in-flight change (354 insertions across `PowerUpOptimizerView.tsx`/
`PowerUpOptimizerAssumptionPanel.tsx`/`TeamRaidView.tsx`/`rosterPool.ts`, not a stray unsaved buffer),
and — the most direct proof — `run.smoke.test.ts` imports `DEFAULT_ASSUMPTIONS` **directly** from
`PowerUpOptimizerView.tsx` (line 9: `import { DEFAULT_ASSUMPTIONS as PU_DEFAULTS } from
"../PowerUpOptimizerView.js"`), so ANY concurrent edit to that file's default scenario shape feeds
straight into this exact smoke test regardless of anything else in the repo. Grepped to confirm ZERO
reverse dependency (`PowerUpOptimizerView.tsx` only imports the untouched-by-me `MEGA_LEVEL_HINT`
string constant from `megaLevelSelect.js`, nothing from my new eligibility functions). Did **not**
attempt a `git stash`/`checkout` isolation maneuver on shared tracked files to "prove" this further
once the import-graph grep was conclusive — unnecessary risk to a shared worktree holding someone
else's uncommitted work for a fact already established two independent ways. Ran the rest of the
pipeline (`typecheck`, `lint`, `check`, `build --workspace=packages/web`) standalone, all green, to
get a complete picture around the one unrelated red test rather than reporting a blanket "verify is
red." **Lesson: `run.smoke.test.ts` imports `DEFAULT_ASSUMPTIONS` from all six view files by
design (so run modules stay wired to the same defaults the UI uses) — this makes it a natural
collision point whenever a concurrent session is mid-edit on ANY view file's defaults; check mtimes
and the import line before assuming a smoke-test failure is your own.**

**Verification depth:** `npm run test:web` (214/214 including new `megaLevelSelect.test.ts`),
`tsc --noEmit` x3 clean, `lint` (0 errors, the 1 pre-existing `SpeciesPicker.tsx` warning
unchanged), `check-scenario-roundtrip` unchanged at 114 fields (display-only change, no Scenario
field touched), all 4 checkers green, production build clean. `npm run test:e2e` 14/14 (after fixing
the Mega Level test above). Real live-browser verification via a throwaway Playwright script (NOT
committed, deleted after use) against an isolated `vite preview --port 4211` (two OTHER dev servers
were already running on 5173/5183 from concurrent sessions — checked `netstat` first, same
established discipline as [[feature_caveat_prose_relocation]]'s port-4199 precedent) — 27
assertions, all passing: option-list length/content differs between an eligible species (Mega
Beedrill, 4 options) and an ineligible one (Mega Latios, 3 options); the tooltip text; the
stale-super-max-retained-and-relabelled state reproduced LIVE by switching species (not just
asserted in isolation) AND proven to survive an actual generated share link opened in a fresh page;
the roster-wide `forceVisible` control's full 4-option ladder plus its honest note; the SpeciesPicker
fix's exact reported repro (type "mewtwo" over a focused "Kartana" field, get "mewtwo" not
"Kartanamewtwo", a real Mewtwo match renders); and the IV Breakpoints `prose-details` toggle's
collapsed-by-default / hidden-until-expanded / verbatim-after-expanding behavior. Two screenshots
inspected directly (the stale-Super-Max state, and the expanded IV Breakpoints panel) — visual
match, not just DOM assertions. Zero console/page errors across the whole run.
