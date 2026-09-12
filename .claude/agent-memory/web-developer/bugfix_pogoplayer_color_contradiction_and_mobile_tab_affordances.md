---
name: bugfix-pogoplayer-color-contradiction-and-mobile-tab-affordances
description: Three pogo-player-found fixes (2026-09-12) — Team Raid's red "risk" box under a green "Cleared" headline, active tab lost on mobile resize/deep-link, Power-Up Optimizer's 2-option mode toggle overflowing at 375px. All CSS/DOM-only, no Scenario change. Includes a real font-swap-reflow bug caught only by live Playwright measurement.
metadata:
  type: project
---

## 1. Color-follows-outcome, not hardcoded

`.boss-moveset-risk` (TeamRaidView's boss-moveset-sweep callout, IDEAS #18) was hardcoded to
`--warn` (red) regardless of the headline outcome, so a green "Cleared" verdict sat directly above
a red-bordered box — reads as self-contradictory even though the copy itself ("clears against 5 of
16... fails against the other 11") was correct and wanted. **Checked whether the same box gets
reused under a genuinely-failed headline — it does** (`verdictVaries` is independent of
`outcome`), so per the task's own instruction the color should follow the outcome rather than stay
one hardcoded value. Fix: added a `--caution` amber token (`#f0b429`, distinct from both `--warn`'s
red and `--accent-y`'s orange — the latter is candidate-B identity, fixed everywhere including
inline chart SVGs, and must never be reused for an unrelated meaning per styles.css's own header
comment), made `.boss-moveset-risk` default to amber, and added a `.warn` modifier class applied
only when `result.data.outcome !== "cleared"`. **Second, unrelated call site found via grep**:
`LineupBuilderPanel.tsx` reuses the exact same `.boss-moveset-risk` class for its "winner/runner-up
within noise floor" caution — a context with no clear/fail dichotomy at all. Left that call site
alone (no `.warn` modifier, ever) since amber is the objectively correct color there, not just a
neutral default — confirms the base-class-defaults-to-caution design was right rather than
something that happened to also fix a second spot.

## 2. A REAL bug found only by live-measuring, not by reading the diff

Task: keep the active tab visible in the mobile `.tab-switcher` nav on mount and on resize. First
attempt: a `useEffect([tab])` calling `activeButton.scrollIntoView({block:"nearest",
inline:"nearest"})` once on mount plus a `window.addEventListener("resize", ...)`. Typechecked,
linted, unit-tested fine. **Live Playwright measurement at 375px caught it doing nothing on a cold
deep link** (`?view=power-up-optimizer` at mobile width): `scrollLeft` stayed at the value computed
at mount (628px) even after `document.fonts.status` flipped from `"loading"` to `"loaded"`, while
`scrollWidth` grew ~50px (1053 -> 1102) as the Inter web font (`index.html`) swapped in and widened
every tab-button's text — pushing the already-scrolled-into-place active tab back off-screen with
nothing left to re-center it. The resize-triggered path (click a tab at desktop width, then shrink
to mobile) worked fine on the first try, because by then the font swap had already long since
settled — which is exactly why this bug is easy to miss without a real timed measurement: a
"click through it, looks fine" spot check would have hit the working path and missed the cold-load
one. **Fix**: also run the scroll function from `document.fonts.ready.then(...)` inside the same
effect (guarded with `typeof document !== "undefined" && document.fonts` for jsdom/SSR
environments that lack the Fonts API). Re-verified numerically after the fix: `scrollLeft` becomes
675 immediately and STAYS 675 through the font-load transition. **Takeaway: any DOM measurement
taken at mount time in this app is vulnerable to being invalidated by the Inter font swap a few
hundred ms later — a `document.fonts.ready` re-check is cheap insurance for any future scroll-into-
view/measure-and-position logic, not just this one.**

Also added a static (non-scroll-position-aware) right-edge fade `::after` on `nav.tab-switcher`
under `max-width: 640px` as the requested "cheap" scroll affordance — deliberately did NOT make it
disappear once fully scrolled right (the classic dual-gradient `background-attachment: local/scroll`
CSS trick can do that, but is fiddly to get right against this nav's own translucent
`backdrop-filter` background, and wasn't worth the risk for a "nice to have"). Since 7 tabs always
overflow well before 640px, the always-on fade is never actively wrong, just sometimes redundant at
the exact fully-scrolled position — an acceptable simplification, said explicitly rather than
silently.

## 3. Per-instance width behavior on the shared `.tab-switcher`/`.tab-button` scaffold

`.tab-switcher` (shared by the top-level nav AND two in-panel `role="group"` segmented controls —
Attack/Defense's mode switch, Species Report's sort-by, and now the Power-Up Optimizer's
single-raid/multi-raid mode switch) defaults to horizontal-scroll-on-overflow, which is right for
the many-short-labels top-level nav but wrong for a **2-option toggle with full-sentence labels**
("Single raid — 6-slot roster vs. one boss" / "Multi-raid — whole imported roster vs. a boss set")
— at 375px only ~1 button-width was visible, requiring a second horizontal scroll NESTED inside the
assumptions card. Fix: a `.tab-switcher-stack-narrow` modifier class (added alongside `.tab-
switcher` on this one call site only) that switches to `flex-direction: column` +
`overflow-x: visible` + full-width buttons under `max-width: 480px`. Did NOT touch the shared base
class or the other two `role="group"` instances (their labels are short enough to not need it) —
this is a per-call-site opt-in modifier, same pattern as `feature_species_picker_primary_sizing.md`'s
`primary` sizing prop.

## Verification

Full live Playwright-from-Bash verification (per `feature_visual_redesign_pass.md`'s technique,
still current): `npx vite preview --port 4174` in the background, a scratch `.mjs` importing
`chromium` via absolute `file:///.../node_modules/@playwright/test/index.mjs`, real screenshots
read back with the Read tool, and `getComputedStyle`/`getBoundingClientRect` numeric checks (not
just visual guesswork) for the color hex values, the scroll-visibility boolean, and the mode-
toggle's stacked layout/no-overflow. Confirmed live: (1) desktop Team Raid default scenario
("Cleared" + 5-of-16 boss-moveset variance) now renders `rgb(240, 180, 41)` border/amber fill, not
red; (2) a cold 375px deep link AND a desktop-then-resize-to-375px path both leave the active tab
fully within the nav's visible bounds; (3) the mode toggle's `scrollWidth === clientWidth` (no
overflow) with both buttons full-width and fully readable. `npm run verify` (test/typecheck/lint/
check/build) and `npm run test:e2e` (27/27) both green. No `Scenario` field touched (purely
presentational + one DOM-scroll effect), so `check-scenario-roundtrip` was untouched by design —
confirmed it still passes. No new test added: this is exactly the "purely CSS/DOM, no testable
seam" case the task briefing anticipated, EXCEPT the font-swap scrollIntoView bug was only
catchable by live timed measurement, not by a jsdom unit test (jsdom has no real font loading or
layout engine) — recorded here instead as the next-best thing to a regression test.

Note: this session ran concurrently with an untouched engine-developer session (`packages/engine/
src/powerUp.ts` and its own agent-memory were mid-edit in the shared worktree throughout) — staged
and verified only this task's four files, per `pattern_worktree_isolation_for_concurrent_session_verify.md`'s
sibling guidance in `feedback_concurrent_sessions_shared_worktree.md`.
