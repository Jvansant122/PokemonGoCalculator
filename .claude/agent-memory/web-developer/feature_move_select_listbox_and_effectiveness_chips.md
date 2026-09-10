---
name: feature-move-select-listbox-and-effectiveness-chips
description: Rewriting MoveSelect.tsx from a native <select> into a hand-rolled listbox button so the closed control can hide damage/DPS/energy numbers and show a type-effectiveness indicator instead; the new moveEffectiveness.ts helper; the N-defender chip design; two real bugs found and fixed in-session; a Bash heredoc ceiling distinct from the known tsx one
metadata:
  type: project
---

Built 2026-09-10, display-only (no `Scenario`/`Assumptions` field anywhere — confirmed this
reasoning before skipping add-scenario-assumption, per [[feature_hide_inert_boost_ui_and_move_efficiency_metrics]]'s
same precedent). Touched only `packages/web/src`, per the task's explicit constraint — two other
agents had large concurrent uncommitted WIP in `packages/engine`/`scripts`/`data` all session; never
touched any of it, and `npm run verify` still went fully green at the end (416 engine + 188 web +
194 script tests, all checkers, build) — confirms clean integration without needing to coordinate.

**Route taken: route 1 (hand-rolled listbox button), not route 2 (native select + focus/blur text
swap).** A native `<select>` always renders its selected `<option>`'s own text when closed, so it
structurally cannot show less content collapsed than expanded — route 2's flicker/cross-browser
risk was real, route 1 was the only clean way to satisfy "closed control shows X, open list shows
Y" at all. Followed `SpeciesPicker.tsx`'s general accessibility shape (external `<label>`,
`role="listbox"`/`role="option"`, click-outside-safe option list) but adapted for a BUTTON trigger
instead of a text input, since a move list is short and needs no search/filter — used
`aria-haspopup="listbox"` + `aria-expanded` + `aria-controls` + `aria-activedescendant` on the
`<button>` itself (not a `role="combobox"` on it — kept it a plain button semantically, matches
how several accessible "Select" implementations, e.g. Reach UI's ListboxButton, do it).

**A real design win over SpeciesPicker's own pattern, discovered while reasoning through it, not
copied**: SpeciesPicker's options are real `<button>` elements (focusable), so clicking one would
blur the search input before the click's own handler runs — hence its `onMouseDown={(e) =>
e.preventDefault()}` + a 150ms `setTimeout` on blur to paper over the race. This component's
`<li role="option">` elements are plain, NON-focusable `<li>`s with no `tabIndex` — clicking one
never moves focus at all (the browser's mousedown "focusing steps" only run when the click target
or an ancestor is focusable; here none are, up to the wrapping `<div>`), so the trigger `<button>`
never blurs from an option click and `onBlur={closeList}` never races `commit()`. Still added
`onMouseDown={(e) => e.preventDefault()}` on the `<li>` as a defensive no-cost belt-and-suspenders
(matches this codebase's existing convention), but the 150ms setTimeout hack SpeciesPicker needs
was never actually necessary here — worth remembering as the reason NOT to copy that hack
reflexively into a future non-focusable-options listbox.

**A real field-name collision bug, found and fixed before it shipped**: first draft had
`interface DefenderEffectiveness extends EffectivenessTier { label: string }`, built via `{
...classifyEffectiveness(...), label: opponent.label }`. This COMPILES and silently overwrites
`EffectivenessTier`'s own `label` (the semantic tier text, "Super Effective") with the opponent's
short tag ("A") — the spread's own `label` field is just clobbered by the later key in the object
literal, no TS error since both are typed `string`. Caught it myself before running anything (not
via a test failure) by rereading the shape. Fixed by NOT extending — `DefenderEffectiveness {
opponentLabel: string; tier: EffectivenessTier }`, nesting instead of flattening, so the two
`label`-shaped concepts can never collide again. General lesson: a same-typed field name reused
across an extended interface + a later spread-and-override is a silent-data-loss bug, not a type
error — grep for this shape (`{ ...x, sameFieldName: y }` where `x`'s type already declares
`sameFieldName`) before shipping a similar "enrich a computed value with a caller-supplied tag"
helper.

**Six-tier classification (`moveEffectiveness.ts`), thresholds derived from the engine's own
exported `typeChart.ts` constants, never hand-typed independently**: `SUPER_EFFECTIVE` (1.6) isn't
exactly representable in binary floating point, so `SUPER_EFFECTIVE ** 2` and
`SUPER_EFFECTIVE * NOT_VERY_EFFECTIVE` (which should cancel to exactly 1) both carry tiny float
noise — used the geometric mean of each pair of adjacent achievable "rungs" as the threshold
between them (`Math.sqrt(a*b)`), which tolerates that noise without a hand-picked epsilon and
adapts automatically if the engine's own constants ever change. Verified numerically with a
scratch `tsx` script before writing the vitest suite: all 7 achievable rungs (2.56 / 1.6 / 1.0 /
1.0-via-cancel / 0.625 / 0.390625-via-two-routes / 0.244140625 / 0.152587890625-theoretical)
classify into the intended 6 tiers, and confirmed `NOT_VERY_EFFECTIVE² == NO_EFFECT` exactly
(0.625² = 0.390625, both exact since 0.625 = 5/8 has a finite binary expansion) — the game reuses
the same constant for "single-type old-immunity-converted-to-double-resist" AND
"double-ordinary-resist," which is presumably why `NO_EFFECT` is named the way it is.
**A real test-writing mistake caught by running the tests, not by review**: first draft asserted
`normal vs [rock, steel]` lands in the "extreme" tier as a demonstration of stacking two ordinary
resists — it doesn't, it's `0.625 × 0.625 = 0.390625`, i.e. the SAME value as a single `NO_EFFECT`
match (`electric vs ground`), landing in "very-resisted," not "extreme." Needed a REAL example
where one type match is ordinary-resist and the OTHER is a `NO_EFFECT` match on the same
attacking type to reach the 0.244x rung — `fighting vs [ghost, flying]` (Fighting→Ghost is
`NO_EFFECT`, Fighting→Flying is `NOT_VERY_EFFECTIVE`) is a real such case, and also a real
Pokémon typing (Drifblim/Drifloon). Lesson: don't assume a "stack two things worse" test case is
correct without running it — the achievable-value lattice here is smaller and more counterintuitive
than it looks (many combinations collapse onto the same 5-6 actual numbers).

**N-defender chip design, confirmed for real via a throwaway Playwright script (not just
reasoning)**: `opponents?: EffectivenessOpponent[]` prop, one chip per opponent, NEVER
averaged/ranged/blended — the task's own "or a compact range" alternative was rejected because a
range would hide exactly which candidate/slot has which multiplier, the one piece of information
this whole product's ranking-flip thesis cares about most. Confirmed live in a real browser:
Comparator's boss-move pickers render 2 tagged chips ("A"/"B"); Team Raid's boss-move picker
renders up to 6 ("1".."6"), wrapping cleanly onto a second line via `flex-wrap` on
`.move-select-summary`/`.move-effectiveness` rather than overflowing horizontally (the exact
failure mode [[bugfix_mobile_horizontal_overflow]] flagged before — proactively designed around it
this time instead of finding it after the fact); a single-opponent chip never shows its tag
(dropped, since there's nothing to disambiguate); Species Report's two move pickers correctly
render zero chips (genuinely no single target — a ~200+-boss sweep, matching the task's own
predicted case). **Attack/Defense Breakpoints was NOT actually a no-opponent case, contrary to
the task's own speculation that it might need one** — checked instead of assuming: Attack mode's
species pickers measure against the one selected boss, Defense mode's boss pickers measure
against the one selected species; both are ordinary single-opponent sites, no degradation needed.
Always check a task's own "you may need to handle X" hint against the actual code rather than
building for the hint reflexively.

**Deliberate scope addition beyond the literal ask**: also render the same effectiveness chip on
every OPEN-list option (not just the closed-control summary/currently-selected move) — the task's
wording only required hiding stats on the CLOSED control and kept the open list "as today," but
since the open list is exactly where a user is actively choosing between moves of different
types, showing each option's own matchup there directly serves the underlying goal (move
selection informed by matchup) more than the closed control alone would. Low-risk (reuses the same
`EffectivenessChips` component, same empty-opponents degradation) and flagged explicitly here in
case a future reviewer reads it as scope creep rather than a deliberate call.

**Two real, reusable engineering-environment findings this session:**
- **A ~100-line Bash heredoc (`cat > file <<'EOF' ... EOF`) reproducibly failed** ("unexpected EOF
  while looking for matching `'`") on `moveEffectiveness.ts`'s first draft, despite individually
  testing apostrophes, backticks, em-dashes, and the Unicode × sign in isolation via small heredocs
  and all passing fine — didn't bisect the exact trigger further (not worth the time; suspect it's
  a length/complexity ceiling in how this session's Bash tool transports a long multi-line command,
  distinct from the already-known tsx/strip-types import-resolution ceiling in
  [[verification-without-browser-tool]]). Pivoted to the `Write` tool for whole-new-file authorship
  and to Bash-invoked Node scripts (`fs.readFileSync`/`.replace(exact old string, new string)`,
  throwing if the match count isn't exactly 1 — mirrors the `Edit` tool's own uniqueness safety) for
  surgical multi-site edits to existing files. This combination worked cleanly for all 6 call-site
  files with zero further quoting issues. If a future session hits the same heredoc failure on a
  long/prose-heavy file, don't waste time bisecting which character is at fault — just switch to
  `Write` (new file) or a Node-script `.replace()` (existing file) rather than fighting the heredoc.
- **`packages/web/src/PowerUpOptimizerAssumptionPanel.tsx` is CRLF line endings** — confirmed by
  scanning every touched file (`grep`-counting `\r\n` vs bare `\n`); every OTHER file in
  `packages/web/src` touched in THIS session (including its other 6 edited files) was LF-only.
  **UPDATE 2026-09-10, corrected — this is NOT "the ONE file in this repo that is" as originally
  claimed here**: [[feature_comparator_advanced_assumptions_gate]] independently found
  `packages/web/src/scenarioRoundtrip.test.ts` and `packages/web/e2e/share-link.spec.ts` are ALSO
  CRLF. Don't assume any given file's line ending from this note or from which files a past
  session happened to touch — detect it fresh per file (see that session's own fix: check the
  target file's dominant ending up front, every time, rather than special-casing a filename list).
  A naive Node-script `.replace()` using `\n`-based search strings silently
  found ZERO matches against this file (not an error — `.replace()` just returns the string
  unchanged when the pattern isn't found, and my script's own "assert exactly 1 occurrence" guard
  is what caught it, throwing before any write happened — never touched the file on disk). Fixed by
  detecting `\r\n` up front, stripping it to work in plain `\n` for matching/editing, and restoring
  `\r\n` before writing back — confirmed via `git diff --stat` afterward that the resulting diff was
  a clean, minimal N-line change, not a whole-file rewrite from a line-ending flip (which
  `core.autocrlf=true` would likely paper over on the NEXT checkout regardless, but redoing the
  file's on-disk bytes unnecessarily is still worth avoiding). Any future Node-script text edit in
  this repo should detect-and-preserve line endings the same way rather than assuming LF.

**A real lint error found and fixed via the actual `npm run lint` run, not anticipated in
design**: first draft used `useState` for the typeahead match buffer AND its reset timer, updated
only via the functional-updater form (`setTypeaheadTimer((prev) => ...)`) and never read via the
plain `typeaheadTimer` binding itself — ESLint's `@typescript-eslint/no-unused-vars` correctly
flagged the destructured value as unused (a real, not spurious, finding: nothing in the component
ever reads that binding). Neither value is ever rendered, so neither needed to be state at all —
refactored both to `useRef`, which also incidentally avoids a wasted re-render on every keystroke a
`useState` pair would have caused. This is the first hand-rolled keyboard-interaction component in
this codebase besides `SpeciesPicker.tsx` (whose own typed-query state DOES need to be `useState`,
since it's directly rendered in the input) — the state-vs-ref split (render-affecting = state,
pure interaction bookkeeping = ref) is the right default for any future one.

**`export type { X as Y } from "./mod.js"` does NOT bring `Y` into the CURRENT file's own local
scope** — hit this again despite [[feature_energy_gated_interval_cadence]] already recording the
exact same gotcha; used it to alias `EffectivenessOpponent` as `MoveSelectOpponent` for external
call sites' convenience, then immediately got `Cannot find name 'MoveSelectOpponent'` trying to use
it two lines later in the SAME file's own `Props` interface. Fixed by using the imported
`EffectivenessOpponent` name directly everywhere inside `MoveSelect.tsx` itself, keeping the
`export type {...as...} from` line purely for OTHER files' benefit. Worth actually re-reading this
specific memory entry before reaching for this pattern next time, rather than re-discovering it a
third time.

**Verification depth**: `npm run test:web` 188/188 (10 new, in `moveEffectiveness.test.ts`),
`npx tsc --noEmit` clean on `packages/web`, `npm run lint` 0 errors (the 1 pre-existing
`SpeciesPicker.tsx` `set-state-in-effect` warning untouched — not my file this session, see
CLAUDE.md's own "retire one when you're in that file anyway" scoping), production build clean
(same pre-existing >500kB chunk warning only), the existing 14-test Playwright suite green
(`npm run test:e2e`, unmodified — confirms no regression to any tab's load or the 3 existing
share-link round-trip specs), and a THROWAWAY 8-test Playwright script (written to
`packages/web/e2e/_scratch_moveselect.spec.ts`, run via `npx playwright test`, then deleted — no
permanent e2e addition, since this change touches no `Scenario`/share-link surface) that actually
clicked into the listbox in a real Chromium instance and confirmed: the closed control's
`innerText` contains neither "DPS" nor "dmg" nor "energy cost"; opening the list DOES show all of
those; `ArrowDown` + `Enter` actually changes the selection and closes the list; `Escape` closes
WITHOUT changing the selection; the Comparator boss-move picker's chip tags are exactly `["A",
"B"]`; the Team Raid boss-move picker's are exactly `["1","2","3","4","5","6"]`; a single-opponent
picker renders a chip with zero tag elements; Species Report renders zero chips. Also captured and
visually inspected (via `Read` on the PNG) 5 screenshots confirming real rendered colors/spacing —
the six-defender row wraps cleanly onto two lines, chip colors read clearly (green filled for
double-super, green outlined for super, gray for neutral, red dashed for resisted, red solid for
worse tiers), and the closed-control rows throughout a real Comparator page are now single-line
where they used to force horizontal cramping. `npm run verify` (full gate, all three packages) also
run once at the end and went fully green, including packages I never touched, confirming clean
integration with concurrent engine-developer/data-sync work in the same tree. Ran `git status
--porcelain` scoped to `packages/web` at the end to confirm exactly the intended 8 modified + 2 new
files, nothing staged (task said "stage nothing"), no stray scratch/screenshot artifacts left over.
