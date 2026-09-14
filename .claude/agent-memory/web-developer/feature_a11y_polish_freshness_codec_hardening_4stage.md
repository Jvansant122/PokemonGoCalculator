---
name: feature-a11y-polish-freshness-codec-hardening-4stage
description: Stage 1-4 pass (tablist ARIA, skip link, reduced-motion, prose measure, ranking-flip focal point, raid freshness note, 5 web codec decode hardening) — two parent-agent claims that didn't hold up on re-verification, one real cross-checker collision found and fixed, one genuine scope call
metadata:
  type: feedback
---

Four-stage queued task (accessibility / visual polish / raid-freshness indicator / codec
hardening), all four shipped in one pass, `npm run verify:full` green at the end. HEAD was
`26079b8`. Full detail below; the durable lessons are the two "reproduce the claim, don't trust
it" findings and the cross-checker regex collision — those will recur.

**Two of the parent's specific measured claims did NOT hold up on live re-verification — always
re-measure before implementing, per [[feedback_reproduce_agent_measurements]] (user's own
memory).** (1) "9 SVGs with no title/role/aria-hidden" — false for current HEAD. A live Playwright
accessibility-tree query on the Comparator (default) tab found all 21 rendered `<svg>` elements
already correctly labeled: 4 chart components (`DamageOverTimeChart`/`DodgeExecutionErrorBand`/
`SensitivityView`'s `FlipBar`/`TeamDamageChart`) already carry `role="img"` + `aria-label`, the
masthead wordmark sits inside an `aria-hidden="true"` span, and `WeatherSelect`'s icon already has
`aria-hidden="true"`. This was evidently fixed in an earlier session not reflected in the parent's
audit. Did NOT touch any SVG this pass. (2) "at 1920px `main` runs the full 1905px" — also false:
`.app` has had `max-width: 1100px` since commit `050db2c7` (2026-09-04), ten days before this
task. BUT a narrower, real version of the same underlying complaint WAS true: measuring actual
rendered prose blocks (`.caveats`/`.note-block`/`.prose-details > p`, all EXPANDED via
`details.open=true` first — collapsed content has zero rendered lines) at 1920px showed 83-98
characters per line despite already having `max-width: 70-78ch` set. Root cause: CSS `ch` tracks
the "0" glyph's width, which in Inter is noticeably WIDER than this prose's actual average
character (mixed-case + spaces) — so a nominal 78ch cap was rendering as ~90 real characters.
Fixed by measuring, not guessing: scaled `.caveats` 78ch→62ch, `.note-block`/`.prose-details > p`
70ch→56ch, re-measured live, landed in 35-79 chars (mostly 49-70). Never touched `.app`'s own
max-width — it needed no shell-level change, the prose-column classes did.

**Investigating the SVG/width claims accidentally surfaced a real, unrelated, more serious bug —
a standing-decision violation, found via a Tab-key trace, not visual inspection.** Pressing Tab
from a fresh page load landed inside a `<details>` (the Assumptions panel) skipping right past it
— tracing why led to `AssumptionPanel.tsx:458` and all five sibling `CollapsibleSection`
wrappers (`AttackDefenseBreakpointsView.tsx`/`IvBreakpointsAssumptionPanel.tsx`/
`PowerUpOptimizerAssumptionPanel.tsx`/`SpeciesReportView.tsx`/`TeamAssumptionPanel.tsx`) being
`defaultOpen={false}` — directly contradicting CLAUDE.md's "Assumptions are always visible...
never behind a collapsed panel" AND this project's own `feature_collapsible_sections.md` memory
("Defaults chosen: Assumptions ... = open"). Traced via `git log -S` to commit `c059039`
(2026-09-10, "user feedback batch"), which DELIBERATELY flipped all six from open to
`defaultOpen={false}` as a scroll-height reduction, with 5 e2e spec files
(`multi-raid.spec.ts`/`roster.spec.ts`/`share-link.spec.ts`/`lineup-builder.spec.ts`) built around
an `expandAssumptions()` helper that assumes collapsed-by-default. **This is a genuine, dated,
tested product decision that CLAUDE.md's prose was never updated to reflect — not a bug.**
Initially flipped all 6 back to `defaultOpen`, then reverted after finding the e2e evidence — do
NOT "fix" this again without the user/overseer explicitly resolving the CLAUDE.md-vs-shipped-
behavior conflict; flag it, don't silently pick a side. (One clumsy moment: my first revert edit
for `TeamAssumptionPanel.tsx` used a stale `old_string` matching the ALREADY-flipped `defaultOpen`
bare form, so the Edit tool correctly no-op'd with "old_string and new_string are identical" —
caught immediately via a follow-up grep across all 6 files before moving on, no bad state shipped.)

**A skip-link + roving-tabindex verification hit a real CDP/Playwright quirk, not a real bug —
don't trust the very FIRST synthetic `page.keyboard.press('Tab')` after a fresh `page.goto()`.**
On a totally fresh page load (no prior click/focus), the first Tab press (via both
`page.keyboard.press` and raw CDP `Input.dispatchKeyEvent`) jumped straight into page content
(a `<summary>` several DOM nodes past the skip link and the first nav button), skipping both
entirely — looked exactly like "skip link isn't focusable." Isolated with a minimal `setContent`
repro (worked correctly there) and then by explicitly `.focus()`-ing the skip link first before
pressing Tab (worked correctly from that point on, hit skip-link → active tab button → next
focusable in the expected DOM order). Conclusion: some Chromium/CDP-specific "very first
synthetic Tab on a totally untouched page" artifact, not a product defect — a real user's first
Tab always starts from *some* browser-chrome-adjacent focus state, not this specific harness
quirk. If a similar "first Tab press lands somewhere weird" result recurs, explicitly `.focus()` a
known element first before trusting the sequence.

**A `check-raid-history-sources.mjs` false FAIL, caused by my own new code, not a real
regression — the checker's `source:` union detector is a naive regex, first-match-wins.**
Added `registry.ts`'s new `raidDataFreshness()` / `RaidDataFreshness` interface (for
`RaidFreshnessNote.tsx`, see below) with its OWN `source: "scrapedduck" | "fallback-file" |
"fallback-file-created-empty"` field, declared EARLY in the file (right after the imports, before
`RawRaidHistoryEntry`). `check-raid-history-sources.mjs` locates `RawRaidHistoryEntry.source`'s
real 5-value union via `registrySrc.match(/source:\s*((?:"[^"]+"\s*\|\s*)*"[^"]+")\s*;/)` — a
non-global regex that returns only the FIRST match in the whole file. My new field, appearing
earlier, silently became the "declared" union instead, and the checker correctly (from its own
narrow perspective) reported all 5 real raid-history sources as unknown. Fix: moved the entire
`RaidDataFreshness`/`NORMALIZED_META`/`raidDataFreshness()` block to AFTER
`speciesRegistry = buildRegistry()` (i.e. after `RawRaidHistoryEntry`'s own block), restoring the
regex's first-match to the real union. **Lesson: any new interface/const containing a field
literally named `source` with a small string-literal union, added to `registry.ts` BEFORE
`RawRaidHistoryEntry`, will silently break this specific checker — check `npm run
check-raid-history-sources` (not just typecheck/lint/test) after any registry.ts edit that adds a
`source` field, and place it after `RawRaidHistoryEntry` if physically adjacent naming collides.**
This was caught only because `npm run verify:full` runs the full `check` script (this exact
checker), NOT by `test:web`/`typecheck`/`lint`, none of which touch it — a scoped `npx tsc -b` +
`npm run lint` pass alone would have shipped this silently.

**Stage 1 (accessibility) implementation, once the two claims above were separated from what was
real:** `App.tsx`'s `.tab-switcher` gained full ARIA tabs-pattern compliance — a `TAB_ORDER: AppTab[]`
array (replacing 7 near-duplicated JSX button blocks with one `.map()`), `id`/`aria-controls` on
each `role="tab"` button pointing at a SINGLE `<main role="tabpanel" id aria-labelledby>` wrapper
(swaps its id/aria-labelledby as `tab` changes rather than mounting 7 panel elements — deliberately
declared in `App.tsx` itself, NOT inside the lazy-loaded chunk, so `aria-controls`/the skip link's
target always resolve even before `Suspense` resolves), roving tabindex (`tabIndex={tab===id?0:-1}`)
with an `onKeyDown` handler on the `<nav>` for ArrowLeft/ArrowRight (wrapping)/Home/End that both
moves state AND refocuses the newly-active button via `requestAnimationFrame` (state update must
commit before the new tabIndex=0 button is focusable), and a visually-hidden-until-focused skip
link (`.visually-hidden` base + a new `.skip-link:focus` override in `styles.css`, `position: fixed`
+ `z-index: 60` to clear the sticky nav's `z-index: 30`) whose `href` is computed per-render
(`#${tabPanelId(tab)}`) so it always targets whichever tab is actually active. All verified live via
Playwright: `role="tabpanel"` count 1→correct id/aria-labelledby pairing, arrow-key sequence
(Right→Right→End→Home→wrapping-Left) all landed on the expected tab with the panel's id/aria-
labelledby/rendered `<h1>` all agreeing, skip-link direct-focus→Tab→lands on the active tab
button→Tab→lands on the next real focusable control in DOM order.

**Stage 2 (visual polish):** `prefers-reduced-motion` block added (collapses the file's 6
`transition:` rules + `TabLoadingBar`'s infinite sweep `@keyframes` to `0.01ms` via `!important` —
deliberate, the one place in the file meant to unconditionally beat every component-specific
declaration). Ranking-flip callout (`.crossover-note--flip`) promoted from same-weight-as-`--steady`
to genuinely louder: 5px left border (was 4px), a soft `--good`-tinted glow shadow layered onto the
existing `--shadow-1`, `font-size` 0.98rem→1.05rem + `font-weight: 550`, and the "Ranking flip" label
promoted from plain uppercase text to a pill badge (`border-radius: 999px`, tinted background) —
`.crossover-note--steady` deliberately untouched (a steady result isn't a flip, shouldn't look like
one). Hero-number treatment (`.stat-tile-headline`/`.stat-tile-value`/`.stat-tile-unit`) — already
built and used by 3 of 4 `.result-card`-shaped components (`ComparatorView`/
`SingleRaidResultsSection`/`TeamRaidView`) — extended to the 4th real gap found by auditing every
`.result-card` call site: `LineupBuilderPanel.tsx`'s `LineupStats` (Team DPS pulled out as the hero,
clear-rate/mean-time-to-clear stay in the supporting `dl`); the other `.result-card` sites
(`MultiRaidResultsSection`/`PowerUpOptimizerView`/`RosterImportPanel`) are genuinely multi-stat
metadata blocks with no single obvious headline and were deliberately left alone. Live-verified via
screenshot (1400x1100/1400x1400): hero DPS numbers read clearly, the "RANKING FLIP" pill is visibly
the focal point below the chart, 375px viewport shows zero horizontal overflow and zero console
errors.

**Stage 3 (raid-freshness indicator):** `data/normalized/_meta.json` (shipped `21afd1b`, unread until
now) surfaced via a new `raidDataFreshness()` accessor in `registry.ts` (bundled at build time, same
convention as every other JSON import there) and a new shared `RaidFreshnessNote.tsx`. Copy branches
on `source` (not just `fetchedAt`), per the task's explicit ask to distinguish "nobody's synced in a
while" from "the upstream feed was down": `"scrapedduck"` → plain muted "Raid data as of {date}"
(healthy case, no color escalation); `"fallback-file"` → `--caution` amber, names BOTH `writtenAt`
(when the sync last ran) and the older `fetchedAt` (what the roster is actually current as of) so the
two numbers' gap itself communicates staleness; `"fallback-file-created-empty"` → `--warn` red,
explicit "may be missing entries, not just stale." Mounted at the two genuinely LIST-shaped
"currently-active raid" surfaces — `SpeciesReportView.tsx` (its own boss sweep) and
`BossSetPanel.tsx` (Power-Up Optimizer multi-raid's boss-set filter panel) — deliberately NOT
threaded into the other four tabs' boss/target `SpeciesPicker` dropdowns, which surface the same
underlying roster but as a searchable combobox option list a user scrolls through, not a displayed
"here is the active-raid list" the task's wording ("where a user reads an active-raid list") points
at. Live-verified both mount points render the correct copy; needed the SAME `getByRole("heading",
{name:"Assumptions"}).locator("xpath=ancestor::details[1]")` trick e2e already uses to open a
collapsed-by-default Assumptions panel before either mount point (nested inside it) becomes visible
in the DOM query sense — see [[feature_collapsible_sections]]'s existing xpath-locator note, this is
the SAME gotcha, just hit via a hand-rolled Playwright script instead of a `.spec.ts` file this time.
`CollapsibleSection`'s `<details>` has NO `id` DOM attribute (the `id` prop is ONLY a localStorage
key, see `readCollapsibleOpen`) — `document.getElementById(id)` silently returns `null`; always use
the heading-then-ancestor-xpath approach instead when scripting against a collapsible section.

**Stage 4 (codec hardening), by far the largest stage:** mirrored `957999d`'s engine pattern
(`decodeScenarioWithDiagnostics`/`sanitizeKnownFields`/`tryParseJsonObject` from
`scenarioValidation.ts`, all already re-exported via the engine's `index.ts`) across the five
WEB-owned codecs. New `webScenarioValidation.ts` holds ONLY what's genuinely web-specific: enum
guards for types the engine declares but never guards (`FriendshipLevel` — derived from
`FRIENDSHIP_ATTACK_BONUS_MULTIPLIER`'s own keys so a new tier is auto-accepted, not a second
hardcoded list; `BossChargedMoveCadence`; `RosterSignificanceMode` — the engine's
`scenarioValidation.ts` only guards fields `Scenario`/`TeamScenario` themselves declare, and none of
these three are on either), a generic `isLiteralUnion<T>(allowed)` for every web-owned string/numeric
enum (`SpeciesReportSortMode`/`AttackDefenseBreakpointsMode`/`PowerUpOptimizerMode`/`PowerUpRankBy`/
`RosterSortBy`/the `20|25` hypothetical-catch level), a dictionary-shape guard
`isCandyByFamilyIdMap` (rejects the WHOLE map on one bad entry — no partial-dictionary salvage,
matching the project's "half-restored looking whole" rule), and a generalized
`sanitizeObjectArray<T>` mirroring `teamScenario.ts`'s own `sanitizeSlots` — but WITHOUT its "exact
length or reject the whole array" gate, since none of the five web scenarios' array fields
(`PowerUpOptimizerScenario.slots`/`.multiRaidHypotheticalCatches`) carry `TeamScenario.slots`'s
"array length IS the fight-order position" constraint, and each view's own `scenarioToAssumptions`
already pads/truncates defensively downstream regardless. `PowerUpOptimizerScenario` was the real
test of scale: 32 scalar/tuple/object top-level fields via one `sanitizeKnownFields` call
(`Omit<PowerUpOptimizerScenario, "slots"|"multiRaidHypotheticalCatches">`) plus the two array fields
destructured out and run through `sanitizeObjectArray` separately, `rejectedFields` from all three
concatenated — 33 new unit tests in `scenarioDecodeHardening.test.ts` (mirroring
`packages/engine/test/scenario.test.ts`'s own case list: invalid base64→null, valid-base64-non-JSON→
null, non-object JSON→null, wrong-shape object→clean empty decode, wrong-typed field dropped +
siblings survive, invalid enum dropped, valid scenario zero-rejected, extra unrecognized key
preserved, PLUS PowerUpOptimizer-specific: one bad slot field costs only that field not the other 5
slots, a non-array `slots` rejects cleanly instead of throwing on `.map`, a malformed
`candyByFamilyId` drops as a whole, one bad `multiRaidHypotheticalCatches` entry costs only itself).

**A real, narrower residual crash path found and PARTIALLY fixed, PARTIALLY left as a documented,
pre-existing, accepted gap — don't chase this further without being asked.** Even after full codec
hardening, a payload that's valid JSON + a valid plain object but carries NONE of a scenario's real
fields (e.g. `{"foo":"bar"}`) still decodes CLEANLY at the codec layer (every field `undefined`,
zero throw) but then crashes inside the VIEW's own `scenarioToAssumptions` — several required-field
accesses there have no `?.`/`??` guard (`s.ivs.attack`, `s.slots.map(...)`, `s.dodgeModel.kind`,
etc.), because those fields were TS-required and, pre-hardening, any malformed payload always threw
BEFORE reaching this code, so no one needed to guard them. Confirmed this exact gap ALREADY EXISTS,
UNFIXED, in the engine-owned `ComparatorView.tsx`'s `scenarioToAssumptions` (`s.ivs.attack`, no `?.`)
— i.e. this is the accepted pattern from the ORIGINAL `957999d` hardening work, not something this
pass introduced. Fixed the ONE cheap, in-scope instance (`s.slots.map` → `(s.slots ?? []).map` in
`powerUpOptimizerScenario.ts`, a file I already fully owned this pass) since it was a one-line,
zero-risk win; deliberately did NOT audit/patch the other required-field accesses across
`SpeciesReportView.tsx`/`IvBreakpointsView.tsx`/`AttackDefenseBreakpointsView.tsx`'s own
`scenarioToAssumptions` functions, since that's VIEW-layer work outside "harden the five CODECS"
and mirrors an accepted precedent rather than a regression. `TabErrorBoundary` (added `ead5a2a`)
already catches every one of these gracefully — crash fallback with the copyable URL, never a blank
page — so the residual risk is bounded, not silent. Flagged plainly in the final report as a
possible, larger, separate follow-up task if the user wants full closure.

**A REAL e2e regression from the hardening itself, caught only by the full `npm run verify:full`
(not by `test:web`/`typecheck`/`lint`/`check` individually) — `error-boundary.spec.ts`'s two
`pu=garbage` tests.** `?pu=garbage` was the SPECIFIC crash repro cited in the file's own top doc
comment and both failing tests — pre-hardening, "garbage" (syntactically valid base64 alphabet,
decodes to bytes that aren't valid JSON) threw inside a bare `JSON.parse`. Post-hardening it's
EXACTLY the "valid base64, invalid JSON" case `tryParseJsonObject` is designed to catch and return
`null` for — so the tab now gracefully falls back to defaults instead of crashing, which is the
INTENDED improvement, but it broke both tests that asserted the OLD crash-fallback behavior for that
exact input. Fixed by: (1) swapping both tests' payload to the SAME `eyJmb28iOiJiYXIifQ` (base64url
of `{"foo":"bar"}`) the sibling Comparator test already uses — this is the narrower "wrong-shape
object" case from the finding above, which genuinely STILL crashes (see that finding), so the tests
keep proving TabErrorBoundary actually works; (2) ADDING a new passing test that explicitly locks in
the improvement (`?pu=garbage` now shows NO crash fallback, loads the real "Baseline — roster as-is"
heading instead) rather than just quietly deleting the old assertion; (3) rewriting the file's top
doc comment to explain the 2026-09-14 narrowing rather than leaving it describing the old, now-false
"every malformed param throws" blanket claim. **Lesson: when hardening a decoder to degrade instead
of throw, grep `e2e/` for the exact malformed-payload literal (`grep -rn "garbage\|not%20valid"
e2e/`) BEFORE calling the codec work done — a scoped `test:web`/`typecheck`/`lint`/`check` pass gives
zero signal that a Playwright spec is pinned to the OLD throw behavior; only the full e2e run (or
this grep) catches it.**
