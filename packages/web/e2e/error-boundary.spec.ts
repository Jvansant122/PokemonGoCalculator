import { test, expect } from "@playwright/test";

/**
 * TabErrorBoundary (App.tsx/TabErrorBoundary.tsx) — exists to catch a real
 * render error thrown by a tab, gracefully, rather than letting React unmount
 * the whole tree to a fully blank `<div id="root">` (confirmed live
 * 2026-09-13). It has no test-only hook to force a throw on demand, so every
 * test below needs an ACTUAL reproducible crash to drive it.
 *
 * WHAT COUNTS AS "MALFORMED" NARROWED TWICE now:
 *  - 2026-09-14 (first pass): all seven scenario codecs' own
 *    `decodeXScenarioWithDiagnostics` degrade per-field instead of throwing
 *    on invalid base64, non-JSON bytes, or a wrong-typed field — `?pu=garbage`
 *    no longer crashes (see the "gracefully degrades" test below).
 *  - 2026-09-14 (second pass, same day): the narrower gap that first pass
 *    left open — a payload that's valid JSON and a valid object (so
 *    `tryParseJsonObject`/`decodeXScenarioWithDiagnostics` accept it) but
 *    carries NONE of a scenario's expected top-level keys, so every
 *    recognized field decodes to `undefined` — is ALSO closed now.
 *    ComparatorView.tsx/TeamRaidView.tsx/SpeciesReportView.tsx/
 *    powerUpOptimizerScenario.ts's own `scenarioToAssumptions` merge
 *    functions previously dereferenced a handful of fields (`s.candidates[0]`,
 *    `s.ivs.attack`, `s.slots.map(...)`, `s.dodgeModel`) without the
 *    `?.`/`??` guard every sibling field in the same function already had.
 *    The `eyJmb28iOiJiYXIifQ` payload (base64url of `{"foo":"bar"}") this
 *    file used to pin as "still crashes" for comparator/power-up-optimizer
 *    now degrades cleanly instead — verified live, see
 *    scenarioDecodeHardening.test.ts for the same case covered at the unit
 *    level across all four affected tabs (Comparator/Team Raid/Species
 *    Report/Power-Up Optimizer).
 *
 * No payload is currently known to still reach this boundary through a
 * share-link vector on any of the seven tabs — every test below now asserts
 * graceful degradation, not a crash. The boundary itself (and its "Reset
 * this tab to defaults" recovery button) stays in the codebase as a safety
 * net for whatever NEXT gap surfaces, same reasoning as every other
 * defensive layer in this project, but there's currently no live e2e
 * repro left to exercise the Reset button specifically — the previous
 * such test relied on exactly the bug this pass fixed.
 */
test("power-up-optimizer: a structurally-valid-but-wrong-shape scenario now degrades to defaults instead of crashing (2026-09-14, second pass)", async ({
  page,
}) => {
  await page.goto("/?view=power-up-optimizer&pu=eyJmb28iOiJiYXIifQ");

  await expect(page.getByRole("alert")).not.toBeVisible();
  // NOT the "Baseline — roster as-is" heading (that's `?pu=garbage`'s own
  // case just below, which decodes to `null` and falls back to
  // DEFAULT_ASSUMPTIONS' demo roster wholesale). `{"foo":"bar"}` decodes to a
  // REAL, non-null scenario that just happens to carry no `slots` key at
  // all — `(s.slots ?? []).map(...)` degrades that to `[]`, padded to six
  // genuinely EMPTY slots (same "old link with no slots at all" convention
  // TeamRaidView's own teamScenarioToAssumptions already uses), not the
  // populated demo roster. The honest empty-roster prompt below is the
  // correct degrade here, not a second bug.
  await expect(
    page.getByText("Add at least one Pokémon to the roster above to see ranked power-up candidates"),
  ).toBeVisible({ timeout: 20_000 });
});

test("power-up-optimizer: an invalid-base64/non-JSON ?pu= gracefully degrades to defaults instead of crashing (2026-09-14 hardening)", async ({
  page,
}) => {
  await page.goto("/?view=power-up-optimizer&pu=garbage");

  // No crash fallback at all — the per-field decoder in powerUpOptimizerScenario.ts
  // treats an unusable payload as "no scenario," same as a missing ?pu=.
  await expect(page.getByRole("alert")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: /Baseline — roster as-is/ })).toBeVisible({ timeout: 20_000 });
});

test("comparator: a structurally-valid-but-wrong-shape scenario now degrades to defaults instead of crashing (2026-09-14, second pass)", async ({
  page,
}) => {
  // Valid base64url of the JSON `{"foo":"bar"}` — decodes without throwing,
  // and every field ComparatorView's scenarioToAssumptions reads off it
  // (candidates[0], ivs.attack, dodgeModel, ...) now falls back to its own
  // DEFAULT_ASSUMPTIONS value instead of dereferencing `undefined`.
  await page.goto("/?view=comparator&s=eyJmb28iOiJiYXIifQ");

  await expect(page.getByRole("alert")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: /Fight results/ })).toBeVisible();
});
