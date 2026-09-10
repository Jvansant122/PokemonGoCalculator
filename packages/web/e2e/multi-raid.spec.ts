import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Multi-raid mode coverage for the Power-Up Optimizer — Phase 3b of
 * PLAN_multi_raid_roster_optimizer.md, item 4. Matches this suite's existing
 * style (tabs.spec.ts / share-link.spec.ts): real browser, real registry
 * data, no test ids (stable English headings/labels instead).
 *
 * Runs against the BUILT dist, same as every other spec here — this is also
 * the only place the worker's production URL (rewritten under the GitHub
 * Pages `base` path when CI builds with GITHUB_PAGES=true) gets exercised at
 * runtime rather than just inspected statically.
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
 * "Assumptions" collapses by default (2026-09-10) — the single-raid/multi-raid
 * mode switch buttons live inside it, so both tests below need it open before
 * clicking one. Sets `open` directly rather than `.click()`-ing the summary
 * (a toggle, unsafe to call unconditionally) — see share-link.spec.ts's
 * identical helper for the same reasoning.
 */
async function expandAssumptions(page: Page) {
  // `exact: true` — see share-link.spec.ts's identical helper for why a bare
  // substring match is unsafe here once "Known caveats" has ever been open.
  const details = page.getByRole("heading", { name: "Assumptions", exact: true }).locator("xpath=ancestor::details[1]");
  await details.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
}

test("power-up-optimizer multi-raid: switch mode, import a roster, run a sweep off the main thread, real rows render", async ({ page }) => {
  const { consoleErrors, pageErrors } = attachErrorListeners(page);

  await page.goto("/?view=power-up-optimizer");
  await expect(page.getByRole("heading", { name: "Assumptions", exact: true })).toBeVisible();
  await expandAssumptions(page);

  await page.getByRole("button", { name: "Multi-raid — whole imported roster vs. a boss set" }).click();
  await expect(page.getByRole("heading", { name: "Multi-raid sweep" })).toBeVisible();
  await expect(page.locator(".species-picker-hint", { hasText: /boss(es)? resolved and encoded/ })).toBeVisible();

  // Expand the (collapsed by default) <details> roster import panel and
  // paste the real Poke Genie sample fixture — same fixture Phase 1's own
  // unit tests (import/pokeGenieMatch.test.ts) exercise, so this is a real,
  // previously-verified-to-match export, not synthetic data.
  await page.locator("summary", { hasText: "Import a whole roster" }).click();
  const pasteArea = page.locator("#roster-import-paste");
  await expect(pasteArea).toBeVisible();
  await pasteArea.fill(sampleCsv);
  await page.getByRole("button", { name: "Import pasted CSV" }).click();

  // A real import happened — the <details> summary's own Pokémon count goes
  // from 0 to a real positive number.
  await expect(page.locator("summary", { hasText: /Import a whole roster.*[1-9]\d* Pokémon stored/ })).toBeVisible();

  const runSweepButton = page.getByRole("button", { name: "Run sweep" });
  await expect(runSweepButton).toBeEnabled({ timeout: 10_000 });
  await runSweepButton.click();

  // Coarse "running" state (never a fake percentage — see
  // rosterPlanner.worker.ts's own doc comment) is visible while the sweep is
  // in flight, then the real ranked-candidates result renders.
  await expect(page.getByRole("heading", { name: "Ranked candidates" })).toBeVisible({ timeout: 20_000 });

  // "Multi-raid sweep" is a CollapsibleSection.tsx <details> — its heading
  // lives inside its own <summary>, so the panel containing the rest of the
  // section's content is the heading's grandparent (<details>), not its
  // immediate parent (<summary>).
  const resultCard = page
    .getByRole("heading", { name: "Multi-raid sweep" })
    .locator("xpath=ancestor::details[1]")
    .locator(".result-card")
    .first();
  await expect(resultCard).toContainText("Bosses swept");

  // "real rows render" — at least one candidate row in the ranked table
  // (this pool's own strong legendaries/mega-capable species against
  // whichever bosses are live today should always produce at least one).
  const rankedTable = page.getByRole("heading", { name: "Ranked candidates" }).locator("xpath=following-sibling::div[1]//table");
  await expect(rankedTable.locator("tbody tr").first()).toBeVisible();

  // ranOn ("computed off the main thread" or the honest fallback wording) is
  // shown once the sweep completes — proves the worker path (or its
  // documented fallback) actually reported back, not just that a table
  // appeared. `.first()` because the Phase 4 budget-plan section below uses
  // the SAME wording for its own (separate) worker round trip.
  await expect(page.getByText(/computed (off|on) the main thread/).first()).toBeVisible();

  // Phase 4's fixed-budget plan is computed TOGETHER with the ranked sweep
  // above, off the main thread via the worker's SECOND request type
  // (rosterPlanner.worker.ts's "plan" message) — its own section renders
  // once that second round trip completes too, never left stuck on "click
  // Run sweep above" once a real sweep has already finished.
  const budgetSection = page.getByRole("heading", { name: "Fixed-budget plan" }).locator("xpath=ancestor::details[1]");
  await expect(budgetSection.getByText(/computed (off|on) the main thread/)).toBeVisible({ timeout: 20_000 });
  await expect(budgetSection.getByText("Steps committed")).toBeVisible();
  // Either a real ledger line or the "blocked, not done"/"nothing further
  // measurably helps" callout — either way proves a REAL RosterBudgetPlan
  // came back, not just the section's own static intro copy.
  await expect(budgetSection.getByText(/Stardust/)).toBeVisible();
  await expect(budgetSection.locator(".blocked-gain-callout")).toBeVisible();

  const bodyText = await page.locator("body").innerText();
  expect(bodyText, "rendered page text").not.toMatch(/\bNaN\b/);
  expect(bodyText, "rendered page text").not.toMatch(/\bInfinity\b/);

  expect(consoleErrors, "console.error calls").toEqual([]);
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

test("power-up-optimizer multi-raid: a share link opened in a fresh browser context (no localStorage) shows the 'no roster imported' empty state", async ({
  page,
  browser,
}) => {
  await page.goto("/?view=power-up-optimizer");
  await expandAssumptions(page);
  await page.getByRole("button", { name: "Multi-raid — whole imported roster vs. a boss set" }).click();
  await expect(page.getByRole("heading", { name: "Multi-raid sweep" })).toBeVisible();

  await page.getByRole("button", { name: "Build link" }).click();
  const shareUrlInput = page.locator(".share-row input[readonly]");
  await expect(shareUrlInput).toBeVisible();
  const shareUrl = await shareUrlInput.inputValue();
  expect(shareUrl.length).toBeGreaterThan(0);

  // A genuinely fresh browser CONTEXT (not just a new tab/page in the same
  // context) — no localStorage carried over, unlike page.context().newPage()
  // — since the roster deliberately lives only in local storage, never the
  // share link itself (PLAN §3.2 / CLAUDE.md's documented exception).
  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  const { consoleErrors, pageErrors } = attachErrorListeners(freshPage);

  await freshPage.goto(shareUrl);

  // Settings round-tripped (still multi-raid mode, not silently reverted to
  // single-raid) ...
  await expect(freshPage.getByRole("heading", { name: "Multi-raid sweep" })).toBeVisible();
  // ... but the roster itself did NOT — an explicit, never-silent empty
  // state naming what's missing and pointing at the fix, per PLAN §3.2.
  await expect(freshPage.getByText(/No roster imported in this browser yet — import a Poke Genie CSV export/)).toBeVisible();
  // The SAME warning also appears near "Share this scenario" itself (a
  // second, independent surface making the same point).
  await expect(freshPage.getByText(/roster lives only in THIS browser/i)).toBeVisible();

  expect(consoleErrors, "console.error calls").toEqual([]);
  expect(pageErrors, "uncaught page errors").toEqual([]);

  await freshContext.close();
});
