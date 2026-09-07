import { useState } from "react";
import type { ComparatorPrefill } from "./comparatorPrefill.js";
import { AttackDefenseBreakpointsView } from "./AttackDefenseBreakpointsView.js";
import { ComparatorView } from "./ComparatorView.js";
import { IvBreakpointsView } from "./IvBreakpointsView.js";
import { SpeciesReportView } from "./SpeciesReportView.js";
import { TeamRaidView } from "./TeamRaidView.js";

/** The app's five views. */
export type AppTab = "comparator" | "team-raid" | "species-report" | "iv-breakpoints" | "attack-defense-breakpoints";

/**
 * Which tab a shared link should land on. Deliberately a SEPARATE query param
 * from any view's own scenario param (`s` for Scenario, `ts` for TeamScenario,
 * `sr` for SpeciesReportScenario, `ivc` for IvBreakpointsScenario, `adb` for
 * AttackDefenseBreakpointsScenario) — a URL can only ever be "about" one
 * tab's scenario at a time, but the five scenario encodings themselves stay
 * fully independent so this file never has to know their shapes. Every
 * view's own "Build link" button additionally stamps this param onto its
 * generated URL so reloading a shared link restores the same tab it was
 * built from, not whatever tab happened to be open last.
 */
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
  const [comparatorPrefill, setComparatorPrefill] = useState<ComparatorPrefill | null>(null);

  function handleCompareFromSpeciesReport(prefill: ComparatorPrefill) {
    setComparatorPrefill(prefill);
    setTab("comparator");
  }

  return (
    <div className="app">
      <h1>Pokémon GO Scenario Comparator</h1>
      <nav className="tab-switcher" role="tablist" aria-label="View">
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
      </nav>
      {tab === "comparator" ? (
        <ComparatorView prefill={comparatorPrefill} onConsumedPrefill={() => setComparatorPrefill(null)} />
      ) : tab === "team-raid" ? (
        <TeamRaidView />
      ) : tab === "species-report" ? (
        <SpeciesReportView onCompare={handleCompareFromSpeciesReport} />
      ) : tab === "iv-breakpoints" ? (
        <IvBreakpointsView />
      ) : (
        <AttackDefenseBreakpointsView />
      )}
    </div>
  );
}
