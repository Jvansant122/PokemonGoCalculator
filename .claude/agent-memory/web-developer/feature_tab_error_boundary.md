---
name: feature_tab_error_boundary
description: Per-tab React error boundary (TabErrorBoundary.tsx) added 2026-09-13 after confirming every tab's scenario decoder crashes to a fully blank page on malformed input — its fallback surfaces the crashing share URL itself, since that's the one artifact that reproduces the bug.
metadata:
  type: project
---

**Premise, confirmed live before building anything (per the task's own step-1 instruction).** Grepped
first — no existing `ErrorBoundary`/`componentDidCatch`/`getDerivedStateFromError` anywhere in
`packages/web/src`. Then drove all 7 tabs' `parse*ScenarioFromUrl` paths (`scenario.ts` +
6 per-tab siblings, e.g. `speciesReportScenario.ts`) with a real dev server + a small Playwright
scratch script (copied into `.scratch/` inside the repo — module resolution for `playwright`
needs the script to live under a directory with `node_modules` reachable, see
[[verification_without_browser_tool]]/earlier scratch-script notes) against three real malformed
inputs: `?pu=garbage` (invalid base64 -> `atob` throws), `?s=AAAAAAAAAA` (decodes to garbage bytes
-> `JSON.parse` throws), and `?s=eyJmb28iOiJiYXIifQ` (valid base64url JSON `{"foo":"bar"}` — decodes
fine, but the view's own first property read off the wrong-shape object, e.g. `candidates[0]`, throws
`Cannot read properties of undefined`). **All three crash all 7 tabs identically**: React unmounts to
`<div id="root">` with zero children (`rootHtmlLen: 0`, empty `body.innerText`) — every
`decode*Scenario` is unconditionally `fromBase64Url` + `JSON.parse`, none defensive, all called
directly inside a `useState` lazy initializer (so the throw happens during the tab's very first
render, before anything else can render around it).

**Fix: `TabErrorBoundary.tsx`**, a plain class component (React still has no hook equivalent for
`getDerivedStateFromError`/`componentDidCatch` — this is genuinely one of the few places a class is
correct in this codebase). Wraps ONLY the active view in `App.tsx`, not the whole `<div
className="app">` — the masthead and `.tab-switcher` nav stay outside the boundary and so stay
mounted/clickable even while a tab is crashed, which is what makes "switch to another tab" a real
recovery path rather than something the fallback has to implement itself. `App.tsx` passes
`key={tab}` on the boundary, so navigating away and back always mounts a fresh instance — a
crashed tab does not stay crashed after you leave it; no imperative "clear the error" method
needed on the boundary itself.

Fallback (`TabCrashFallback`, same file) shows: which tab failed and that the rest of the app is
fine; the CURRENT `window.location.href` (the crashing URL itself, verbatim — that's the artifact
that reproduces the bug, not a sanitized/rebuilt one) in a read-only `.share-row input` (reused
verbatim from every tab's own "Build link" pattern, `onFocus={(e) => e.target.select()}`); the raw
error message plus `error.stack` inside a `<details className="prose-details">` (reused, not a new
disclosure pattern); and a "Reset this tab to defaults" button. `console.error` is still called in
`componentDidCatch` — the boundary logs, never swallows.

**"Reset to defaults" is a full navigation** (`window.location.href = ...`), not a state-only
reset — sets `url.search` to only `view=<tab>`, dropping the crashing scenario param entirely so
the reload lands on `DEFAULT_ASSUMPTIONS` rather than re-decoding the same bad payload. Chosen over
clearing React state because the crash's root cause is arbitrary (a bad `s=`, corrupted
`localStorage` in principle, etc.) and a fresh page load is the only recovery that's correct
regardless of cause.

**Styling**: new `.tab-crash-callout` class explicitly reuses `.blocked-gain-callout`'s box shape
(border-left accent + radius + shadow), just recolored to `--warn` (red, "something is wrong")
instead of `--accent-y` — per this task's own constraint against inventing a third visual language.
Combined with the existing `.panel` class on the `<section>` (gives it the same
border/radius/shadow/padding every other tab section has) rather than building a bespoke box.

**Tests**: skipped a component-level (React Testing Library) unit test on purpose —
`packages/web/vitest.config.ts` has an explicit, documented decision (`environment: "node"`,
comment: "No component rendering here... this project's UI-behavior verification is the
manual/browser checklist... not a component test suite") that predates this task and that adding
RTL/jsdom just for one boundary test would quietly violate. Went with the task's own explicit
carve-out instead ("add an e2e case only if you can trigger a real crash through the UI... don't
fake a throw in e2e just to have one") — step 1 found three real crash triggers, so
`e2e/error-boundary.spec.ts` uses one of them (`?view=power-up-optimizer&pu=garbage`) as a REAL
crash, asserting the fallback renders, the share URL is captured verbatim, the nav is still
clickable to another tab, AND (2nd malformed-shape case) `?view=comparator&s=eyJmb28iOiJiYXIifQ`
also crashes+recovers the same way, AND "Reset this tab to defaults" actually clears the crash and
reaches a live headline. All 3 pass; ran the FULL existing e2e suite (31/31) and `test:web`
(371/371) too to confirm zero regressions.

**Concurrent-session note**: this task ran while a data-sync session and a Roster-tab session were
both live in the same shared worktree — `run.smoke.test.ts` failed once in a plain `npm run
test:web` (a `bossMovesetSweep` boss-moveset-count assumption their in-flight `data/` change had
already invalidated, magikarp -> ditto fixture swap, IDEAS #24). Confirmed my own change wasn't the
cause via [[pattern_worktree_isolation_for_concurrent_session_verify]] (isolated `git worktree add
... HEAD` + real `npm install`, only my own 4 changed/new files copied in) — 371/371 green there.
Left their in-flight `run.smoke.test.ts` edit untouched; not my file, not my task.

Files: `packages/web/src/TabErrorBoundary.tsx` (new), `packages/web/src/App.tsx` (wraps the tab
content, `TAB_LABELS` map, `handleResetTab`), `packages/web/src/styles.css`
(`.tab-crash-callout`/`.tab-crash-stack`), `packages/web/e2e/error-boundary.spec.ts` (new). No
`Scenario` field touched on any tab — `check-scenario-roundtrip` stayed at 155.
