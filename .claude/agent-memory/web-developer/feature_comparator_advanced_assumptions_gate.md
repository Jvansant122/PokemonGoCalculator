---
name: feature_comparator_advanced_assumptions_gate
description: "More detailed assumptions" gate on the Comparator (showDetailedAssumptions, mirroring Team Raid) plus the per-candidate dodge override's sentinel-select-to-checkbox rework; shared effectiveBossChargedMoveFrequency.ts helper; a real sensitivity.ts staleness gap found and fixed; JSX-whitespace-safe plain-string pattern applied proactively in two new spots
metadata:
  type: project
---

2026-09-10: added `Assumptions.showDetailedAssumptions` (default `false`) to the Comparator,
gating the WHOLE dodge group (`dodge`, `dodgeFastAttacks`, both candidates'
`candidateDodge`/`candidateDodgeFastAttacks` overrides — including the override checkbox itself),
`holdChargedMoveUntilSafe`, `minFightLengthSeconds`, and `bossChargedMoveFrequencySeconds` behind
one checkbox — mirroring `TeamAssumptions.showDetailedAssumptions` exactly. The engine's
`Scenario.showDetailedAssumptions` field already existed uncommitted in the tree, added by
`engine-developer` in the same session as a forcing function (required, not optional — see
[[feature_team_raid_detailed_assumptions_toggle]] for the same "absent decodes to `true`, NOT
`DEFAULT_ASSUMPTIONS`'s `false`" inverted-default rule, which applies identically here).

**Unlike Team Raid, dodge itself is gated here** — Team Raid never hides its shared dodge
controls, only 4 other knobs. This means the checkbox's "right before the first gated field"
placement rule (from the Team Raid precedent) doesn't map cleanly: the per-candidate
`CandidateDodgeOverride` component is nested INSIDE each candidate's own picker column, which
renders before any shared-field checkbox could physically precede it in the DOM. Resolution:
placed the checkbox as its own field immediately before the shared "Dodge boss's charged attacks"
select (the first wholly-standalone gated field), and independently gated the two nested
`CandidateDodgeOverride` render calls in place (`{value.showDetailedAssumptions &&
<CandidateDodgeOverride .../>}`) without relocating them — same "don't reorder what wasn't asked"
discipline as the Team Raid precedent, just applied to a structurally different layout.

## Shared derivation extracted, not cloned

The task explicitly said "reuse `runTeamRaid`'s helper if exported or extractable; do not clone
the derivation logic into a second place where the two can drift" — but the logic was INLINE in
`runTeamRaid.ts`, not actually exported. Extracted it into a new
`packages/web/src/run/effectiveBossChargedMoveFrequency.ts`
(`deriveEffectiveBossChargedMoveFrequencySeconds`), then rewired BOTH `runTeamRaid.ts` and the new
`runComparator.ts` call sites onto it — confirmed behavior-preserving for Team Raid (same
De Morgan's-equivalent guard logic, same 0-starting-energy/Infinity/0-fallback rules). Comparator
needed the derived value threaded into THREE places, not just the two `runSustainedComparison`/
`compareAcrossBossChargedMoves` calls the task named explicitly: also into
`sensitivity.ts`'s `computeSensitivity` (see below) — a real gap the task didn't call out but
which the exact same "per-candidate dodge override also needed threading into sensitivity.ts" bug
class from [[feature-default-perfect-dodge-and-candidate-override]] predicted.

## Real bug found and fixed: sensitivity.ts was reading the STORED frequency, not the effective one

`computeSensitivity`'s internal `runSustained()` helper defaulted `bossChargedMoveMeanIntervalSeconds`
to `a.bossChargedMoveFrequencySeconds` (the raw stored field), and check 7's own scan used the same
raw field as both its "current value" display and its scan center. Once `showDetailedAssumptions`
defaults to `false` and the main result cards start using a DERIVED frequency instead, this would
have made the sensitivity panel's "current winner" baseline (and thus every flip it reports)
silently disagree with the result cards above it whenever advanced mode was off — the exact
"result without its conditions is a wrong result" failure this product exists to prevent. Fixed by
adding an optional `effectiveBossChargedMoveFrequencySeconds` parameter to `computeSensitivity`
(falls back to `a.bossChargedMoveFrequencySeconds` when omitted, so the two existing
`sensitivity.test.ts` call sites needed zero changes), and threading
`runComparator.ts`'s own computed value into its one real call site. Caught this BEFORE it shipped
by reasoning through the data flow, not by a failing test — there was no pre-existing test that
would have caught it, since `sensitivity.test.ts` only exercises `DEFAULT_ASSUMPTIONS` where
(before this task) `showDetailedAssumptions` didn't exist at all.

## Dodge override: sentinel `<select>` -> checkbox, with a `Perfect`-seeded default

Replaced the "Same as shared setting" first-`<option>` sentinel (mapping to `null`) with a real
checkbox ("Override dodge settings for this candidate"). Extracted the seed/clear logic into a
pure, exported `setCandidateDodgeOverriding(value, index, checked)` in `AssumptionPanel.tsx`
(checked -> seeds BOTH `candidateDodge[index]`/`candidateDodgeFastAttacks[index]` from the CURRENT
shared `value.dodge`/`value.dodgeFastAttacks`; unchecked -> both back to `null` together) — this
made the checkbox's behavior directly unit-testable in a new `AssumptionPanel.test.ts` without
rendering anything, mirroring how `normalizeAssumptions`/`resolveBoost` are already plain exported
functions elsewhere in this file/module. Since `DEFAULT_ASSUMPTIONS.dodge` is `{kind:"perfect"}`
(see [[feature-default-perfect-dodge-and-candidate-override]]), checking the box for the first
time on a fresh scenario seeds "Perfect" — confirmed live via Playwright, not just the unit test.

Per the user's explicit phrasing ("the checkbox will auto turn off the shared ones... not that the
shared control disappears"), the shared "Dodge boss's charged attacks" field now shows a computed
note ("Overridden for Candidate A — see that candidate's own dodge override above instead of this
shared setting") whenever either candidate has an active override — the shared control itself is
never removed, disabled, or hidden.

## JSX whitespace-collapsing footgun: sidestepped proactively in TWO new spots

Per the pre-existing warning in [[feature_visual_redesign_pass]] ("JSX eats the space between an
expression and the next line's text"), both new prose blocks this task added — the "Simple
assumptions in force" summary paragraph (AssumptionPanel.tsx) and the Fight Results boss-cadence
caveat sentence (ComparatorView.tsx, now reading `runResult.effectiveBossChargedMoveFrequencySeconds`
instead of the stale `assumptions.bossChargedMoveFrequencySeconds`) — were built as ONE plain
JS/template-literal string computed in the component body (`simpleAssumptionsSummary`,
`bossCadenceCaveat`) and rendered as a single `{stringVar}`, rather than interleaving `{expr}` and
literal text across wrapped source lines. This isn't just defensive: an earlier draft that DID
interleave expressions (`{dodgeKindLabel(...)}\n{conditional}; also\ndodge fast attacks:...`) was
manually traced through JSX's actual whitespace-collapse rules (text-to-text across a newline
collapses to one space; expression-to-expression or expression-to-text across a newline collapses
to NOTHING) before being reverted in favor of the plain-string version — worth doing the trace
once to internalize the rule, but the plain-string pattern is strictly safer for any future
multi-clause conditional sentence and should be the default choice, not just a fallback once a bug
is spotted.

## A second and third CRLF file found — the "ONE file" claim in memory was already stale

[[feature_move_select_listbox_and_effectiveness_chips]] claimed
`PowerUpOptimizerAssumptionPanel.tsx` was "the ONE file in this repo that is [CRLF]". This task
found `packages/web/src/scenarioRoundtrip.test.ts` AND `packages/web/e2e/share-link.spec.ts` are
ALSO CRLF — that claim is now corrected in that memory file directly rather than left stale. My
own exact-string-replace helper script (used via Bash per this session's tool-preference
instructions, in place of the dedicated Edit tool) now detects the target file's dominant line
ending up front and normalizes old/new fragments to match before writing back, rather than
special-casing one filename — a more durable fix than a per-file flag, since this is evidently not
a one-off.

## Verification performed

`npm run verify` (full: engine+web+scripts tests 826 total, typecheck all three projects, lint —
zero errors, only the one pre-existing `SpeciesPicker.tsx` warning, untouched — check-* x4, and
the production build) plus `npm run test:e2e` (all 14 Playwright specs, including a rewritten
`share-link.spec.ts` dodge-override test that now drives the FULL gate: unchecked ->
override-toggle-absent-from-DOM -> check "More detailed assumptions" -> check the per-candidate
override -> confirm it's seeded to "perfect" -> change it to "none" -> share link -> fresh page
shows both checkboxes checked and "none" preserved) — all green. Additionally drove a live
`vite preview` (production dist) at a real 1920x1080 Playwright viewport, unchecked/checked/
override-checked, confirming via `document.documentElement.scrollWidth ===
document.documentElement.clientWidth` (no horizontal overflow in any state) and via `.count()` on
the gated fields' ids that they are GENUINELY ABSENT from the DOM when unchecked (not just
CSS-hidden) — screenshots visually confirmed the "Simple assumptions in force" and Fight Results
caveat sentences render with correct spacing (proving the plain-string JSX-safety approach above
actually worked, not just compiled) and that the override note appears correctly next to the
shared dodge select. This is real Level-1 (Playwright-driven) verification, not the CLI-only
fallback — see [[verification_without_browser_tool]] for when that fallback is the ceiling instead.

One process note: a scratch Playwright script's `page.screenshot({ path: "C:\\Users\\...\\<very
long temp path>...\\file.png" })` silently produced a garbage filename (the entire path
concatenated into one literal filename with the drive letter and all separators intact as
characters, written into the script's OWN cwd instead of the intended nested directory) rather
than erroring — no exception was thrown, `ls`/`find` at the intended path just came up empty.
Switched to a bare relative filename (script's cwd was already `packages/web`) and it wrote
correctly; moved out and deleted afterward, along with the 3 mangled-name stray files the first
attempt left behind directly in `packages/web/`. Prefer a short relative output path for any future
Playwright screenshot call rather than a long absolute one assembled from this environment's own
(also long) scratchpad path.
