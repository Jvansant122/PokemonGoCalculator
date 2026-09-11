import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * The Roster tab (PLAN_roster_tab.md) — hand-entry/editing, the pre-existing
 * CSV import (moved here from the Power-Up Optimizer tab), and a
 * self-contained save code. Matches this suite's existing style
 * (multi-raid.spec.ts / lineup-builder.spec.ts): real browser, real registry
 * data, stable English headings/labels, the shared pokeGenieSample.csv
 * fixture.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const sampleCsv = fs.readFileSync(path.join(here, "../src/import/test/pokeGenieSample.csv"), "utf-8");

function attachErrorListeners(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  return { consoleErrors, pageErrors };
}

/**
 * Picks a species by its EXACT displayed label, not just the first search
 * match — "tyranitar" as a query also matches "Mega Tyranitar" (a real
 * species in this registry), so a positional `.first()` pick is ambiguous
 * and non-deterministic. `exactLabel` disambiguates via the option's own
 * accessible name.
 */
async function pickSpecies(page: Page, idPrefix: string, query: string, exactLabel: string) {
  const input = page.locator(`#${idPrefix}-input`);
  await input.click();
  await input.fill(query);
  const option = page.locator(`#${idPrefix}-listbox`).getByRole("option", { name: exactLabel, exact: true });
  await expect(option).toBeVisible();
  await option.locator("button").click();
}

test("roster: hand-adding a Pokémon shows it with no default-moveset badge, and it reaches the Power-Up Optimizer and Lineup Builder", async ({ page }) => {
  const { consoleErrors, pageErrors } = attachErrorListeners(page);

  await page.goto("/?view=roster");
  await expect(page.getByRole("heading", { name: "Roster summary" })).toBeVisible();
  await expect(page.getByText("0 Pokémon in your roster", { exact: false })).toBeVisible();

  await pickSpecies(page, "roster-form-species", "tyranitar", "Tyranitar");
  await page.getByRole("button", { name: "Add this Pokémon" }).click();

  await expect(page.getByText(/Added .*Tyranitar.* to your roster/)).toBeVisible();

  const row = page.locator("table.time-series-table tbody tr", { hasText: "Tyranitar" }).first();
  await expect(row).toBeVisible();
  // Critical requirement (PLAN_roster_tab.md): a hand-entered Pokémon has a
  // KNOWN moveset by definition — never the "default"/"not recognized"
  // badge a blank CSV column earns.
  await expect(row).not.toContainText("default");
  await expect(row).not.toContainText("not recognized");

  // Reaches the Power-Up Optimizer identically to an imported entry — same
  // roster pool, read fresh from localStorage.
  await page.goto("/?view=power-up-optimizer");
  await expect(page.getByText(/1 Pokémon in your roster/)).toBeVisible();

  // ...and the Team Raid Simulator's Lineup Builder, which is blocked on
  // "no-roster" only when the pool is genuinely empty.
  await page.goto("/?view=team-raid");
  await page.getByRole("button", { name: "Build best lineup from my imported roster" }).click();
  await expect(page.getByText("No imported roster")).not.toBeVisible();
  await expect(page.getByText("Best lineup (filled below)")).toBeVisible({ timeout: 15_000 });

  expect(consoleErrors, `console errors: ${consoleErrors.join("; ")}`).toEqual([]);
  expect(pageErrors, `page errors: ${pageErrors.join("; ")}`).toEqual([]);
});

test("roster: editing an imported entry's blank charged move clears its default-moveset badge", async ({ page }) => {
  await page.goto("/?view=roster");
  await page.locator("summary", { hasText: "Import a whole roster" }).click();
  await page.locator("#roster-import-paste").fill(sampleCsv);
  await page.getByRole("button", { name: "Import pasted CSV" }).click();
  await expect(page.locator("summary", { hasText: /Import a whole roster.*[1-9]\d* Pokémon stored/ })).toBeVisible();

  // Palkia (line 2 of the fixture) has a known fast move but a BLANK charged
  // move column — earns "default charged move".
  const row = page.locator("table.time-series-table tbody tr", { hasText: "Palkia" }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("default charged move");

  await row.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit this Pokémon" })).toBeVisible();

  // Explicitly pick a charged move — the point of editing.
  const chargedSelect = page.locator("#roster-form-charged");
  await chargedSelect.click();
  await page.locator("#roster-form-charged-listbox li").first().click();
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText(/Saved changes to .*Palkia/)).toBeVisible();
  const rowAfter = page.locator("table.time-series-table tbody tr", { hasText: "Palkia" }).first();
  await expect(rowAfter).not.toContainText("default charged move");
});

test("roster: a save code round-trips a roster exactly, and a corrupted code fails legibly without touching the current roster", async ({ page }) => {
  await page.goto("/?view=roster");
  await pickSpecies(page, "roster-form-species", "tyranitar", "Tyranitar");
  await page.getByRole("button", { name: "Add this Pokémon" }).click();
  await expect(page.getByText("1 Pokémon in your roster", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Generate save code" }).click();
  const codeArea = page.locator("textarea[readonly]");
  await expect(codeArea).toBeVisible();
  const code = await codeArea.inputValue();
  expect(code.startsWith("pogo-roster-v1:")).toBe(true);
  await expect(page.getByText(/% smaller than the raw JSON/)).toBeVisible();

  // Clear the roster (the pre-existing CSV-import panel's own control).
  await page.locator("summary", { hasText: "Import a whole roster" }).click();
  await page.getByRole("button", { name: "Clear stored roster" }).click();
  await expect(page.getByText("0 Pokémon in your roster", { exact: false })).toBeVisible();

  // Paste the code back, replacing the (now-empty) roster.
  await page.locator("#roster-load-code").fill(code);
  await page.getByLabel("Replace current roster").check();
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByText(/Restored 1 entry \(replaced your roster — 1 total now\)/)).toBeVisible();
  await expect(page.getByText("1 Pokémon in your roster", { exact: false })).toBeVisible();
  await expect(page.locator("table.time-series-table tbody tr", { hasText: "Tyranitar" })).toBeVisible();

  // A truncated/edited code must fail with a specific, legible error — never
  // a crash, and never a silent partial load of the still-intact roster.
  await page.locator("#roster-load-code").fill(code.slice(0, Math.floor(code.length * 0.5)));
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByText(/truncated or edited/)).toBeVisible();
  await expect(page.getByText("1 Pokémon in your roster", { exact: false })).toBeVisible();
});

test("roster: a share link restores the display setting only, never the roster itself", async ({ page, browser }) => {
  await page.goto("/?view=roster");
  await pickSpecies(page, "roster-form-species", "tyranitar", "Tyranitar");
  await page.getByRole("button", { name: "Add this Pokémon" }).click();
  await expect(page.getByText("1 Pokémon in your roster", { exact: false })).toBeVisible();

  await page.selectOption("#roster-sort-by", "level");

  await page.getByRole("button", { name: "Build link" }).click();
  const shareUrlInput = page.locator(".share-row input[readonly]");
  await expect(shareUrlInput).toBeVisible();
  const shareUrl = await shareUrlInput.inputValue();

  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  await freshPage.goto(shareUrl);
  await expect(freshPage.getByRole("heading", { name: "Roster summary" })).toBeVisible();
  await expect(freshPage.locator("#roster-sort-by")).toHaveValue("level");
  // The setting round-tripped; the roster contents did NOT (a fresh context
  // has no localStorage carried over).
  await expect(freshPage.getByText("0 Pokémon in your roster", { exact: false })).toBeVisible();
  await freshContext.close();
});
