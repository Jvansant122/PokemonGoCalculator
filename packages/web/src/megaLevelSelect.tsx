import { canReachSuperMax, type MegaLevel, type SpeciesDefinition } from "@pogo-analyzer/engine";

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
 * Three-way (not boolean) classification of whether `species` can reach
 * Super Max — thin wrapper over engine's megaLevel.ts `canReachSuperMax`
 * (has a charged move with `isPlusMove`; as of 2026-09-10 only 15 of the
 * ~54+ released mega/primal forms qualify). `"unknown"` covers only the ONE
 * `forceVisible` roster-wide call site (Power-Up Optimizer multi-raid),
 * which passes `species: null` because there is no single Pokémon to check
 * — the real roster behind that control may hold BOTH eligible and
 * ineligible entries at once, so answering `true` or `false` for the whole
 * roster would be dishonest either way; `"unknown"` says so explicitly
 * instead of guessing, and selectableMegaLevels below treats it the same as
 * `"eligible"` (offers the full ladder — omitting Super Max would be just as
 * wrong as forcing it, since SOME roster entries really can reach it).
 */
export type MegaLevelEligibility = "eligible" | "ineligible" | "unknown";

export function megaLevelEligibility(
  species: Pick<SpeciesDefinition, "chargedMoves"> | null | undefined,
): MegaLevelEligibility {
  if (!species) return "unknown";
  return canReachSuperMax(species) ? "eligible" : "ineligible";
}

/**
 * The MegaLevel values this control should actually render as `<option>`s.
 * Drops `"super-max"` for a known-`"ineligible"` species — the engine already
 * CLAMPS an illegal `"super-max"` request down to `"max"`
 * (comparison.ts's resolveCandidateMegaLevel), so continuing to OFFER it here
 * would be exactly the "control appears to do something but silently
 * computes something else" failure this project's UI rules warn against, not
 * a cosmetic omission.
 *
 * One deliberate exception: `currentValue` is ALREADY `"super-max"` (a
 * scenario/share-link encoded before this species was picked, or before this
 * gate existed at all) — kept in the list rather than dropped, so a
 * controlled `<select>` whose `value` matches no rendered `<option>` doesn't
 * silently fall back to a blank/wrong-looking selection. The engine's own
 * clamp already makes the COMPUTED result correct either way; this is purely
 * about not misrepresenting what the stored scenario value actually is. See
 * megaLevelOptionLabel below for how that kept-but-unreachable option is
 * labelled, so it reads as "selected but inert," not a normal working choice.
 *
 * `"unknown"`/`"eligible"` both always offer the full four-tier ladder.
 */
export function selectableMegaLevels(eligibility: MegaLevelEligibility, currentValue: MegaLevel | null): MegaLevel[] {
  if (eligibility !== "ineligible" || currentValue === "super-max") return MEGA_LEVEL_ORDER;
  return MEGA_LEVEL_ORDER.filter((level) => level !== "super-max");
}

/**
 * Only `"super-max"` on a known-`"ineligible"` species (the kept-for-an-
 * existing-value exception documented on selectableMegaLevels above) gets a
 * modified label — every other option/eligibility combination reads as its
 * plain MEGA_LEVEL_LABELS entry.
 */
export function megaLevelOptionLabel(level: MegaLevel, eligibility: MegaLevelEligibility): string {
  if (level === "super-max" && eligibility === "ineligible") {
    return `${MEGA_LEVEL_LABELS[level]} (not reachable here)`;
  }
  return MEGA_LEVEL_LABELS[level];
}

/**
 * Deep-sourcing prose for this control — mirrors bossCadence.tsx's
 * BOSS_CADENCE_HINT precedent (hedged confidence language matching
 * megaLevel.ts's own doc comments, not oversold). As of 2026-09-10 this no
 * longer renders inline next to the control at all (a 255-word block next to
 * a dropdown that can render up to 6+ times on one tab was exactly the "wall
 * of text when picking a Pokémon" this project's own UI rules warn against)
 * — every one of the six tabs instead renders this exact text ONCE in its own
 * "Known caveats" section, with only a `title` tooltip and (once a non-Base
 * level is actually picked) a short live pointer left at the control itself.
 * Exported so every tab reuses the exact same wording rather than a paraphrase
 * that could drift — this text is deliberately hedged/sourced and must NOT be
 * softened by whichever call site renders it.
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
   * imported roster). Also drives megaLevelEligibility (needs `chargedMoves`
   * to know whether Super Max is actually reachable) alongside canHaveMegaLevel
   * (needs only `boost`) — a `null` species reads as `"unknown"` eligibility
   * there, not "ineligible".
   */
  species: Pick<SpeciesDefinition, "boost" | "chargedMoves"> | null | undefined;
  value: MegaLevel | null;
  onChange: (next: MegaLevel) => void;
  /** Defaults to "Mega Level" — overridden by tabs with more than one Mega-Level-bearing slot on screen at once (e.g. Team Raid's per-slot label). */
  label?: string;
  /** Skips the canHaveMegaLevel gate entirely — see `species` above. Defaults to false (every per-species/per-slot use on all six tabs). */
  forceVisible?: boolean;
}

/**
 * The Mega Level <select>, plus a short LIVE pointer once a non-Base level is
 * actually selected — reused verbatim across all six tabs' own assumption
 * panels/views. Renders nothing at all when `species` has no mega/primal
 * `boost` mechanic (see canHaveMegaLevel) — a non-mega species has nothing
 * for this control to do, so it must not be shown at all rather than
 * shown-but-inert (this project's own add-scenario-assumption discipline,
 * step 5) — unless `forceVisible` opts out of that gate for a roster-wide
 * setting with no single species.
 *
 * The full MEGA_LEVEL_HINT sourcing prose does NOT render here (see that
 * constant's own doc comment for why, as of 2026-09-10) — every call site is
 * responsible for rendering MEGA_LEVEL_HINT once in its own tab's "Known
 * caveats" section instead. This control only carries a `title` tooltip
 * pointing there, plus the short conditional paragraph below (which fires
 * only once there's something concrete to say about the CURRENT selection,
 * not on every render).
 *
 * As of 2026-09-10 the option list itself is also gated: a species that
 * megaLevelEligibility classifies `"ineligible"` (no "+" move anywhere in its
 * moveset, so it structurally cannot reach Super Max) never offers "Super
 * Max" as a choice at all — see selectableMegaLevels' own doc comment for why
 * (and for the one exception, an already-stored `"super-max"` value from
 * before the species was last changed or before this gate existed).
 */
export function MegaLevelSelect({ idPrefix, species, value, onChange, label = "Mega Level", forceVisible = false }: Props) {
  if (!forceVisible && !canHaveMegaLevel(species)) return null;
  const id = `${idPrefix}-megaLevel`;
  const eligibility = megaLevelEligibility(species);
  const options = selectableMegaLevels(eligibility, value);

  const title =
    eligibility === "ineligible"
      ? "This species can't reach Super Max — it requires a \"+\" charged move, which this species doesn't have. " +
        "Base/High/Max otherwise have no combat effect in this tool. See \"Known caveats\" below for the full sourcing."
      : "Base/High/Max have no combat effect in this tool. See \"Known caveats\" below for what Super Max actually " +
        "changes and how well sourced it is.";

  // Only fires for something CONCRETE about the current selection (matching
  // this component's existing "not on every render" discipline, see doc
  // comment above) — never a blanket "by the way, most megas can't do this"
  // notice on every ineligible species by default (the `title` tooltip above
  // already covers that quietly, in the same spot this control already uses
  // for Base/High/Max's own no-combat-effect disclosure).
  let hint: string | null = null;
  if (eligibility === "ineligible" && value === "super-max") {
    // An existing scenario/share-link already carries "super-max" for a
    // species that (now, or always) can't reach it — the dropdown keeps it
    // selectable (see selectableMegaLevels) but this must be visible, not
    // just a hover tooltip, since the engine computing something OTHER than
    // what's displayed-as-selected is the exact failure this fix exists for.
    hint =
      "Super Max is selected here, but this species can't actually reach it — no \"+\" charged move. The engine " +
      "computes this as Max instead (the CP bump is lost too). See \"Known caveats\" below for which mega/primal " +
      "forms qualify.";
  } else if (eligibility === "unknown" && value === "super-max") {
    // The roster-wide forceVisible case: honest about the ambiguity rather
    // than implying Super Max applies (or doesn't) uniformly across every
    // entry that could be fielded in the mega/primal slot.
    hint =
      "Not every mega/primal form in a roster can reach Super Max — it requires a \"+\" charged move. Whichever " +
      "entry can't reach it computes as Max instead. See \"Known caveats\" below for which forms qualify.";
  } else if (value && value !== "base") {
    hint =
      (value === "super-max" ? "Super Max: " : `${MEGA_LEVEL_LABELS[value]}: `) +
      (value === "super-max" ? "applies a community-consensus-magnitude, unconfirmed-mechanism CP bump, " : "") +
      "any selected \"+\" charged move's power is scaled by a community-estimated curve on top of its own " +
      "BASE-tier confidence badge (see the charged-move picker) — see \"Known caveats\" below for the full sourcing.";
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value ?? "base"} onChange={(e) => onChange(e.target.value as MegaLevel)} title={title}>
        {options.map((level) => (
          <option key={level} value={level}>
            {megaLevelOptionLabel(level, eligibility)}
          </option>
        ))}
      </select>
      {hint && <p className="species-picker-hint">{hint}</p>}
    </div>
  );
}
