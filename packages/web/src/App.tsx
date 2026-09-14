import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ComparatorPrefill } from "./comparatorPrefill.js";
import type { TeamRaidPrefill } from "./teamRaidPrefill.js";
import { TabErrorBoundary } from "./TabErrorBoundary.js";
import { TabLoadingBar } from "./TabLoadingBar.js";

/**
 * Every view is a SEPARATE async chunk (site-builder, 2026-09-13 bundle-size
 * pass): registry.ts (and the ~2.7 MB compact `species.json` it bundles — see
 * that file's own doc comment) is a shared dependency of all seven views and
 * so is NOT split by this alone — it lands in whatever chunk the
 * first-rendered tab needs, same as before. What this DOES split off is each
 * OTHER tab's own code: a session that only ever opens the Comparator no
 * longer downloads the Power-Up Optimizer's roster planner (its own
 * PowerUpOptimizerAssumptionPanel.tsx is 1125 lines) or the Poke Genie CSV
 * import machinery until that tab is actually opened. Named exports (every
 * view file also exports plain helpers like DEFAULT_ASSUMPTIONS/
 * assumptionsToScenario used by scenarioRoundtrip.test.ts and friends), hence
 * the `.then` reshape rather than a bare `import()` — React.lazy requires a
 * `default` export.
 *
 * `TabErrorBoundary` must stay the OUTER boundary and `Suspense` the INNER
 * one (see the render tree below): a chunk that fails to fetch on a flaky
 * mobile connection rejects the dynamic import's promise, which React
 * surfaces as a thrown render error on the nearest boundary ABOVE the
 * `Suspense` — reversing the nesting would leave a failed chunk load with no
 * boundary above it to catch it at all.
 */
const ComparatorView = lazy(() => import("./ComparatorView.js").then((m) => ({ default: m.ComparatorView })));
const TeamRaidView = lazy(() => import("./TeamRaidView.js").then((m) => ({ default: m.TeamRaidView })));
const SpeciesReportView = lazy(() => import("./SpeciesReportView.js").then((m) => ({ default: m.SpeciesReportView })));
const IvBreakpointsView = lazy(() => import("./IvBreakpointsView.js").then((m) => ({ default: m.IvBreakpointsView })));
const AttackDefenseBreakpointsView = lazy(() =>
  import("./AttackDefenseBreakpointsView.js").then((m) => ({ default: m.AttackDefenseBreakpointsView })),
);
const PowerUpOptimizerView = lazy(() => import("./PowerUpOptimizerView.js").then((m) => ({ default: m.PowerUpOptimizerView })));
const RosterView = lazy(() => import("./RosterView.js").then((m) => ({ default: m.RosterView })));

/** The app's seven views. */
export type AppTab =
  | "comparator"
  | "team-raid"
  | "species-report"
  | "iv-breakpoints"
  | "attack-defense-breakpoints"
  | "power-up-optimizer"
  | "roster";

/**
 * Which tab a shared link should land on. Deliberately a SEPARATE query param
 * from any view's own scenario param (`s` for Scenario, `ts` for TeamScenario,
 * `sr` for SpeciesReportScenario, `ivc` for IvBreakpointsScenario, `adb` for
 * AttackDefenseBreakpointsScenario, `pu` for PowerUpOptimizerScenario, `rt` for
 * RosterScenario) — a URL can only ever be "about" one tab's scenario at
 * a time, but the seven scenario encodings themselves stay fully independent
 * so this file never has to know their shapes. Every view's own "Build link"
 * button additionally stamps this param onto its generated URL so reloading
 * a shared link restores the same tab it was built from, not whatever tab
 * happened to be open last.
 */
/**
 * Human-readable label per tab for TabErrorBoundary's fallback message and
 * for building a "reset to defaults" link — kept here rather than duplicated
 * per-view since App.tsx is the one place that already enumerates all seven
 * tabs (the `.tab-switcher` nav below).
 */
const TAB_LABELS: Record<AppTab, string> = {
  comparator: "Two-Candidate Comparator",
  "team-raid": "Team Raid Simulator",
  "species-report": "Species Report",
  "iv-breakpoints": "IV Breakpoints",
  "attack-defense-breakpoints": "Attack/Defense Breakpoints",
  "power-up-optimizer": "Power-Up Optimizer",
  roster: "Roster",
};

/**
 * Render/navigation order for the `.tab-switcher` nav — a plain array (not
 * just `Object.keys(TAB_LABELS)`) so the roving-tabindex keyboard handler
 * below has an explicit, stable sequence to walk with ArrowLeft/ArrowRight/
 * Home/End, independent of object key insertion order.
 */
const TAB_ORDER: AppTab[] = [
  "comparator",
  "team-raid",
  "species-report",
  "iv-breakpoints",
  "attack-defense-breakpoints",
  "power-up-optimizer",
  "roster",
];

/** DOM id for a tab button — shared by the button's own `id` and every other tab/panel's `aria-controls`/`aria-labelledby` pointing at it. */
function tabButtonId(id: AppTab): string {
  return `tab-${id}`;
}

/** DOM id for a tab's content region — the single `<main>` below swaps this (and its `aria-labelledby`) as the active tab changes, rather than mounting one panel element per tab. */
function tabPanelId(id: AppTab): string {
  return `tabpanel-${id}`;
}

function initialTab(): AppTab {
  if (typeof window === "undefined") return "comparator";
  const requested = new URLSearchParams(window.location.search).get("view");
  return requested === "team-raid"
    ? "team-raid"
    : requested === "species-report"
      ? "species-report"
      : requested === "iv-breakpoints"
        ? "iv-breakpoints"
        : requested === "attack-defense-breakpoints"
          ? "attack-defense-breakpoints"
          : requested === "power-up-optimizer"
            ? "power-up-optimizer"
            : requested === "roster"
              ? "roster"
              : "comparator";
}

/**
 * Minimal tab switcher — a plain row of buttons over local state, not a
 * router library, per this project's "don't over-engineer" convention for a
 * three-view app. Also holds the one piece of cross-tab state this app needs:
 * a pending "start from a Pokémon" hand-off from the Species Report tab into
 * the comparator (see comparatorPrefill.ts) — ComparatorView fully unmounts
 * whenever another tab is active, so passing this as a prop consumed only in
 * its initial-state lazy initializer is enough; no persistent store needed.
 */
export function App() {
  const [tab, setTab] = useState<AppTab>(initialTab);
  const tabListRef = useRef<HTMLElement | null>(null);
  // Keeps the active tab visible in the (horizontally scrollable at narrow
  // widths, see .tab-switcher) nav strip. Runs on every mount AND on every
  // window resize/rotate — a deep link landing on a non-Comparator tab at
  // mobile width, or a desktop->mobile resize with a tab already selected,
  // otherwise leaves the active tab scrolled off-screen with no visible
  // active marker and no hint that the strip scrolls further (reproduced at
  // 375px, pogo-player 2026-09-12). Pure DOM scroll, no state — clicking a
  // tab already scrolls correctly via the browser's native focus/click
  // handling, so this only needs to cover the resize/mount path.
  useEffect(() => {
    function scrollActiveTabIntoView() {
      const active = tabListRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      active?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    scrollActiveTabIntoView();
    // The Inter web font (index.html) swaps in well after this effect's own
    // mount-time call and visibly widens every tab-button's text — verified
    // live (Playwright): scrollWidth grew ~50px between mount and font-load
    // on a real deep link, with the active tab silently pushed back
    // off-screen and nothing left to re-center it. Re-run once the swap
    // settles. `document.fonts` doesn't exist in every test/SSR
    // environment, hence the guard.
    if (typeof document !== "undefined" && document.fonts) {
      void document.fonts.ready.then(scrollActiveTabIntoView);
    }
    window.addEventListener("resize", scrollActiveTabIntoView);
    return () => window.removeEventListener("resize", scrollActiveTabIntoView);
  }, [tab]);
  const [comparatorPrefill, setComparatorPrefill] = useState<ComparatorPrefill | null>(null);
  // A second, independent lifted-prop hand-off channel (see teamRaidPrefill.ts)
  // for Species Report's "Send to Team Raid Simulator" row action — mirrors
  // comparatorPrefill above exactly, just targeting a different destination
  // tab, rather than overloading ComparatorPrefill's own species-A-shaped
  // fields for a second, unrelated destination.
  const [teamRaidPrefill, setTeamRaidPrefill] = useState<TeamRaidPrefill | null>(null);

  function handleCompareFromSpeciesReport(prefill: ComparatorPrefill) {
    setComparatorPrefill(prefill);
    setTab("comparator");
  }

  function handleSendToTeamRaidFromSpeciesReport(prefill: TeamRaidPrefill) {
    setTeamRaidPrefill(prefill);
    setTab("team-raid");
  }

  /**
   * ARIA APG "tabs" pattern keyboard support: Left/Right (wrapping) and
   * Home/End move AND activate — this app has no expensive per-tab fetch
   * gating a "select without activating" step, so automatic activation is
   * the right choice, not just the simpler one. Only the active tab sits in
   * the Tab sequence (roving tabindex, set on the buttons below) so a
   * keyboard user reaches the seven tabs in one Tab stop, then arrows
   * between them, matching what a screen-reader user is told to expect by
   * `role="tab"`/`role="tablist"`.
   */
  function handleTabListKeyDown(event: KeyboardEvent<HTMLElement>) {
    const currentIndex = TAB_ORDER.indexOf(tab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % TAB_ORDER.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TAB_ORDER.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = TAB_ORDER[nextIndex]!;
    setTab(nextTab);
    // The newly active button only becomes tabIndex 0 (and thus reliably
    // focusable) after this render commits, so defer the focus move a tick
    // rather than reading the DOM synchronously mid-handler.
    requestAnimationFrame(() => {
      tabListRef.current?.querySelector<HTMLElement>(`#${tabButtonId(nextTab)}`)?.focus();
    });
  }

  /**
   * TabErrorBoundary's "Reset this tab to defaults" action — a full
   * navigation (not just clearing React state) so it's robust to whatever
   * corrupted the tree in the first place, dropping every query param except
   * `view` so the tab reloads onto DEFAULT_ASSUMPTIONS rather than
   * re-decoding the same malformed scenario param that just crashed it.
   */
  function handleResetTab() {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("view", tab);
    window.location.href = url.toString();
  }

  return (
    <div className="app">
      {/*
        First focusable element on the page — invisible until it receives
        keyboard focus (`.visually-hidden` combined with the focus-visible
        rule in styles.css), so a keyboard/screen-reader user isn't forced to
        tab through the masthead and all seven tab buttons before reaching
        the actual content on every single page load. Targets the `<main>`
        tabpanel below by its CURRENT id, not a fixed one, so it always
        lands on whichever tab is actually showing.
      */}
      <a href={`#${tabPanelId(tab)}`} className="skip-link visually-hidden">
        Skip to main content
      </a>
      <header className="masthead">
        <span className="masthead-mark" aria-hidden="true">
          {/*
            Hand-rolled inline SVG wordmark (no icon library, same convention
            as the charts): two candidate lines in the app's own accent-x /
            accent-y, crossing, with the flip point marked in --good — the
            product's thesis as a 26px glyph.
          */}
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" focusable="false">
            <path d="M3 20 L23 7" stroke="var(--accent-x)" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M3 8 L23 19" stroke="var(--accent-y)" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="13" cy="13.4" r="3.1" fill="var(--surface-raised)" stroke="var(--good)" strokeWidth="2" />
          </svg>
        </span>
        <div>
          <h1>Pokémon GO Scenario Comparator</h1>
          <p className="masthead-tagline">Survivability counted as team DPS, not raw damage.</p>
        </div>
      </header>
      {/*
        `role="tab"` needs a `role="tabpanel"` counterpart it points at via
        `aria-controls` (and the panel points back via `aria-labelledby`) to
        actually satisfy the tablist contract — see the `<main>` below.
        Roving tabindex: only the active tab sits in the page's Tab
        sequence; ArrowLeft/Right/Home/End (handleTabListKeyDown) move
        between the rest, per the ARIA APG tabs pattern.
      */}
      <nav className="tab-switcher" role="tablist" aria-label="View" ref={tabListRef} onKeyDown={handleTabListKeyDown}>
        {TAB_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={tabButtonId(id)}
            aria-selected={tab === id}
            aria-controls={tabPanelId(id)}
            tabIndex={tab === id ? 0 : -1}
            className={`tab-button${tab === id ? " active" : ""}`}
            onClick={() => setTab(id)}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </nav>
      {/*
        The single content region doubles as the ARIA tabpanel for whichever
        tab is active — one `<main>` that swaps its id/aria-labelledby as
        `tab` changes, rather than mounting seven (mostly-empty) panel
        elements. It's declared here in App.tsx itself, NOT inside the lazy
        chunk below, specifically so `aria-controls`/the skip link's `href`
        always resolve to a real element even before a lazy view's chunk has
        finished loading (TabLoadingBar's fallback still renders inside it).
        `tabIndex={-1}` makes it a valid focus target for the skip link
        without adding a second stop to the page's normal Tab sequence (the
        panel's own focusable content already provides that).
      */}
      <main id={tabPanelId(tab)} role="tabpanel" aria-labelledby={tabButtonId(tab)} tabIndex={-1}>
        {/*
          Keyed by `tab` so navigating to another tab and back always mounts a
          fresh TabErrorBoundary instance — a tab that crashed once doesn't
          stay stuck in its fallback state after you've clicked away from it.
          Scoped to only the active view (not the whole .app div above) so the
          masthead and nav stay usable as the fallback's own "way out."
        */}
        <TabErrorBoundary key={tab} tabLabel={TAB_LABELS[tab]} onResetTab={handleResetTab}>
          {/*
            Suspense sits INSIDE TabErrorBoundary on purpose — see App.tsx's top
            doc comment on the lazy view declarations for why a failed chunk
            fetch needs a boundary ABOVE this, not below it.
          */}
          <Suspense fallback={<TabLoadingBar />}>
            {tab === "comparator" ? (
              <ComparatorView prefill={comparatorPrefill} onConsumedPrefill={() => setComparatorPrefill(null)} />
            ) : tab === "team-raid" ? (
              <TeamRaidView prefill={teamRaidPrefill} onConsumedPrefill={() => setTeamRaidPrefill(null)} />
            ) : tab === "species-report" ? (
              <SpeciesReportView onCompare={handleCompareFromSpeciesReport} onSendToTeamRaid={handleSendToTeamRaidFromSpeciesReport} />
            ) : tab === "iv-breakpoints" ? (
              <IvBreakpointsView />
            ) : tab === "attack-defense-breakpoints" ? (
              <AttackDefenseBreakpointsView />
            ) : tab === "power-up-optimizer" ? (
              <PowerUpOptimizerView />
            ) : (
              <RosterView />
            )}
          </Suspense>
        </TabErrorBoundary>
      </main>
    </div>
  );
}
