---
name: bugfix-iv-input-spinner-and-layout-qa
description: Five visual-QA bugs fixed in one pass — the real one was native number-input spin arrows swallowing clicks on a too-narrow .iv-input, invisible digit included
metadata:
  type: project
---

Fixed 2026-09-05, from a visual-only QA pass (screenshots, no source reading) against the live
dev server. Five bugs, all `packages/web/src` CSS/JSX only, no engine/Scenario change.

**Bug 1+2 (the real one): `.iv-input { width: 4ch; }` was narrow enough that a native
`<input type="number">`'s built-in spin-button arrows overlapped and hid the digit entirely**, in
both light/dark schemes. Worse: because the (invisible) spin arrows occupied real click area, a
triple-click meant to select-all landed on the down-arrow instead and silently decremented the
value (15 -> 13) with zero visual feedback — only detected because `SensitivityView.tsx`'s
"(currently N)" line downstream happened to print the changed number. **Root cause is the
overlapping native spinner, not just "too narrow"** — widening alone doesn't fix the click-hijack,
you have to also suppress the spinner. Fix applied: `-moz-appearance: textfield` on `.iv-input`
plus `-webkit-appearance: none; margin: 0` on `::-webkit-inner-spin-button`/
`::-webkit-outer-spin-button`, and widened `4ch` -> `3rem` (verified via served-CSS content, not
guessed) to comfortably fit 2 digits with the spinner gone. **General lesson: any narrow
`type="number"` input in this codebase should get this same appearance-suppression treatment
up front** — it's not a one-off, it's a property of narrow number inputs generally. Check any
future narrow numeric field (a new IV-like control) against this same failure mode before shipping.

**Bug 3: `.assumption-grid { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }`
truncated every `MoveSelect` option's DPS figure in parens at default panel width** (e.g. cut off
right at "(~12.0"). Widened `minmax` floor to `250px` — enough to show the full DPS figure in the
closed `<select>` at default width without wrapping other grid cells awkwardly.

**Bug 4: the "Also active, no data yet: ..." unmatched-raid caption (`AssumptionPanel.tsx`, fed by
`registry.ts`'s `unmatchedActiveRaids()`) read as unexplained jargon to a first-time user.**
Reworded in place to "Other raids currently live in-game that this tool can't model yet (no stat
data available): ..." — no change to what data feeds it, wording only. The call site is
`AssumptionPanel.tsx` around the `SpeciesPicker` for `targetId`, not `App.tsx` (App.tsx only wires
`unmatchedActiveRaids()` into a `unmatchedRaids` memo and passes it down as a prop).

**Bug 5: `.share-row input { flex: 1; }` had no `min-width: 0`, so at ~1000px viewport the
share-link `<input>`'s intrinsic content width pushed the whole page into horizontal scroll** —
classic flex-child-won't-shrink-below-content bug. Added `min-width: 0` alongside the existing
`flex: 1`. Didn't reproduce at the tool's default ~785px width, only at wider/resized viewports —
worth remembering that a real CSS bug can be invisible at the one width a session always tests by
default; resizing (even just verifying the rule generically, since no browser tool was available
this session to actually resize and check) matters.

**Verification performed, no browser tool available this session** (reconfirmed absence per
[[verification-without-browser-tool]]): `npx tsc --noEmit -p tsconfig.json` clean, `npm run build
--workspace=packages/web` clean (same pre-existing >500kB chunk warning, no error). Started `vite`
dev server in background, `curl`'d `/src/styles.css` and `/src/AssumptionPanel.tsx` through Vite's
transform pipeline to confirm the *served* content (not just the source file on disk) reflects
every edit — confirmed `.iv-input` at `3rem` with the spin-button suppression, `.assumption-grid`
at `minmax(250px, ...)`, `.share-row input` with `min-width: 0`, and the reworded raid caption
string, all present in what a real browser would actually load. This confirms the served bytes are
correct but does **not** confirm the visual rendering (digit legibility, no click-hijack, no
horizontal scrollbar) the way an actual screenshot/click-through would — that gap should be closed
by whichever future session has a browser tool available. Also ran `npm run test:engine` despite
no engine file being touched — 88/88 green, cheap insurance confirming no accidental engine edit,
consistent with [[feature_iv_sensitivity_checks]]'s point that this is worth doing even for
UI-only tasks.
