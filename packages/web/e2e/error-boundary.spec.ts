import { test, expect } from "@playwright/test";

/**
 * TabErrorBoundary (App.tsx/TabErrorBoundary.tsx) — a real crash triggered
 * through the UI, not a faked throw. Before this boundary existed, a
 * malformed `pu=`/`s=`/etc. param went to a fully blank `<div id="root">`
 * (confirmed live 2026-09-13) — these assertions pin the fixed behavior, not
 * just "didn't throw."
 *
 * WHAT COUNTS AS "MALFORMED" NARROWED on 2026-09-14: all seven scenario
 * codecs (the engine's own `decodeScenario`/`decodeTeamScenario`, and this
 * package's five — Species Report/IV Breakpoints/Attack-Defense/Power-Up
 * Optimizer/Roster) now degrade per-field instead of throwing on invalid
 * base64, non-JSON bytes, or a wrong-typed field (see each codec's own
 * `decodeXScenarioWithDiagnostics`) — `?pu=garbage` specifically no longer
 * crashes (see the "gracefully degrades" test below, added the same day).
 * What STILL reaches this boundary is a narrower, still-real case a per-field
 * decoder can't fully close: a payload that's valid JSON and a valid object
 * (so `tryParseJsonObject` accepts it) but carries NONE of a scenario's
 * fields at all — every recognized field decodes to `undefined`, and a
 * handful of REQUIRED-field accesses in `scenarioToAssumptions` (e.g.
 * `s.ivs.attack`, `s.dodgeModel.kind`) have no `?.`/`??` guard, so the first
 * one throws instead of degrading. That gap is pre-existing (present in the
 * engine-owned Comparator tab before this task, unchanged by it) and is
 * exactly what this boundary exists to catch gracefully rather than close
 * entirely — see the shared `eyJmb28iOiJiYXIifQ` payload below (base64url of
 * `{"foo":"bar"}`) reused across both tabs' "wrong-shape" tests.
 */
test("power-up-optimizer: a structurally-valid-but-wrong-shape scenario shows the crash fallback, not a blank page", async ({
  page,
}) => {
  await page.goto("/?view=power-up-optimizer&pu=eyJmb28iOiJiYXIifQ");

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText('The "Power-Up Optimizer" tab hit an error while rendering')).toBeVisible();

  // The whole point: the crashing URL itself is right there, selectable, to
  // paste into a bug report — not just an apology with no reproduction.
  const shareUrlInput = page.locator(".tab-crash-callout .share-row input[readonly]");
  await expect(shareUrlInput).toBeVisible();
  await expect(shareUrlInput).toHaveValue(/pu=eyJmb28iOiJiYXIifQ/);

  // The masthead and tab-switcher nav — NOT wrapped by the boundary — must
  // still be usable so the fallback's "switch to another tab" line is true.
  await expect(page.getByRole("heading", { name: "Pokémon GO Scenario Comparator" })).toBeVisible();
  const comparatorTab = page.getByRole("tab", { name: "Two-Candidate Comparator" });
  await expect(comparatorTab).toBeVisible();
  await comparatorTab.click();
  await expect(page.getByRole("heading", { name: /Fight results/ })).toBeVisible();
});

test("power-up-optimizer: an invalid-base64/non-JSON ?pu= now gracefully degrades to defaults instead of crashing (2026-09-14 hardening)", async ({
  page,
}) => {
  await page.goto("/?view=power-up-optimizer&pu=garbage");

  // No crash fallback at all — the per-field decoder in powerUpOptimizerScenario.ts
  // treats an unusable payload as "no scenario," same as a missing ?pu=.
  await expect(page.getByRole("alert")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: /Baseline — roster as-is/ })).toBeVisible();
});

test("comparator: a structurally-valid-but-wrong-shape scenario also shows the crash fallback", async ({ page }) => {
  // Valid base64url of the JSON `{"foo":"bar"}` — decodes without throwing,
  // but every field the view actually reads off it (candidates[0], etc.) is
  // `undefined`, which crashes on first property access instead.
  await page.goto("/?view=comparator&s=eyJmb28iOiJiYXIifQ");

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText('The "Two-Candidate Comparator" tab hit an error while rendering')).toBeVisible();
});

test("power-up-optimizer: 'Reset this tab to defaults' recovers a crashed tab", async ({ page }) => {
  await page.goto("/?view=power-up-optimizer&pu=eyJmb28iOiJiYXIifQ");
  await expect(page.getByRole("alert")).toBeVisible();

  await page.getByRole("button", { name: "Reset this tab to defaults" }).click();
  await page.waitForURL((url) => !url.search.includes("pu="));

  await expect(page.getByRole("heading", { name: /Baseline — roster as-is/ })).toBeVisible({ timeout: 20_000 });
});
