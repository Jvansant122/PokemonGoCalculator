---
name: feature-defensive-scenario-decode-2026-09-14
description: scenario.ts/teamScenario.ts defensive decoders (never throw, per-field degrade, rejectedFields diagnostics) — engine half of the TabErrorBoundary follow-up
metadata:
  type: project
---

## What shipped (engine half only — packages/web codecs briefed separately)

Follow-up to `ead5a2a` (`TabErrorBoundary`, 2026-09-13), which caught the crash but didn't fix the
underlying "every decoder is a bare `JSON.parse(...) as T`" problem. Built:

- New `packages/engine/src/scenarioValidation.ts` — shared, dependency-free runtime type-guard
  primitives (`isString`/`isFiniteNumber`/`isBoolean`/`isPlainObject`/`isIVSpread`/`isMegaLevel`/
  `isWeatherCondition`/`isDodgeBehavior`/`isTuple2`/`orNull`/`isStringArray`) plus the generic
  `sanitizeKnownFields<T>(raw, validators)` engine and `tryParseJsonObject(fromBase64Url, encoded)`.
  Exported from `index.ts` (harmless, might be reusable by web's other 5 codecs).
- `scenario.ts`/`teamScenario.ts` each got a per-field `FieldValidators<Scenario|TeamScenario>`
  table (`SCENARIO_FIELD_VALIDATORS`/`TEAM_SCENARIO_FIELD_VALIDATORS`), a `decodeXWithDiagnostics`
  function (`{scenario, rejectedFields} | null`), and `parseXFromUrlWithDiagnostics`.
- **Signature change**: `decodeScenario`/`decodeTeamScenario` now return `T | null` instead of `T`
  (bare). Checked first — nothing in `packages/web` or `scripts/` imports these two directly (only
  `parseScenarioFromUrl`/`parseTeamScenarioFromUrl`, whose signatures were ALREADY `T | null` and
  stayed byte-identical) — confirmed via grep before committing to the change, so this was a
  contained, non-breaking widening in practice despite being a real signature change.

## The three-tier "how unusable is it" design

1. **Entirely unusable → `null`**: invalid base64 (bad alphabet), base64-valid-but-not-JSON, or
   JSON whose top-level value isn't a plain object (array/string/number/null). One function,
   `tryParseJsonObject`, decides this for both files.
2. **A plain object, however sparse** (e.g. `{"foo":"bar"}`) → NOT null. This is deliberately
   treated identically to "an older link that predates every field this build knows about" — an
   already-established, already-tested convention (`decodes a scenario encoded before X existed`
   tests). Getting this distinction right was the main design judgment call: conflating it with
   tier 1 would have been a **regression** on every existing legacy-link test.
3. **A field present with the wrong type/shape** → dropped (deleted from the result), reported in
   `rejectedFields`, otherwise treated exactly like tier-2 absence. Unrecognized keys (not in the
   validator table at all) are left completely untouched — this is load-bearing, not incidental:
   `ComparatorScenario.candidateShadow` and `TeamScenarioSlotWithShadow.isShadow`/`isBestBuddy` are
   web-only extension fields riding the SAME JSON blob (documented in `ComparatorView.tsx`/
   `TeamRaidView.tsx`'s own comments as relying on zero engine field enumeration). Stripping
   unknown keys would have silently broken that extension mechanism. Verified with a dedicated
   test in each file (`preserves an unrecognized extra/per-slot field ... untouched`).

## `TeamScenario.slots` needed special handling, not just a bigger validator table

`slots` is an array where POSITION is semantic (6 fixed fight slots, doc comment: "pad ... rather
than a shorter array") — a per-field validator can't fix a wrong-length array, so the whole field
is rejected as a unit if `Array.isArray` fails or length !== `MAX_TEAM_RAID_SLOTS` (imported from
`teamRaid.ts` — confirmed no import cycle first). Once the length is right, each of the 6 elements
is sanitized independently via the same per-slot validator table — one bad slot doesn't cost the
other five. A slot element that isn't even a plain object degrades to an all-fields-absent slot
(not a thrown error, not a dropped array position) — same "TS says required, runtime says
possibly undefined" convention this whole package already leans on for every other required field.

## Why `decodeScenario`/`decodeTeamScenario` still exist as plain wrappers

`decodeXWithDiagnostics` is the actually-new function; `decodeX` is `decodeXWithDiagnostics(...)
?.scenario ?? null` — kept as a thin convenience for a caller (tests, `parseXFromUrl`) that doesn't
need to know which fields were rejected. Not a compatibility shim for its own sake — genuinely the
right API shape: most call sites don't want to thread rejectedFields through.

## Verification

`npm run test:engine` (654 tests, all pass, +19/+ new tests split across both files),
`npm run typecheck` (all 4 projects — engine/engine-test/web/scripts — clean, confirming zero web
breakage), `npm run lint` (clean), `npm run check-scenario-roundtrip` (155 fields unchanged — this
work touches decode robustness, not the field list), full `npm run verify` (all green including
production web build). Confirmed the 3 real crash shapes from the task via a throwaway Node
scratch script BEFORE writing tests (not hand arithmetic) — `"garbage"` fails at JSON.parse (valid
base64, garbage bytes), `"bad-chars!!!"`/URL-encoded punctuation fails at `atob` itself (invalid
base64 alphabet) — these are two genuinely different failure points inside `fromBase64Url` vs.
downstream, both caught by the same two nested try/catches.

## What I deliberately did NOT do

Did not touch `packages/web` (owned by web-developer/site-builder for this task) or `scripts/`
(data-sync's lane) — confirmed via grep that neither imports `decodeScenario`/`decodeTeamScenario`
directly before relying on that as justification for the signature change. The five web-owned
`Scenario`-family types (Species Report, IV Breakpoints, Attack/Defense, Power-Up Optimizer,
Roster) are NOT covered by this change at all — they're defined and decoded entirely in
`packages/web`, this task was engine-only by design. `scenarioValidation.ts`'s primitives
(`isDodgeBehavior`/`isWeatherCondition`/`isMegaLevel`/etc.) are exported and available for
web-developer to reuse for those five when briefed, but building their decoders is explicitly out
of scope here.
