---
name: bugfix-comparator-teamraid-extension-field-nan
description: Closed a self-flagged gap — wrong-TYPED (not just absent) web-owned extension fields on ComparatorScenario/TeamScenarioWithShadow sailed through `??` and produced NaN; fix lives in scenarioToAssumptions itself, not just the UI decode path
metadata:
  type: feedback
---

Follow-up to [[feature_a11y_polish_freshness_codec_hardening_4stage]]'s own flagged residual gap,
this time closing it for the two ENGINE-decoded scenarios (Comparator/Team Raid) rather than the
five web-owned codecs that pass covered earlier. HEAD was `c6ae278`, tree clean.

**The bug, precisely.** `ComparatorScenario`/`TeamScenarioWithShadow` extend the engine's own
`Scenario`/`TeamScenario` with web-only fields (`candidateShadow`, `bossChargedMoveCadence`,
`friendshipLevel`, `candidateIsBestBuddy` on Comparator; the same three top-level minus
`candidateShadow` plus `bossMaxHpOverrideEnabled`/`reselectAfterWipeEnabled` on Team Raid, plus
each slot's own `isShadow`/`isBestBuddy`) riding the SAME JSON blob the engine's
`decodeScenarioWithDiagnostics`/`decodeTeamScenarioWithDiagnostics` decode. Those decoders
validate only fields their OWN `Scenario`/`TeamScenario` interfaces declare and deliberately
preserve every unrecognized key untouched (this is load-bearing — it's the entire mechanism that
lets `packages/web` extend the type without editing `packages/engine`, pinned by the engine's own
test and CLAUDE.md's standing decisions). That means these ~10 fields were NEVER validated by
anything — a `friendshipLevel: "bogus"` string sailed straight through
`scenarioToAssumptions`'s `?? DEFAULT_ASSUMPTIONS.friendshipLevel` (`??` only guards
null/undefined, not a wrong-shaped PRESENT value) and reached
`FRIENDSHIP_ATTACK_BONUS_MULTIPLIER["bogus"]` — `undefined` — which then multiplies into every
damage number as `NaN`, silently, with no thrown error and no visible "this link had bad
settings" — the tool confidently rendering something untrue, CLAUDE.md's specifically named
failure mode.

**Fix location matters: inside `scenarioToAssumptions`/`teamScenarioToAssumptions` themselves, not
just the UI's own `initialAssumptions`/`initialTeamAssumptions` decode path.** Both functions are
also called directly by `scripts/run-scenario.ts` (the CLI) AND by
`scenarioDecodeHardening.test.ts`'s own existing "structurally-valid-but-wrong-shape" tests — if
the sanitizer only ran in the React-only `initialAssumptions` wrapper, the CLI and any test calling
`scenarioToAssumptions` directly would still see the bug. Put the sanitizer as the FIRST line of
each function (`const s = sanitizeXExtensionFields(rawScenario); return { ... existing `??`
fallbacks reading `s.*` unchanged ... }`) — this is the exact "CLI == UI by construction" contract
[[feature_run_module_extraction_and_cli]] establishes, and getting the sanitizer's call site wrong
would have silently violated it.

**Pattern, reusable for the next engine-decoded-scenario extension field:** build a
`FieldValidators<Pick<XScenario, "field1" | "field2" | ...>>` table using ONLY the extension
fields (never re-list the engine's own fields — those are already validated), then
`sanitizeKnownFields<Pick<...>>(scenario as unknown as Record<string, unknown>, validators)` and
return `result as unknown as XScenario`. `sanitizeKnownFields` only touches keys present in the
validators table and shallow-copies everything else through untouched, so this composes safely
with whatever the engine already sanitized — never widens, only narrows. For Team Raid's
PER-SLOT extension fields (`isShadow`/`isBestBuddy`), map over `scenario.slots ?? []` and run the
same pattern per slot, mirroring `sanitizeObjectArray` in `webScenarioValidation.ts` but simpler
(no "array might not exist at all" case to handle — that's already been rejected wholesale by the
engine's own `sanitizeSlots`, an exact-MAX_TEAM_RAID_SLOTS-length gate). Reused
`isFriendshipLevel`/`isBossChargedMoveCadence` from `webScenarioValidation.ts` and
`isBoolean`/`isTuple2`/`sanitizeKnownFields`/`FieldValidators` from the engine's
`scenarioValidation.ts` (wildcard re-exported via `index.ts`) — zero new validation primitives
needed, this file already had everything.

**A real test-writing trap found and fixed before it shipped a false-positive: `normalizeTeamAssumptions`
already forces `isShadow` to `false` for ANY boost-carrying species, independent of this fix.**
First draft of the per-slot `isShadow` test targeted slot 0 (`mewtwo-mega-x`, the default
roster's mega slot) — it PASSED even with the sanitizer completely reverted, because
`normalizeTeamAssumptions`'s own mutual-exclusivity gate (shadow and mega/primal boost can't
coexist on the same species) independently zeroes `isShadow` for that slot regardless of what the
decoder produced. Caught by deliberately reverting the fix and confirming ALL new tests fail
first (a discipline worth repeating: after writing a regression test, revert the fix and run ONLY
that test before trusting it) — 9 of 10 failed, this one didn't. Fixed by retargeting to slot 1
(`machamp`, no boost mechanic) instead; left an explicit comment in the test explaining why slot 0
would have been a false positive, since the next agent extending this list will hit the same trap
if they copy slot 0 as their template.

**Verification actually performed, not just asserted:** `npm run typecheck:web`,
`npm run test:web` (431 passed after the fix; the same 10 new tests reverted-fix-first showed
9→10 failures as the test file was corrected), `npm run check-scenario-roundtrip` (still 155
fields — this closes a validation gap, adds zero new `Scenario` fields), full `npm run verify`
green (production build succeeds, only the pre-existing chunk-size advisory warning). THEN live
Playwright against the actual `npm run verify`-built `dist` served on the existing `:4173` preview
server (found already running via `netstat`, not started fresh): built two crafted share links by
hand (`toBase64Url(JSON.stringify(scenario))` via a scratch `tsx` script placed inside the repo —
running it from the OS temp scratchpad throws `ERR_MODULE_NOT_FOUND` for `@pogo-analyzer/engine`,
same lesson as [[feature_energy_gated_interval_cadence]]'s "scratch tsx scripts must live inside
the repo") — one Comparator link with `friendshipLevel: "bogus"`, one Team Raid link with FOUR
simultaneously wrong-typed fields (`bossChargedMoveCadence: 42`, `friendshipLevel: "bogus"`,
`bossMaxHpOverrideEnabled: "yes"`, `reselectAfterWipeEnabled: "yes"`, plus slot 1's
`isShadow: "yes"`). Both loaded with zero console/page errors, zero literal `"NaN"` anywhere in
the rendered body text, the friendship `<select>` showing its correct default (`"none"`), and real
non-placeholder hero numbers (Comparator: `11.1`/`20.7` DPS; Team Raid: `280.4s` — the EXACT
figure this file's own `DEFAULT_TEAM_ASSUMPTIONS` doc comment already cites for this roster/boss
at level 35, confirming the malformed fields degraded to the true defaults, not just SOME
non-NaN value). Deleted the scratch `.scratch/` directory before finishing — `git status --short`
confirmed only the three intended source files changed.
