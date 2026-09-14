import { useEffect, useRef, useState } from "react";
import type { ComparatorPrefill } from "./comparatorPrefill.js";
import type { TeamRaidPrefill } from "./teamRaidPrefill.js";
import { AttackDefenseBreakpointsView } from "./AttackDefenseBreakpointsView.js";
import { ComparatorView } from "./ComparatorView.js";
import { IvBreakpointsView } from "./IvBreakpointsView.js";
import { PowerUpOptimizerView } from "./PowerUpOptimizerView.js";
import { RosterView } from "./RosterView.js";
import { SpeciesReportView } from "./SpeciesReportView.js";
import { TabErrorBoundary } from "./TabErrorBoundary.js";
import { TeamRaidView } from "./TeamRaidView.js";

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
      <nav className="tab-switcher" role="tablist" aria-label="View" ref={tabListRef}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "comparator"}
          className={`tab-button${tab === "comparator" ? " active" : ""}`}
          onClick={() => setTab("comparator")}
        >
          Two-Candidate Comparator
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "team-raid"}
          className={`tab-button${tab === "team-raid" ? " active" : ""}`}
          onClick={() => setTab("team-raid")}
        >
          Team Raid Simulator
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "species-report"}
          className={`tab-button${tab === "species-report" ? " active" : ""}`}
          onClick={() => setTab("species-report")}
        >
          Species Report
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "iv-breakpoints"}
          className={`tab-button${tab === "iv-breakpoints" ? " active" : ""}`}
          onClick={() => setTab("iv-breakpoints")}
        >
          IV Breakpoints
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "attack-defense-breakpoints"}
          className={`tab-button${tab === "attack-defense-breakpoints" ? " active" : ""}`}
          onClick={() => setTab("attack-defense-breakpoints")}
        >
          Attack/Defense Breakpoints
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "power-up-optimizer"}
          className={`tab-button${tab === "power-up-optimizer" ? " active" : ""}`}
          onClick={() => setTab("power-up-optimizer")}
        >
          Power-Up Optimizer
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "roster"}
          className={`tab-button${tab === "roster" ? " active" : ""}`}
          onClick={() => setTab("roster")}
        >
          Roster
        </button>
      </nav>
      {/*
        Keyed by `tab` so navigating to another tab and back always mounts a
        fresh TabErrorBoundary instance — a tab that crashed once doesn't
        stay stuck in its fallback state after you've clicked away from it.
        Scoped to only the active view (not the whole .app div above) so the
        masthead and nav stay usable as the fallback's own "way out."
      */}
      <TabErrorBoundary key={tab} tabLabel={TAB_LABELS[tab]} onResetTab={handleResetTab}>
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
      </TabErrorBoundary>
    </div>
  );
}
