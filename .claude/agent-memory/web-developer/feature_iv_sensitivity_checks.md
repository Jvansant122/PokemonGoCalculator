---
name: feature-iv-sensitivity-checks
description: Adding Attack/Defense/Stamina IV sensitivity checks (0-15 outward scan) to sensitivity.ts, copying the existing Level check's pattern exactly — no engine change, no Scenario field, SensitivityView.tsx untouched
metadata:
  type: project
---

Implemented 2026-09-05, per `pogo-researcher`'s
`.claude/agent-memory/pogo-researcher/proposal_iv_sensitivity_checks.md`, approved for immediate
build. Added three new `SensitivityCheck` entries to `packages/web/src/sensitivity.ts` — Attack
IV, Defense IV, Stamina IV — each scanning integer deltas 1..15 outward in both directions from
the scenario's current per-stat IV value, clamped to the real [0, 15] range, holding the other two
IVs and every other assumption fixed. Structure copied verbatim from the existing Level check
(check #5): same outward-scan-in-both-directions loop shape, same `rangeMin`/`rangeMax`/
`currentNumericValue`/`flipNumericValue` population, same `winnerOf` call. No `Scenario` field
added (`ivs` already round-trips fully — see [[feature_weather_and_boss_moveset_sweep]]'s
checklist references for why this matters generally), no `SensitivityView.tsx` change needed
(confirmed: it renders whatever `SensitivityCheck[]` array it's given, generically).

**Only real code change beyond the three new loops**: the local `runSustained` helper's
`overrides` param gained an optional `ivs?: { attack; defense; stamina }` field, defaulting to the
outer-scope `ivs` — same `??`-style default pattern as `level`/`dodge`/
`bossChargedMoveMeanIntervalSeconds` already use. `runSustained({ ivs: { ...ivs, [key]: candidateIv } })`
overrides exactly one stat per call, matching the proposal's "hold the other two IVs fixed" spec.

**Verification found a real positive+negative pair in one run**: default fixtures (Mega Raichu X/Y
vs Primal Kyogre) are too lopsided for any IV check to flip (1.3x mega boost dominates), so
verification used `latias-mega` vs `latios-mega` (a real bulk/power tradeoff pair) with
`candidateMegaBoostDisabled: [true, true]` — this produced Attack IV flips at IV 3, Defense IV
flips at IV 6, and Stamina IV reporting no flip within 0-15, all in the same
`computeSensitivity` call. Full detail on the verification method itself (which now includes a
real "no browser tool" ceiling being lifted) is in [[verification-without-browser-tool]].

**Verification performed**: `npx tsc --noEmit` clean, `npm run build --workspace=packages/web`
clean (same pre-existing >500kB chunk-size warning, no error), `npm run test:engine` still 88/88
(confirms no accidental engine edit — none was made). No browser-preview tool was available this
session; the numeric proof above via a scratch script run with `npx tsx` (deleted after, confirmed
via `git status --porcelain`) stands in for a live click-through — this is short of confirming
`SensitivityView.tsx`'s FlipBar renders the three new rows with zero console errors in an actual
browser, which a future session should still do if a browser tool becomes available.
