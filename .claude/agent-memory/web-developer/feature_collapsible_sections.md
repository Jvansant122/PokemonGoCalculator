---
name: feature-collapsible-sections
description: Shared CollapsibleSection.tsx rolled out across all six tabs to cut page-scroll height — design decisions, the e2e xpath=.. locator break it causes, and a real heredoc/Windows-path gotcha found while verifying it
metadata:
  type: feedback
---

Built `packages/web/src/CollapsibleSection.tsx` (+ `collapsibleState.ts` for the
localStorage read/write, both with their own doc comments) as the ONE shared
`<details>`/`<summary>` wrapper, then converted essentially every top-level
`<section className="panel"><h2>...` across all 6 tabs into it, plus two new
nested "subsection" (h3, lighter inset box) instances for Power-Up
Optimizer's multi-raid "Benched but promising" and the shared
`ExcludedEntriesTable` ("Never competitive" / "Excluded from this plan" /
"Excluded from this plan"). Fold state is deliberately NOT a `Scenario`
field — same reasoning as the roster-pool exception in CLAUDE.md (folding a
section changes no number/ordering/meaning) — so `check-scenario-roundtrip`
stays untouched at 107 fields, no new fields added.

**Design decision that mattered most: the heading element lives INSIDE
`<summary>`, not beside it.** `<summary><h2>{heading}</h2></summary>`, not
`<summary>label</summary><h2>...</h2>`. This does two things at once: (1) the
heading stays a real, accessibly-named `<h2>`/`<h3>` (native HTML allows a
single heading as summary's content) so Playwright's
`getByRole("heading", {name})` keeps working unchanged and the heading text
stays visible even while collapsed (satisfies "collapsed header must still
carry the payload" without a separate always-visible summary string), and
(2) it means CSS only needs `details.collapsible-panel > summary h2 {
display: inline }` to keep the chevron and heading on one line — no JS
needed for the disclosure marker; a `summary::before` content chevron
rotates 90deg via `details[open] > summary::before`.

**This breaks every e2e `heading.locator("xpath=..")` in the codebase**,
because the heading's immediate parent becomes `<summary>` instead of the
old `<section>` — content that used to be `<section>`'s other children is
now a SIBLING of `<summary>`, not reachable from it. Found and fixed 4 call
sites (`tabs.spec.ts` x2, `multi-raid.spec.ts` x2) by switching to
`heading.locator("xpath=ancestor::details[1]")`, which is also more robust
against any future nesting change. **Grep every `xpath=\.\.` in `e2e/` before
converting ANY section that an e2e test asserts against** — this is not
optional, `npm run test:e2e` will fail structurally (not just a visibility
timeout) if missed, since the old locator now resolves to `<summary>` which
literally doesn't contain the asserted text.

Playwright's `locator.innerText()` (used by `tabs.spec.ts`'s
NaN/undefined/Infinity scan) respects `display:none` — collapsed `<details>`
children are excluded from that scan. Confirmed this doesn't cause a false
pass/fail (same data either way, scan just covers less text when a section
starts collapsed) but flagged it explicitly per the task's "confirm rather
than assume" instruction.

Defaults chosen: Assumptions + all headline result cards/tables/charts +
budget-plan steps+ledger = open; Known caveats (all 6 tabs) + Sensitivity +
BossMovesetSweep + Team Raid's per-cycle/per-slot breakdown + Power-Up
Optimizer's per-slot damage ladder + the two nested "excluded/benched"
subsections = closed. "Share this scenario" panels were deliberately left as
plain non-collapsible `<section>` (no `<h2>`-bearing content worth folding,
minimizes diff risk) — the mechanical rule I used throughout was "wrap a
`<section className=panel>` iff it has an `<h2>`," which cleanly excluded
every error/empty-state stub too.

**Real bug found while verifying, not caused by this feature:** a `cat >
file.mjs << 'EOF' ... EOF` Bash heredoc containing a JS string literal with
Windows backslash paths (`"C:\\Users\\...\\scratchpad\\foo.png"`) got its
backslashes mangled by bash's heredoc processing, silently producing a
relative path instead — Playwright's `page.screenshot()` then happily
created a nested directory tree of that mangled name INSIDE
`packages/web/`, which showed up as untracked cruft in `git status` and had
to be manually `rm -rf`'d before finishing. The **Write tool version of the
exact same script** (no shell string-escaping involved) worked correctly
first try. Lesson: for any scratch script containing a Windows absolute path
literal, use Write tool to create it, never a Bash heredoc — this cost real
cleanup time and nearly left stray files in the repo.

Measured page height before/after (viewport 1280x900, fresh/empty
localStorage so all defaults apply) via a scratch Playwright script driving
the built `dist`: power-up-optimizer 7722px to 6188px (-20%), comparator
~6426px-est to 3877px (-40%), team-raid ~4910px-est to 3307px (-33%),
species-report ~3249px-est to 2316px (-29%). The "before" screens-only
figures the task gave implied a ~722px-per-screen convention (back-computed
from the one explicit `7722px = 10.7 screens` figure); I used px as the
primary, viewport-convention-independent comparison.
