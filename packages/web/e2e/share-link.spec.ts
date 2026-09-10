import { test, expect, type Page } from "@playwright/test";

/**
 * Every tab's "Assumptions" section collapses by default (2026-09-10) —
 * every control this whole spec file drives lives inside it, so each test
 * needs it open before interacting with anything inside. Sets `open`
 * directly (idempotent) rather than `.click()`-ing the summary (which
 * TOGGLES — unsafe to call unconditionally on a `freshPage` that may
 * already be open via shared-context localStorage, see
 * collapsibleState.ts's own doc comment on that persistence).
 */
async function expandAssumptions(page: Page) {
  // `exact: true` matters here specifically: "Known caveats" (a sibling
  // section) nests its own sub-heading quoting the "More detailed
  // assumptions" checkbox by name, which a bare substring match would also
  // pick up once that section has ever been expanded (fold state persists
  // per browser via collapsibleState.ts) — see ComparatorView.tsx/
  // TeamRaidView.tsx's own sub-heading text for the same reasoning.
  const details = page.getByRole("heading", { name: "Assumptions", exact: true }).locator("xpath=ancestor::details[1]");
  await details.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
}

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
  await expandAssumptions(page);

  const levelInput = page.locator("#level");
  await expect(levelInput).toBeVisible();
  const originalValue = await levelInput.inputValue();
  // Level's own control caps at MAX_POKEMON_POWER_UP_LEVEL (50, see
  // AssumptionPanel.tsx — raised from a stale 40 UI-only cap 2026-09-10) —
  // stay in range. Deliberately uses the real ceiling itself as the changed
  // value so this round-trip test also doubles as a boundary check: the top
  // of the range is exactly the value most likely to fall off a CPM lookup
  // if the raised cap were ever wrong.
  const changedValue = originalValue === "50" ? "22" : "50";

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
  await expandAssumptions(freshPage);
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
 *
 * Both the dodge group AND the override checkbox live behind the "More
 * detailed assumptions" gate (showDetailedAssumptions, added 2026-09-10) —
 * so this also exercises THAT share-link surface end to end: unchecked by
 * default, must be turned on before the override checkbox is even reachable,
 * and its own `true` value must survive the round trip too, or a fresh load
 * of the shared link would silently re-hide the very override it's carrying.
 */
test("comparator: a per-candidate dodge override survives a shared link round trip", async ({ page }) => {
  await page.goto("/?view=comparator");
  await expandAssumptions(page);

  // The dodge group is hidden until "More detailed assumptions" is checked —
  // that's the tidy default this whole feature exists to provide.
  const detailedToggle = page.locator("#comparator-detailed-assumptions");
  await expect(detailedToggle).toBeVisible();
  await expect(detailedToggle).not.toBeChecked();
  const overrideToggle = page.locator("#candidate-a-dodge-override-toggle");
  await expect(overrideToggle).toBeHidden();

  await detailedToggle.check();
  await expect(overrideToggle).toBeVisible();
  await expect(overrideToggle).not.toBeChecked();

  // Checking the override on seeds it from the shared setting (Perfect, the
  // default dodge model) rather than a "same as shared" sentinel — change it
  // to a different value so the round trip below proves an actual edit
  // survives, not just the seeded default.
  await overrideToggle.check();
  const dodgeOverrideSelect = page.locator("#candidate-a-dodge-override");
  await expect(dodgeOverrideSelect).toBeVisible();
  await expect(dodgeOverrideSelect).toHaveValue("perfect");
  await dodgeOverrideSelect.selectOption("none");
  await expect(dodgeOverrideSelect).toHaveValue("none");

  await page.getByRole("button", { name: "Build link" }).click();

  const shareUrlInput = page.locator(".share-row input[readonly]");
  await expect(shareUrlInput).toBeVisible();
  const shareUrl = await shareUrlInput.inputValue();
  expect(shareUrl.length).toBeGreaterThan(0);

  const freshPage = await page.context().newPage();
  await freshPage.goto(shareUrl);
  await expandAssumptions(freshPage);
  await expect(freshPage.locator("#comparator-detailed-assumptions")).toBeChecked();
  const freshOverrideToggle = freshPage.locator("#candidate-a-dodge-override-toggle");
  await expect(freshOverrideToggle).toBeChecked();
  const freshDodgeOverrideSelect = freshPage.locator("#candidate-a-dodge-override");
  await expect(freshDodgeOverrideSelect).toBeVisible();
  await expect(freshDodgeOverrideSelect).toHaveValue("none");
  await freshPage.close();
});

/**
 * Mega Level (megaLevelSelect.tsx) is a NEW per-slot share-link surface added
 * across all six tabs — same "recurring bug class" reasoning as the checks
 * above. Team Raid's own default roster already fields a real mega/primal
 * slot (latios-mega, slot 1), so its Mega Level <select> is visible with no
 * setup needed, unlike the Comparator's default candidates (neither is a
 * mega form).
 *
 * Selects "high", not "super-max": as of 2026-09-10 the option list itself is
 * gated on canReachSuperMax (megaLevelSelect.tsx's selectableMegaLevels), and
 * latios-mega carries no "+" charged move, so "Super Max" is not among the
 * options this <select> offers by default — see megaLevelSelect.test.ts for
 * that gate's own dedicated unit coverage, including the "kept selectable for
 * an already-encoded value" exception this test would otherwise be hitting
 * by accident rather than on purpose. "high" still proves the exact same
 * round-trip mechanism (any non-base MegaLevel survives a share link) without
 * relying on species eligibility.
 */
test("team-raid: a slot's Mega Level survives a shared link round trip", async ({ page }) => {
  await page.goto("/?view=team-raid");
  await expandAssumptions(page);

  const megaLevelSelect = page.locator("#team-slot-0-megaLevel");
  await expect(megaLevelSelect).toBeVisible();
  await expect(megaLevelSelect).toHaveValue("base");

  await megaLevelSelect.selectOption("high");
  await expect(megaLevelSelect).toHaveValue("high");

  await page.getByRole("button", { name: "Build link" }).click();

  const shareUrlInput = page.locator(".share-row input[readonly]");
  await expect(shareUrlInput).toBeVisible();
  const shareUrl = await shareUrlInput.inputValue();
  expect(shareUrl.length).toBeGreaterThan(0);

  const freshPage = await page.context().newPage();
  await freshPage.goto(shareUrl);
  await expandAssumptions(freshPage);
  const freshMegaLevelSelect = freshPage.locator("#team-slot-0-megaLevel");
  await expect(freshMegaLevelSelect).toBeVisible();
  await expect(freshMegaLevelSelect).toHaveValue("high");
  await freshPage.close();
});
