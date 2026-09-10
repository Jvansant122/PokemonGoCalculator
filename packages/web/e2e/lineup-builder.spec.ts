import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * The single-trainer Lineup Builder (PLAN_lineup_builder.md) — builds Team
 * Raid Simulator's own 6-slot roster from an imported Poke Genie roster
 * (rosterPool.ts, localStorage-only), then carries that lineup onward via
 * the pre-existing "Export roster to Power-Up Optimizer" button. Matches
 * multi-raid.spec.ts's own precedent (real browser, real registry data,
 * stable English headings/labels, the shared pokeGenieSample.csv fixture).
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

async function importSampleRoster(page: Page) {
  await page.goto("/?view=power-up-optimizer");
  await expect(page.getByRole("heading", { name: "Assumptions", exact: true })).toBeVisible();
  const details = page.getByRole("heading", { name: "Assumptions", exact: true }).locator("xpath=ancestor::details[1]");
  await details.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  await page.getByRole("button", { name: "Multi-raid — whole imported roster vs. a boss set" }).click();
  await page.locator("summary", { hasText: "Import a whole roster" }).click();
  await page.locator("#roster-import-paste").fill(sampleCsv);
  await page.getByRole("button", { name: "Import pasted CSV" }).click();
  await expect(page.locator("summary", { hasText: /Import a whole roster.*[1-9]\d* Pokémon stored/ })).toBeVisible();
}

test("lineup builder: no imported roster shows an honest empty state, never a silent fallback", async ({ page }) => {
  const { consoleErrors, pageErrors } = attachErrorListeners(page);
  await page.goto("/?view=team-raid");
  await page.getByRole("button", { name: "Build best lineup from my imported roster" }).click();
  await expect(
    page.getByText("No imported roster — import a Poke Genie CSV in the Power-Up Optimizer tab's roster panel first"),
  ).toBeVisible();
  expect(consoleErrors, `console errors: ${consoleErrors.join("; ")}`).toEqual([]);
  expect(pageErrors, `page errors: ${pageErrors.join("; ")}`).toEqual([]);
});

test("lineup builder: builds a per-slot-leveled lineup from a real roster, shows the runner-up/margin, and exports it intact", async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = attachErrorListeners(page);

  await importSampleRoster(page);

  await page.goto("/?view=team-raid");
  await expect(page.getByRole("heading", { name: "Lineup Builder" })).toBeVisible();
  await page.getByRole("button", { name: "Build best lineup from my imported roster" }).click();

  // A real winner lineup, with the runner-up/margin comparison the
  // project's whole "where does the ranking flip" thesis requires — never
  // just a single unexplained winner.
  await expect(page.getByText("Best lineup (filled below)")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Runner-up:|No distinct runner-up found/)).toBeVisible();

  // The six built slots each carry their OWN roster level (never a shared
  // mean) — see TeamSlotAssumption.level's own doc comment. Expand the
  // (collapsed by default) Assumptions section to read the per-slot
  // override hints this feature added.
  const assumptionsDetails = page.getByRole("heading", { name: "Assumptions", exact: true }).locator("xpath=ancestor::details[1]");
  await assumptionsDetails.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  const ownLevelHints = page.locator("p.species-picker-hint", { hasText: "Own level/IVs:" });
  await expect(ownLevelHints).toHaveCount(6);
  const teamLevels = (await ownLevelHints.allTextContents()).map((h) => h.match(/Own level\/IVs: ([\d.]+)/)?.[1]);
  expect(teamLevels.every((l) => l !== undefined)).toBe(true);

  // The onward export (pre-existing button) carries the exact same per-slot
  // levels into the Power-Up Optimizer, not a collapsed shared spread — the
  // real, load-bearing consequence of this feature's whole point.
  await page.getByRole("button", { name: "Export roster to Power-Up Optimizer →" }).click();
  await page.waitForURL(/view=power-up-optimizer/);
  const puLevels: string[] = [];
  for (let i = 0; i < 6; i++) {
    puLevels.push(await page.locator(`#pu-slot-${i}-level`).inputValue());
  }
  expect(puLevels).toEqual(teamLevels);

  const bodyText = await page.locator("body").innerText();
  expect(bodyText, "rendered page text").not.toMatch(/\bNaN\b/);
  expect(consoleErrors, `console errors: ${consoleErrors.join("; ")}`).toEqual([]);
  expect(pageErrors, `page errors: ${pageErrors.join("; ")}`).toEqual([]);
});
