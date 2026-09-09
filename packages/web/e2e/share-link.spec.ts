import { test, expect } from "@playwright/test";

/**
 * This project's most-repeated bug class (see CLAUDE.md, "Every user-facing
 * assumption must round-trip through Scenario"): a setting that visibly
 * updates the live UI but silently reverts to a default on a shared link.
 * Changes one assumption (Level) through the actual UI control, builds a
 * share link via the Comparator's own "Build link" button, loads that URL
 * fresh, and asserts the changed value survived the round trip.
 */
test("comparator: a changed assumption survives a shared link round trip", async ({ page }) => {
  await page.goto("/?view=comparator");

  const levelInput = page.locator("#level");
  await expect(levelInput).toBeVisible();
  const originalValue = await levelInput.inputValue();
  // Level's own control caps at 40 (see AssumptionPanel.tsx) — stay in range.
  const changedValue = originalValue === "38" ? "22" : "38";

  await levelInput.fill(changedValue);
  await levelInput.blur();
  await expect(levelInput).toHaveValue(changedValue);

  await page.getByRole("button", { name: "Build link" }).click();

  const shareUrlInput = page.locator(".share-row input[readonly]");
  await expect(shareUrlInput).toBeVisible();
  const shareUrl = await shareUrlInput.inputValue();
  expect(shareUrl.length).toBeGreaterThan(0);

  const freshPage = await page.context().newPage();
  await freshPage.goto(shareUrl);
  const freshLevelInput = freshPage.locator("#level");
  await expect(freshLevelInput).toBeVisible();
  await expect(freshLevelInput).toHaveValue(changedValue);
  await freshPage.close();
});

/**
 * The per-candidate dodge override (candidateDodge/candidateDodgeFastAttacks,
 * added alongside the "default dodge to Perfect everywhere" change) is a
 * second, independent share-link surface on the same tab — its own control,
 * its own Scenario fields, its own round-trip. Covers it the same way as the
 * shared Level check above rather than trusting that mechanism to generalize.
 */
test("comparator: a per-candidate dodge override survives a shared link round trip", async ({ page }) => {
  await page.goto("/?view=comparator");

  const dodgeOverrideSelect = page.locator("#candidate-a-dodge-override");
  await expect(dodgeOverrideSelect).toBeVisible();
  await expect(dodgeOverrideSelect).toHaveValue("same");

  await dodgeOverrideSelect.selectOption("perfect");
  await expect(dodgeOverrideSelect).toHaveValue("perfect");

  await page.getByRole("button", { name: "Build link" }).click();

  const shareUrlInput = page.locator(".share-row input[readonly]");
  await expect(shareUrlInput).toBeVisible();
  const shareUrl = await shareUrlInput.inputValue();
  expect(shareUrl.length).toBeGreaterThan(0);

  const freshPage = await page.context().newPage();
  await freshPage.goto(shareUrl);
  const freshDodgeOverrideSelect = freshPage.locator("#candidate-a-dodge-override");
  await expect(freshDodgeOverrideSelect).toBeVisible();
  await expect(freshDodgeOverrideSelect).toHaveValue("perfect");
  await freshPage.close();
});
