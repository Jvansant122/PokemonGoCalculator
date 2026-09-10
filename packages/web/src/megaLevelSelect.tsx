import type { MegaLevel, SpeciesDefinition } from "@pogo-analyzer/engine";

/**
 * Shared UI for the Mega Level dropdown, used identically by all SIX tabs
 * (Comparator, Team Raid, Species Report, IV Breakpoints, Attack/Defense
 * Breakpoints, Power-Up Optimizer's single-raid slots) — see
 * packages/engine/src/megaLevel.ts for the full mechanic this control drives
 * (Base/High/Max historically have NO combat effect at all; Super Max adds a
 * CP bump and, on eligible species, unlocks a "+" charged move). Pulled into
 * one module rather than duplicated six times, same "a hand-typed factual
 * claim about sourcing drifts if copied N times" reasoning as bossCadence.tsx.
 *
 * `null` and `"base"` are treated as completely interchangeable everywhere
 * this is consumed (see resolveCandidateMegaLevel/effectiveLevelForMegaLevel/
 * chargedMoveAtMegaLevel) — this control renders `null` as the "Base" option
 * but always WRITES the literal `"base"` once a user actually interacts with
 * it, since a native <select>'s value must be a string. Both read back
 * identically at every engine call site.
 */

/** Every DEFAULT_ASSUMPTIONS in this project sets its megaLevel field(s) to this — matches the engine's own "undefined/null means no investment assumed" default, so a scenario URL encoded before this feature existed decodes unchanged. */
export const DEFAULT_MEGA_LEVEL: MegaLevel | null = null;

const MEGA_LEVEL_LABELS: Record<MegaLevel, string> = {
  base: "Base",
  high: "High",
  max: "Max",
  "super-max": "Super Max",
};

// Fixed ladder order — matches the real in-game progression (Bulbapedia
// "Mega Evolution (GO)"), not alphabetical.
const MEGA_LEVEL_ORDER: MegaLevel[] = ["base", "high", "max", "super-max"];

/**
 * Whether a Mega Level selector means anything at all for this species —
 * mirrors comparison.ts's own `resolveCandidateMegaLevel` gate exactly
 * (`species.boost` truthy, nothing else). Deliberately NOT the same as
 * AssumptionPanel.tsx's `hasActiveBoost` (which also checks a per-candidate
 * "disable mega/primal boost" toggle) — that toggle only disables the
 * OWN-DAMAGE boost multiplier (ownBoostMultiplier), a completely separate
 * mechanic from Mega Level's CP bump / "+" move, which the engine applies
 * regardless of whether that checkbox is set. Gating on `hasActiveBoost`
 * instead would hide this control in a state where it still silently
 * affects the result — exactly the "control invisible but not inert" bug
 * this project's own rules warn against, just inverted.
 */
export function canHaveMegaLevel(species: Pick<SpeciesDefinition, "boost"> | null | undefined): boolean {
  return !!species?.boost;
}

/**
 * Deep-sourcing prose for the collapsed `<details>` under the control —
 * mirrors bossCadence.tsx's BOSS_CADENCE_HINT precedent (hedged confidence
 * language matching megaLevel.ts's own doc comments, not oversold). Exported
 * so a view that wants to render the caveat text somewhere other than next to
 * the control itself (e.g. a "Known caveats" section) can reuse the exact
 * same wording rather than a paraphrase that could drift.
 */
export const MEGA_LEVEL_HINT =
  "Repeatedly Mega Evolving the SAME individual Pokémon raises ITS OWN Mega Level (at most once per day; the " +
  "real account-wide \"only one Pokémon Mega Evolved at a time\" restriction still applies separately). Base, " +
  "High and Max only ever reduce that Pokémon's own re-Mega Energy cost and rest-period cooldown — Bulbapedia's " +
  "own CP-bonus column is blank for all three, so they change nothing in this tool's numbers. Super Max (added " +
  "Feb 2026) additionally grants a CP increase, modelled here as +2 effective power-up levels " +
  "[community-consensus on the +2 magnitude; the underlying MECHANISM is unconfirmed by any official source] " +
  "and, on eligible species, unlocks a genuinely additional THIRD charged move (a \"+\" move) alongside its " +
  "ordinary two. A \"+\" move's own power figure carries its OWN confidence badge in the move picker below " +
  "(official / cross-site / community-estimate) — that is a claim about the move's BASE-tier number specifically. " +
  "Separately, and on top of that: the curve used to scale a \"+\" move's power at High/Max/Super Max " +
  "(+10% per tier) is ITSELF a community estimate — two independently-run sites publish it, but both carry the " +
  "identical self-labelled-guess disclaimer on every page, which makes it one shared guess wearing two names, " +
  "not real corroboration. No official or first-party source confirms this scaling curve at all. Selecting " +
  "anything other than Base here has zero effect on a species with no mega/primal mechanic.";

interface Props {
  /** Unique prefix for this control's DOM id — lets 6+ copies share one page without collisions. */
  idPrefix: string;
  /**
   * The species this Mega Level would apply to — the control renders
   * nothing at all when this species has no mega/primal `boost` mechanic
   * (see canHaveMegaLevel), UNLESS `forceVisible` is set. Pass `null` with
   * `forceVisible: true` for a ROSTER-WIDE setting with no single species to
   * gate on (the Power-Up Optimizer's multi-raid mode — see that view's own
   * doc comment on why a per-entry gate isn't practical for a ~150+ entry
   * imported roster).
   */
  species: Pick<SpeciesDefinition, "boost"> | null | undefined;
  value: MegaLevel | null;
  onChange: (next: MegaLevel) => void;
  /** Defaults to "Mega Level" — overridden by tabs with more than one Mega-Level-bearing slot on screen at once (e.g. Team Raid's per-slot label). */
  label?: string;
  /** Skips the canHaveMegaLevel gate entirely — see `species` above. Defaults to false (every per-species/per-slot use on all six tabs). */
  forceVisible?: boolean;
}

/**
 * The Mega Level <select> plus its caveat text — reused verbatim across all
 * six tabs' own assumption panels/views. Renders nothing at all when
 * `species` has no mega/primal `boost` mechanic (see canHaveMegaLevel) — a
 * non-mega species has nothing for this control to do, so it must not be
 * shown at all rather than shown-but-inert (this project's own
 * add-scenario-assumption discipline, step 5) — unless `forceVisible` opts
 * out of that gate for a roster-wide setting with no single species.
 */
export function MegaLevelSelect({ idPrefix, species, value, onChange, label = "Mega Level", forceVisible = false }: Props) {
  if (!forceVisible && !canHaveMegaLevel(species)) return null;
  const id = `${idPrefix}-megaLevel`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value ?? "base"} onChange={(e) => onChange(e.target.value as MegaLevel)}>
        {MEGA_LEVEL_ORDER.map((level) => (
          <option key={level} value={level}>
            {MEGA_LEVEL_LABELS[level]}
          </option>
        ))}
      </select>
      {value && value !== "base" && (
        <p className="species-picker-hint">
          {value === "super-max" ? "Super Max: " : `${MEGA_LEVEL_LABELS[value]}: `}
          {value === "super-max"
            ? "applies a community-consensus-magnitude, unconfirmed-mechanism CP bump, "
            : ""}
          any selected "+" charged move's power is scaled by a community-estimated curve on top of its own
          BASE-tier confidence badge (see the charged-move picker) — see below for the full sourcing.
        </p>
      )}
      <details className="prose-details">
        <summary>What Mega Level actually changes, and how well sourced it is</summary>
        <p>{MEGA_LEVEL_HINT}</p>
      </details>
    </div>
  );
}
