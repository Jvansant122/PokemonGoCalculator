---
name: sensitivity-flip-bar-and-share-bar
description: Building the SensitivityView flip-bar SVG and result-card own/team share bar — SensitivityCheck's two "delta-only" bugs found while adding numeric fields, and a real limit on node --experimental-strip-types as a verification tool
metadata:
  type: project
---

Implemented 2026-09-05, both `pogo-researcher`-proposed UI-only features (see
`.claude/agent-memory/pogo-researcher/proposal_sensitivity_flip_bar.md` and
`proposal_result_card_share_bar.md`): a per-row hand-rolled-SVG number-line in
`SensitivityView.tsx` (scanned range + current-value marker + flip-point
marker) and a two-segment stacked bar in each `App.tsx` result card echoing
the own/team damage split already shown as raw numbers. Both presentation-only,
no `Scenario`/engine change.

**Real bug found while adding `SensitivityCheck.rangeMin/rangeMax/currentNumericValue/
flipNumericValue`**: two of the 7 checks in `sensitivity.ts` — "Matching
teammates" and "Level" — only ever stored the *delta* they found a flip at
(`nearest`), never the absolute value, because the pre-existing `distanceLabel`
strings only needed the delta ("flips within 3 teammate(s)", "flips within 2
level(s)"). Adding a flip-point marker that must sit at an absolute position
on the row's number line required capturing the actual absolute value inside
the same loop (`flipValue = flipped` / `flipValue = candidateLevel`) — the
other 5 checks already computed an absolute flip value for their string, so
only these two needed the fix. Look for this same pattern (a delta captured,
never the absolute point) before assuming any distance-shaped field is safe
to reuse verbatim for a position marker.

**Each check's `rangeMin`/`rangeMax` is that check's own scan bounds, not a
shared universal axis** — party size is 1-20, mega boost multiplier scans
downward from the current value to 1.0 (so `rangeMax` == `currentNumericValue`
by construction for that one row only), dodge accuracy is 0-100 in percent
even though the sim internally works in `missedFraction` (0-1, inverted), etc.
`FlipBar`'s `scale()` normalizes independently per row, so this is fine to
render — just don't assume every row shares axis meaning; the flip-bar is 7
independent number lines side by side, not one shared plot.

**Node's native ESM loader cannot resolve `.js`-suffixed import specifiers
against `.ts` source files** (the TS "bundler" moduleResolution convention
this whole repo relies on, e.g. `import { computeSensitivity } from
"./sensitivity.js"` resolving to `sensitivity.ts`) — `node
--experimental-strip-types some-script.ts` throws `ERR_MODULE_NOT_FOUND` the
moment it tries to follow such an import, even though strip-types itself
works fine on a single file with no such imports. This is a real ceiling on
the [[verification-without-browser-tool]] scratch-script technique: it only
works for isolated logic with no relative imports of its own (like proving a
pure math formula), not for exercising an actual app module like
`computeSensitivity` that imports sibling `./registry.js`/`./sensitivity.js`
files. When blocked this way, fall back to: full `tsc --noEmit` (which does
resolve these correctly) to validate the shape/logic types, a manual trace of
the loop being changed, and a browser-bundle grep (fetch the built JS from
`vite preview` and grep for a distinctive new string/class name) as evidence
the code actually shipped — say plainly that this is short of proving runtime
correctness, unlike the numeric proof used for isolated formulas.

**Watch for orphaned doc comments when inserting a new top-level function
between an existing doc comment and the function it describes** — copy-pasted
a new function's own JSDoc directly above an existing one-liner comment
(`/** Resolves a species id... */`) that belonged to the *next* function down,
splitting it from its target. `tsc`/`vite build` don't catch this (it's a
valid no-op comment either way) — only reading the diff back caught it. Worth
a habit: after inserting a new function near an existing one, re-read the
insertion point specifically for comment/function pairing, not just the new
code.
