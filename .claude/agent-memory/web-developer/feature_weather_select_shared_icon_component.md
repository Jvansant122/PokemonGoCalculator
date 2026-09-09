---
name: feature-weather-select-shared-icon-component
description: Replaced six copy-pasted weather <select> blocks with one shared WeatherSelect.tsx icon-button control; hand-rolled SVG icon design conventions used
metadata:
  type: project
---

Built `packages/web/src/WeatherSelect.tsx` to replace the six independently-copy-pasted
`WEATHER_LABELS`/`WEATHER_OPTIONS` + `<select>` blocks that had accumulated one-per-tab
(`AssumptionPanel.tsx`, `TeamAssumptionPanel.tsx`, `SpeciesReportView.tsx`,
`IvBreakpointsAssumptionPanel.tsx`, `AttackDefenseBreakpointsView.tsx`,
`PowerUpOptimizerAssumptionPanel.tsx`). Triggered by an explicit user request: "add icons... make
none have the sunny icon with a line thru it."

**API**: `<WeatherSelect idPrefix={string} value={WeatherCondition} onChange={(w) => void} />`.
Renders a `role="radiogroup"` row of `role="radio"` `<button>`s (native buttons are
Tab-focusable by default — didn't build roving-tabindex arrow-key nav, the brief only asked for
"keyboard-focusable"), each with an inline SVG icon and a `title` carrying the full label
(including the `WEATHER_BOOSTED_TYPES`-derived "(boosts x/y/z)" suffix). The current selection's
full label renders again as a caption below the row so no information the old `<option>` text
carried is lost.

**Icon technique** (all hand-rolled SVG, no library, matching `DamageOverTimeChart.tsx`'s
precedent): every icon uses `fill="currentColor"`/`stroke="currentColor"` only, built from
circles/rects/lines plus two `Q`-curve paths (windy) — deliberately avoided complex bezier cloud
paths (`M...C...C...Z` hand-tuned curves) since I have no way to visually verify rendering in this
environment (no browser tool this session) and a malformed path just silently fails to render
rather than throwing, so a primitives-only design minimizes that risk. Cloud shape is 3 overlapping
filled circles + 1 rounded rect, all the same `fill="currentColor"` — overlapping same-color fills
blend seamlessly with no visible seams, which is what lets `partly_cloudy` stack a `SunGlyph`
*behind* a `CloudGlyph` and still read as "sun peeking out" (the exposed rays show past the cloud's
silhouette edge; the covered ones are just painted over, no z-index tricks needed). `none` reuses
`SunGlyph` verbatim plus one diagonal `<line>` slash — but that slash intentionally does NOT use
`currentColor`: it's a fixed `#ff6b6b` (already this repo's "attention red," see
`.species-picker-warning`), because the user's ask was "unmistakable, not subtle" and currentColor
would render it as the same muted grey as an unselected sun icon, defeating the point.

**Not done**: didn't verify pixel-perfect rendering in an actual browser this session (no browser
tool available) — only confirmed via `npm run build` + Playwright's headless-chromium e2e run (all
6 tabs load with zero console errors and the weather control is present/interactive, see
`packages/web/e2e/tabs.spec.ts`). If the icons look visually off, that's the first thing to check
before assuming the *logic* is wrong.

See also [[feature-default-perfect-dodge-and-candidate-override]] for the same session's other
work, and [[feature-species-picker-primary-sizing]] for the third task.
