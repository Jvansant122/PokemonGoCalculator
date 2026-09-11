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

/**
 * Imports the shared sample roster on the Roster tab (its owner as of
 * 2026-09-10 — see PLAN_roster_tab.md; it used to be embedded directly in
 * this tab). localStorage persists across the `page.goto` navigation, same
 * origin — the caller navigates back to `?view=power-up-optimizer`
 * afterward.
 */
async function importSampleRosterViaRosterTab(page: Page) {
  await page.goto("/?view=roster");
  await page.locator("summary", { hasText: "Import a whole roster" }).click();
  const pasteArea = page.locator("#roster-import-paste");
  await expect(pasteArea).toBeVisible();
  await pasteArea.fill(sampleCsv);
  await page.getByRole("button", { name: "Import pasted CSV" }).click();
  await expect(page.locator("summary", { hasText: /Import a whole roster.*[1-9]\d* Pokémon stored/ })).toBeVisible();
}

test("power-up-optimizer multi-raid: switch mode, import a roster, run a sweep off the main thread, real rows render", async ({ page }) => {
  const { consoleErrors, pageErrors } = attachErrorListeners(page);

  // Real Poke Genie sample fixture — same fixture Phase 1's own unit tests
  // (import/pokeGenieMatch.test.ts) exercise, so this is a real,
  // previously-verified-to-match export, not synthetic data. Imported on the
  // Roster tab (its owner as of 2026-09-10), then read back here via
  // localStorage.
  await importSampleRosterViaRosterTab(page);

  await page.goto("/?view=power-up-optimizer");
  await expect(page.getByRole("heading", { name: "Assumptions", exact: true })).toBeVisible();
  await expandAssumptions(page);

  await page.getByRole("button", { name: "Multi-raid — whole imported roster vs. a boss set" }).click();
  await expect(page.getByRole("heading", { name: "Multi-raid sweep" })).toBeVisible();
  await expect(page.locator(".species-picker-hint", { hasText: /boss(es)? resolved and encoded/ })).toBeVisible();

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

/**
 * The multiRaidSignificanceMode toggle (2026-09-10) — "aggregate-only"
 * (default) vs. "aggregate-or-per-boss". A candidate significant against a
 * SINGLE boss but not the boss-set average is filtered out of the ranked
 * table entirely under the default mode, and the hidden-count line on the
 * summary card names how many. Checking the toggle re-runs the sweep and
 * must reveal exactly those candidates — never a different set, never a
 * different count than what the summary card claimed.
 *
 * Reads the real PARSED count rather than trusting a single visibility/text
 * check — the hidden-count line's own text changes for a purely cosmetic
 * reason (a trailing hint disappears) the instant the checkbox is toggled,
 * well before the second async worker round trip actually finishes, so a
 * bare "text changed" assertion would pass without ever waiting for the new
 * result. `expect.poll` keeps re-reading the parsed number until it settles.
 */
test("power-up-optimizer multi-raid: the significance-mode toggle changes which candidates qualify, consistently with the hidden-count line", async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = attachErrorListeners(page);

  await importSampleRosterViaRosterTab(page);

  await page.goto("/?view=power-up-optimizer");
  await expandAssumptions(page);
  await page.getByRole("button", { name: "Multi-raid — whole imported roster vs. a boss set" }).click();
  await expect(page.getByRole("heading", { name: "Multi-raid sweep" })).toBeVisible();

  const checkbox = page.getByRole("checkbox", { name: /Also count a candidate that only helps against one boss/ });
  await expect(checkbox).toBeVisible();
  await expect(checkbox).not.toBeChecked(); // default: aggregate-only

  const runSweepButton = page.getByRole("button", { name: "Run sweep" });
  await expect(runSweepButton).toBeEnabled({ timeout: 10_000 });
  await runSweepButton.click();
  await expect(page.getByRole("heading", { name: "Ranked candidates" })).toBeVisible({ timeout: 20_000 });

  const resultCard = page
    .getByRole("heading", { name: "Multi-raid sweep" })
    .locator("xpath=ancestor::details[1]")
    .locator(".result-card")
    .first();
  const hiddenLine = resultCard.getByText(/candidates? hidden: significant against one boss but not on average/);
  await expect(hiddenLine).toBeVisible();
  const hiddenCountBefore = Number((await hiddenLine.innerText()).match(/^(\d+)/)?.[1]);

  async function qualifyingRowCount(): Promise<number> {
    const showAllButton = page.getByRole("button", { name: /^Show all \d+$/ });
    if (await showAllButton.isVisible().catch(() => false)) {
      return Number((await showAllButton.innerText()).match(/Show all (\d+)/)?.[1]);
    }
    const rankedTable = page.getByRole("heading", { name: "Ranked candidates" }).locator("xpath=following-sibling::div[1]//table");
    return await rankedTable.locator("tbody tr").count();
  }
  const rowCountBefore = await qualifyingRowCount();

  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await runSweepButton.click();
  await expect.poll(async () => Number((await hiddenLine.innerText()).match(/^(\d+)/)?.[1]), { timeout: 20_000 }).toBe(0);

  const rowCountAfter = await qualifyingRowCount();
  // The row count must have grown by exactly the number that was hidden before.
  expect(rowCountAfter - rowCountBefore).toBe(hiddenCountBefore);

  // The committed budget plan re-ran under the same toggle and never
  // disagrees with the ranked table about what's real (it may or may not
  // change its own committed steps, but it must still render a coherent
  // ledger, not an error).
  const budgetSection = page.getByRole("heading", { name: "Fixed-budget plan" }).locator("xpath=ancestor::details[1]");
  await expect(budgetSection.getByText("Steps committed")).toBeVisible();

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

/**
 * Hypothetical catches (IDEAS.md #3, "add a 7th") — a real species at a real
 * raid-catch level, compared against the whole boss set WITHOUT being priced
 * or entering the fixed-budget plan. Adding one must visibly produce its own
 * "What if you caught a fresh one?" section with real numbers, never a blank
 * placeholder — the section is entirely absent before any row is added.
 */
test("power-up-optimizer multi-raid: adding a hypothetical catch produces its own section with real per-boss numbers", async ({ page }) => {
  const { consoleErrors, pageErrors } = attachErrorListeners(page);

  await importSampleRosterViaRosterTab(page);

  await page.goto("/?view=power-up-optimizer");
  await expandAssumptions(page);
  await page.getByRole("button", { name: "Multi-raid — whole imported roster vs. a boss set" }).click();
  await expect(page.getByRole("heading", { name: "Multi-raid sweep" })).toBeVisible();

  await page.getByRole("button", { name: "Add hypothetical catch" }).click();
  const pickerInput = page.locator("#pu-hypothetical-0-input");
  await pickerInput.click();
  await pickerInput.fill("dragonite");
  const firstOption = page.locator("#pu-hypothetical-0-listbox li").first();
  await expect(firstOption).toBeVisible();
  await firstOption.locator("button").click();

  const runSweepButton = page.getByRole("button", { name: "Run sweep" });
  await expect(runSweepButton).toBeEnabled({ timeout: 10_000 });
  await runSweepButton.click();
  await expect(page.getByRole("heading", { name: "Ranked candidates" })).toBeVisible({ timeout: 20_000 });

  const hypotheticalSection = page
    .getByRole("heading", { name: /What if you caught a fresh one\?/ })
    .locator("xpath=ancestor::details[1]");
  await expect(hypotheticalSection).toBeVisible();
  await expect(hypotheticalSection.locator("tbody tr").first()).toContainText("Dragonite");
  // Level 20 (the row's default) rendered in its own column, not left blank.
  await expect(hypotheticalSection.locator("tbody tr").first()).toContainText("20");

  // Never priced, never part of the fixed-budget plan — the plan's own
  // section must render normally with no mention of this species being
  // "planned," proving the two computations stayed genuinely separate.
  const budgetSection = page.getByRole("heading", { name: "Fixed-budget plan" }).locator("xpath=ancestor::details[1]");
  await expect(budgetSection.getByText("Steps committed")).toBeVisible();

  const bodyText = await page.locator("body").innerText();
  expect(bodyText, "rendered page text").not.toMatch(/\bNaN\b/);
  expect(bodyText, "rendered page text").not.toMatch(/\bInfinity\b/);

  expect(consoleErrors, "console.error calls").toEqual([]);
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

/**
 * Per-boss hand-picking in BossSetPanel.tsx (2026-09-10) — the single-boss
 * case is the headline (a user hand-picking exactly the one raid they're
 * attending tonight, bench included), so this drives THAT path end to end:
 * search, "Use only this boss," a sweep whose own "Bosses swept" figure
 * confirms it actually ran against exactly one boss, and a share link that
 * restores the same RESOLVED boss id — never a re-derived filter result,
 * per multiRaidBossSet.ts's own doc comment and the standing decision in
 * CLAUDE.md that `multiRaidBossIds` is always resolved ids, never a filter.
 */
test("power-up-optimizer multi-raid: hand-picking a single boss runs the sweep against exactly that boss, and survives a share-link round trip", async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = attachErrorListeners(page);

  await importSampleRosterViaRosterTab(page);

  await page.goto("/?view=power-up-optimizer");
  await expandAssumptions(page);
  await page.getByRole("button", { name: "Multi-raid — whole imported roster vs. a boss set" }).click();
  await expect(page.getByRole("heading", { name: "Multi-raid sweep" })).toBeVisible();

  // Search for a specific boss and commit to it as the ONLY boss in the set —
  // the fast, two-action single-boss path this feature exists for.
  const pickerInput = page.locator("#pu-multiraid-handpick-input");
  await pickerInput.click();
  await pickerInput.fill("tyranitar");
  const firstOption = page.locator("#pu-multiraid-handpick-listbox li").first();
  await expect(firstOption).toBeVisible();
  await firstOption.locator("button").click();
  await page.getByRole("button", { name: "Use only this boss" }).click();

  // Exactly one row in the resolved-set list, with a Remove control.
  const bossListItems = page.locator(".boss-set-list li");
  await expect(bossListItems).toHaveCount(1);
  await expect(bossListItems.first().getByRole("button", { name: /^Remove/ })).toBeVisible();

  const runSweepButton = page.getByRole("button", { name: "Run sweep" });
  await expect(runSweepButton).toBeEnabled({ timeout: 10_000 });
  await runSweepButton.click();
  await expect(page.getByRole("heading", { name: "Ranked candidates" })).toBeVisible({ timeout: 20_000 });

  // "Bosses swept" is the real, computed proof the sweep actually ran
  // against exactly the one hand-picked boss, not a stale/bulk-filtered set.
  const resultCard = page
    .getByRole("heading", { name: "Multi-raid sweep" })
    .locator("xpath=ancestor::details[1]")
    .locator(".result-card")
    .first();
  await expect(resultCard.getByText("Bosses swept").locator("xpath=following-sibling::*[1]")).toHaveText("1");

  // Build a share link and confirm a FRESH context restores the exact same
  // resolved boss — never re-deriving a filter result on load.
  const bossLabelBefore = await page.locator(".boss-set-list-label").first().innerText();
  await page.getByRole("button", { name: "Build link" }).click();
  const shareUrlInput = page.locator(".share-row input[readonly]");
  await expect(shareUrlInput).toBeVisible();
  const shareUrl = await shareUrlInput.inputValue();

  const freshPage = await page.context().newPage();
  await freshPage.goto(shareUrl);
  await expandAssumptions(freshPage);
  await expect(freshPage.getByRole("heading", { name: "Multi-raid sweep" })).toBeVisible();
  const freshBossListItems = freshPage.locator(".boss-set-list li");
  await expect(freshBossListItems).toHaveCount(1);
  await expect(freshBossListItems.first().locator(".boss-set-list-label")).toHaveText(bossLabelBefore);
  await freshPage.close();

  expect(consoleErrors, "console.error calls").toEqual([]);
  expect(pageErrors, "uncaught page errors").toEqual([]);
});
