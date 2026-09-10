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
 * Mega Level (megaLevelSelect.tsx) is a share-link surface added across all
 * six tabs — same "recurring bug class" reasoning as the checks above. Team
 * Raid's own default roster already fields a real mega/primal slot
 * (mewtwo-mega-x as of the 2026-09-10 default-roster replacement — see
 * TeamRaidView.tsx's own DEFAULT_TEAM_ASSUMPTIONS doc comment; this test has
 * outlived two earlier default rosters, `latios-mega` then `lucario-mega`,
 * without ever depending on which species it actually is), so its Mega Level
 * <select> is visible with no setup needed, unlike the Comparator's default
 * candidates (neither is a mega form).
 *
 * Selects "high", not "super-max": "base"/"high"/"max" are always offered
 * regardless of a species' own Super Max eligibility (only "super-max" is
 * conditionally gated on canReachSuperMax, megaLevelSelect.tsx's
 * selectableMegaLevels) — see megaLevelSelect.test.ts for that gate's own
 * dedicated unit coverage. "high" proves the exact same round-trip mechanism
 * (any non-base MegaLevel survives a share link) without depending on
 * whichever species happens to be in slot 0 today.
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

/**
 * The "Export roster to Power-Up Optimizer" button (TeamRaidView.tsx, see
 * teamRaidExport.ts) — a genuine NAVIGATION (`window.location.href`, not an
 * in-SPA tab switch, see that function's own doc comment for why), so
 * `page.click()` below must be paired with `waitForURL` rather than assuming
 * the click resolves synchronously. Uses the tab's own default roster/boss
 * (no setup needed) and asserts the destination tab actually landed on
 * `view=power-up-optimizer` with the SAME roster and boss Team Raid showed,
 * not just that some navigation happened.
 */
test("team-raid: 'Export roster to Power-Up Optimizer' carries the roster and boss across tabs", async ({ page }) => {
  await page.goto("/?view=team-raid");
  const rosterSubtitle = page.locator(".subtitle").first();
  await expect(rosterSubtitle).toContainText("Mega Mewtwo X");
  await expect(rosterSubtitle).toContainText("Mega Tyranitar");

  await page.getByRole("button", { name: "Export roster to Power-Up Optimizer →" }).click();
  await page.waitForURL(/view=power-up-optimizer/);

  const destSubtitle = page.locator(".subtitle").first();
  await expect(destSubtitle).toContainText("Mega Mewtwo X");
  await expect(destSubtitle).toContainText("Mega Tyranitar");
});

/**
 * The reverse of the export above: "Send post-plan roster to Team Raid
 * Simulator" (PowerUpOptimizerView.tsx, single-raid mode only, see
 * powerUpOptimizerExport.ts) — same real NAVIGATION mechanism, so the same
 * `waitForURL` pairing applies. Uses the tab's own default roster/boss (no
 * setup needed) and asserts the destination landed on `view=team-raid` with
 * the SAME roster/boss names the source tab showed.
 */
test("power-up-optimizer: 'Send post-plan roster to Team Raid Simulator' carries the roster and boss across tabs", async ({ page }) => {
  await page.goto("/?view=power-up-optimizer");
  const rosterSubtitle = page.locator(".subtitle").first();
  await expect(rosterSubtitle).toContainText("Mega Lucario");
  await expect(rosterSubtitle).toContainText("Tyranitar");

  await page.getByRole("button", { name: "Send post-plan roster to Team Raid Simulator →" }).click();
  await page.waitForURL(/view=team-raid/);

  const destSubtitle = page.locator(".subtitle").first();
  await expect(destSubtitle).toContainText("Mega Lucario");
  await expect(destSubtitle).toContainText("Tyranitar");

  // Regression for the ~40% clear-time-divergence bug: the tab's own
  // DEFAULT_ASSUMPTIONS fields six slots starting at six DIFFERENT levels
  // (35/30/40/38/31/25), and its default 200k-stardust/20-candy/10-XL
  // budget powers up slot 1 (Mega Lucario, 35->36.5) and slot 5
  // (Conkeldurr, 31->37.5) per the committed plan's own finalLevels —
  // confirm those POST-PLAN levels survive the hand-off as distinct
  // per-slot overrides (TeamSlotAssumption.level, surfaced via the
  // "Own level/IVs:" hint), not collapsed onto one shared roster-wide mean.
  await expandAssumptions(page);
  const ownLevelHints = page.locator("p.species-picker-hint", { hasText: "Own level/IVs:" });
  await expect(ownLevelHints).toHaveCount(6);
  const teamLevels = (await ownLevelHints.allTextContents()).map((h) => h.match(/Own level\/IVs: ([\d.]+)/)?.[1]);
  expect(teamLevels).toEqual(["36.5", "30", "40", "38", "37.5", "25"]);
});

/**
 * Species Report's "Send to Team Raid Simulator" row action — the OTHER
 * cross-tab mechanism (a lifted-prop hand-off through App.tsx's own state,
 * see teamRaidPrefill.ts, NOT a navigation), so this is a plain in-SPA click
 * and assertion rather than a `waitForURL`. Uses the tab's own default
 * species (Kartana) and whichever boss sorts first, and asserts Team Raid's
 * first roster slot shows that exact species after the hand-off.
 */
test("species-report: 'Send to Team Raid Simulator' hands the species and boss into Team Raid's first slot", async ({ page }) => {
  await page.goto("/?view=species-report");
  await expect(page.locator(".subtitle").first()).toContainText("Kartana", { timeout: 20_000 });

  const firstRowButton = page.getByRole("button", { name: "Send to Team Raid Simulator →" }).first();
  await expect(firstRowButton).toBeVisible({ timeout: 20_000 });
  await firstRowButton.click();

  await expect(page.getByRole("tab", { name: "Team Raid Simulator" })).toHaveAttribute("aria-selected", "true");
  const destSubtitle = page.locator(".subtitle").first();
  await expect(destSubtitle).toContainText("Kartana");
});
