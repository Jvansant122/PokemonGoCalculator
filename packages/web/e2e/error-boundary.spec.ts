import { test, expect } from "@playwright/test";

/**
 * TabErrorBoundary (App.tsx/TabErrorBoundary.tsx) — a real crash triggered
 * through the UI, not a faked throw: every tab's `decodeXScenario` (base64url
 * + `JSON.parse`, see scenario.ts and its per-tab siblings) throws on a
 * malformed `pu=`/`s=`/etc. param, which is exactly the "chat client
 * truncated my link" path a real user hits (see this feature's own task,
 * step 1). Before this boundary existed, every one of these went to a fully
 * blank `<div id="root">` (confirmed live 2026-09-13) — these assertions
 * pin the fixed behavior, not just "didn't throw."
 */
test("power-up-optimizer: a malformed share link shows the crash fallback, not a blank page", async ({ page }) => {
  await page.goto("/?view=power-up-optimizer&pu=garbage");

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText('The "Power-Up Optimizer" tab hit an error while rendering')).toBeVisible();

  // The whole point: the crashing URL itself is right there, selectable, to
  // paste into a bug report — not just an apology with no reproduction.
  const shareUrlInput = page.locator(".tab-crash-callout .share-row input[readonly]");
  await expect(shareUrlInput).toBeVisible();
  await expect(shareUrlInput).toHaveValue(/pu=garbage/);

  // The masthead and tab-switcher nav — NOT wrapped by the boundary — must
  // still be usable so the fallback's "switch to another tab" line is true.
  await expect(page.getByRole("heading", { name: "Pokémon GO Scenario Comparator" })).toBeVisible();
  const comparatorTab = page.getByRole("tab", { name: "Two-Candidate Comparator" });
  await expect(comparatorTab).toBeVisible();
  await comparatorTab.click();
  await expect(page.getByRole("heading", { name: /Fight results/ })).toBeVisible();
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
  await page.goto("/?view=power-up-optimizer&pu=garbage");
  await expect(page.getByRole("alert")).toBeVisible();

  await page.getByRole("button", { name: "Reset this tab to defaults" }).click();
  await page.waitForURL((url) => !url.search.includes("pu="));

  await expect(page.getByRole("heading", { name: /Baseline — roster as-is/ })).toBeVisible({ timeout: 20_000 });
});
