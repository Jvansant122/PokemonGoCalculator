/**
 * Shared UI for the boss charged-move cadence toggle, used identically by
 * all THREE tabs that actually simulate a boss over time (Comparator, Team
 * Raid, Species Report). IV Breakpoints and Attack/Defense Breakpoints don't
 * get this at all, deliberately: neither calls a simulator — they do per-hit
 * breakpoint math, so a cadence setting there would be dead weight and would
 * wrongly imply those tabs model boss cadence. Pulled into one module rather than duplicated three
 * times, unlike this project's usual "small self-contained constant, not
 * worth a shared file" precedent (see WeatherSelect.tsx, which similarly got
 * promoted to its own shared module once it needed real behavior, not just a
 * lookup table) — a hand-typed factual claim
 * about sourcing/magnitude is exactly the kind of text that drifts if copied
 * three times and only one copy gets corrected later, unlike a label lookup
 * table with nothing to get wrong.
 *
 * The engine's own StepwiseBoss.chargedMoveCadence (simulate.ts) exports this
 * same union as a named type (`BossChargedMoveCadence`) — re-exported here
 * under the same local name so no other web import needs to change.
 */
import type { BossChargedMoveCadence } from "@pogo-analyzer/engine";
export type { BossChargedMoveCadence };

/** Matches every tab's existing implicit behavior — see each Scenario-family type's own field doc comment for the `??` guard this backs. */
export const DEFAULT_BOSS_CHARGED_MOVE_CADENCE: BossChargedMoveCadence = "fixed-interval";

/**
 * The cadence model's deep-sourcing explanation. As of 2026-09-10 this no
 * longer renders inline under the <select> at all — a 384-word block on
 * every one of the (now five, across single/multi-raid) panels that render
 * `BossCadenceSelect` was exactly the "wall of text when picking a Pokémon"
 * this project's own UI rules warn against. Each tab instead renders this
 * exact text ONCE in its own "Known caveats" section; the control itself
 * carries only a `title` tooltip pointing there. Deliberately hedged to match
 * MECHANICS.md's own sourcing tags rather than overselling "energy-driven" as
 * simply more correct — do not soften this wording when relocating it:
 *
 * - The 0.5-energy-per-HP rate IS independently corroborated (Bulbapedia,
 *   in addition to the original Silph Road source).
 * - The 50% per-decision-boundary roll is single-sourced (Silph Road,
 *   ~Sept 2024) and ~2 years old.
 * - The engine's own move-completion-boundary TRIGGER for that roll is
 *   `[speculative — reasoned inference]`, not a cited mechanic — the real
 *   denominator of the 50% figure isn't documented anywhere fetchable.
 * - The measured survival-time impact (real species vs. real bosses, this
 *   engine, 2026-09-08) is directionally consistent (glass cannons hit
 *   hardest, bulky attackers least) but has never been checked against an
 *   actual raid log, so the MAGNITUDE is unvalidated even where the
 *   direction is trusted.
 */
export const BOSS_CADENCE_HINT =
  "Fixed interval (default) uses a mean seconds-between-casts figure with +/-40% jitter — the model every result on " +
  "this tab has always used. Energy-driven (experimental) instead derives the boss's charged-move timing from its " +
  "own energy, most of which it gains from damage YOU deal to it (0.5 energy per HP lost — independently " +
  "corroborated) rather than from a flat mean interval, so a higher-DPS attacker makes the boss cast faster: a real " +
  "feedback loop the fixed-interval model misses entirely, and one this project's own testing measured as a " +
  "15-34% survival-time cut across real species (glass cannons hit hardest, bulky attackers least). That direction " +
  "is trusted; the exact magnitude is not — it hasn't been checked against a real raid log. The boss's underlying " +
  "50%-chance decision itself is single-sourced (Silph Road, ~2 years old), and exactly what triggers that roll is " +
  "this engine's own reasoned inference, not a confirmed mechanic — see MECHANICS.md. Flipping this re-baselines " +
  "every number below; it stays off by default so a shared link's meaning never silently changes. " +
  "Energy-gated interval (experimental) is a third, hybrid option: the boss gains energy exactly as energy-driven " +
  "does (its own fast moves plus 0.5 energy per HP lost), but the instant it can afford its charged move — rather " +
  "than rolling a 50% chance at every move-completion boundary — it rolls ONE delay from this same mean-frequency " +
  "field below, with the same +/-40% jitter, and fires the moment that delay elapses (never mid-cast; leftover " +
  "energy still enough to fire again re-arms a fresh delay immediately). The gate-at-cost and subtract-the-cost-" +
  "on-fire rules it uses are corroborated by an open-source raid simulator (GoBattleSim), not an in-game " +
  "observation — a simulator's own modelling choice, not a confirmed mechanic. The wait itself, once eligible, has " +
  "no observed real-game source at all: it is this project's own labelled assumption. Under this mode the mean-" +
  "frequency field means the mean delay AFTER the boss becomes energy-eligible, not the mean seconds between " +
  "casts — the same field, reinterpreted, not a second setting. It stays off by default for the same shared-link " +
  "reason as energy-driven.";

/** Shown next to a now-inert "boss charged-move mean frequency" control once energy-driven is selected. */
export const BOSS_FREQUENCY_INAPPLICABLE_HINT =
  "Inactive under the energy-driven cadence model above — the boss's charged-move timing now comes entirely from " +
  "its own energy gained from damage taken, not this mean-interval setting. Left visible (disabled, not hidden) " +
  "so switching back to fixed-interval doesn't require re-entering it.";

interface BossCadenceSelectProps {
  idPrefix: string;
  value: BossChargedMoveCadence;
  onChange: (next: BossChargedMoveCadence) => void;
}

/**
 * The cadence <select> — reused verbatim across AssumptionPanel.tsx,
 * TeamAssumptionPanel.tsx, SpeciesReportView.tsx and (both modes of)
 * PowerUpOptimizerAssumptionPanel.tsx so every panel can never present a
 * subtly different account of the same model. Each caller is still
 * responsible for disabling/marking its OWN "boss charged-move mean
 * frequency" field via BOSS_FREQUENCY_INAPPLICABLE_HINT above — that field's
 * id/onChange differ per tab, so it isn't folded in here. BOSS_CADENCE_HINT
 * itself does NOT render here (see that constant's own doc comment) — every
 * caller renders it once in its own tab's "Known caveats" section instead;
 * this control only carries a `title` tooltip pointing there.
 */
export function BossCadenceSelect({ idPrefix, value, onChange }: BossCadenceSelectProps) {
  return (
    <div className="field">
      <label htmlFor={`${idPrefix}-bossCadence`}>Boss charged-move cadence model</label>
      <select
        id={`${idPrefix}-bossCadence`}
        value={value}
        onChange={(e) => onChange(e.target.value as BossChargedMoveCadence)}
        title="Fixed interval is this tab's long-standing default; the other two are experimental and off by default. See &quot;Known caveats&quot; below for what each one changes and how well sourced it is."
      >
        <option value="fixed-interval">Fixed interval (default)</option>
        <option value="energy-driven">Energy-driven (experimental)</option>
        <option value="energy-gated-interval">Energy-gated interval (experimental)</option>
      </select>
    </div>
  );
}
