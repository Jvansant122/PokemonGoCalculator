import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import { computeExpected } from "./helpers/runViaTsx.js";

/**
 * One browser smoke pass per tab: load `?view=<tab>`, assert nothing threw
 * (console error or uncaught page error), assert the tab's headline result
 * region actually rendered, and assert none of the "silently broken
 * calculation" tells (NaN/undefined/Infinity as literal rendered text) made
 * it onto the page. Selectors are heading text, not test ids — this project
 * has none, and every view's headline is a stable, English `<h2>` (see
 * ComparatorView.tsx et al.).
 */
const TABS: { view: string; headline: RegExp; timeout?: number }[] = [
  { view: "comparator", headline: /Fight results/ },
  { view: "team-raid", headline: /^Raid result$/ },
  // The sweep is debounced (300ms) and, even scoped to only currently-active
  // raids by default, is ~200 sims per boss over ~12 bosses — generous
  // timeout, no fixed sleep.
  { view: "species-report", headline: /Ranked against/, timeout: 20_000 },
  { view: "iv-breakpoints", headline: /Impact across every raid target this tool can model/ },
  { view: "attack-defense-breakpoints", headline: /own damage output vs/ },
  { view: "power-up-optimizer", headline: /Baseline — roster as-is/, timeout: 20_000 },
];

function attachErrorListeners(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  return { consoleErrors, pageErrors };
}

for (const tab of TABS) {
  test(`${tab.view}: loads with no console/page errors, a rendered headline, and no NaN/undefined/Infinity`, async ({ page }) => {
    const { consoleErrors, pageErrors } = attachErrorListeners(page);

    await page.goto(`/?view=${tab.view}`);

    await expect(page.getByRole("heading", { name: tab.headline })).toBeVisible({ timeout: tab.timeout ?? 5_000 });

    const bodyText = await page.locator("body").innerText();
    expect(bodyText, "rendered page text").not.toMatch(/\bNaN\b/);
    expect(bodyText, "rendered page text").not.toMatch(/\bundefined\b/);
    expect(bodyText, "rendered page text").not.toMatch(/\bInfinity\b/);

    expect(consoleErrors, "console.error calls").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
  });
}

// The fixed-budget planner is a second, DIFFERENT computation from the ranked
// candidate table above it (same section-adjacent convention as every other
// tab's multi-panel layout) — assert its own headline renders with a real
// ledger, not just that the tab as a whole didn't throw.
test("power-up-optimizer: fixed-budget plan section renders a spend ledger", async ({ page }) => {
  await page.goto("/?view=power-up-optimizer");
  const heading = page.getByRole("heading", { name: "Fixed-budget power-up plan" });
  await expect(heading).toBeVisible({ timeout: 20_000 });
  // This section is a CollapsibleSection.tsx <details>, not a plain
  // <section> — the heading now lives inside its own <summary>, so the
  // panel containing the REST of the section's content is the heading's
  // grandparent (<details>), not its immediate parent (<summary>).
  const section = heading.locator("xpath=ancestor::details[1]");
  await expect(section).toContainText(/Baseline team DPS/);
  await expect(section).toContainText(/Final team DPS/);
  await expect(section).toContainText(/Stardust spent/);
});

// For Comparator and Team Raid, cross-check one displayed number against the
// exact same pure run*Scenario function the view itself calls, run against
// the same DEFAULT_ASSUMPTIONS a fresh page load uses — the point is
// asserting UI === engine, not just "a number appeared somewhere".
test("comparator: displayed mean survival matches runComparatorScenario", async ({ page }) => {
  const expected = computeExpected("comparator") as { candidateName: string; meanSurvivalText: string };

  await page.goto("/?view=comparator");
  await expect(page.getByRole("heading", { name: /Fight results/ })).toBeVisible();

  const firstCard = page.locator(".result-card").first();
  await expect(firstCard.locator("h3")).toContainText(expected.candidateName);
  const meanSurvivalDd = firstCard.locator("dt", { hasText: "Mean survival" }).locator("xpath=following-sibling::dd[1]");
  await expect(meanSurvivalDd).toHaveText(expected.meanSurvivalText);
});

test("team-raid: displayed outcome/wipe count matches runTeamRaidScenario", async ({ page }) => {
  const expected = computeExpected("team-raid") as { outcomeText: string; wipeCount: number };

  await page.goto("/?view=team-raid");
  const heading = page.getByRole("heading", { name: "Raid result" });
  await expect(heading).toBeVisible();
  // "Raid result" panel = the heading (inside its own <summary> — see
  // CollapsibleSection.tsx) plus its outcome <p> and result-card dl as
  // FURTHER children of the same <details>, so the containing panel is the
  // heading's grandparent, not its immediate parent.
  const raidResultSection = heading.locator("xpath=ancestor::details[1]");
  await expect(raidResultSection).toContainText(expected.outcomeText);

  const resultCard = raidResultSection.locator(".result-card").first();
  const wipeCountDd = resultCard.locator("dt", { hasText: "Wipe count" }).locator("xpath=following-sibling::dd[1]");
  await expect(wipeCountDd).toHaveText(String(expected.wipeCount));
});
