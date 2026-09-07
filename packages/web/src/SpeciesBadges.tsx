interface Props {
  isHypothetical?: boolean;
  isShadow?: boolean;
}

/**
 * Shared "speculative/mechanically-different data" badges for a species,
 * reused wherever a species name/header renders (ComparatorView's result
 * cards, TeamAssumptionPanel's slot headers, SpeciesReportView's boss rows)
 * instead of three copies of the same two `<span className="badge ...">`
 * elements. Deliberately doesn't cover `isApproximate` (a property of a
 * RAID ENTRY, not a species — see SpeciesReportView's own separate
 * `badge-approximate` usage) or SpeciesPicker.tsx's own inline option badge
 * (that one already covers all three flags for its own dropdown-option
 * rendering and has a different call shape, a single `badge` union prop).
 */
export function SpeciesBadges({ isHypothetical, isShadow }: Props) {
  return (
    <>
      {isHypothetical && <span className="badge badge-hypothetical">hypothetical</span>}
      {isShadow && <span className="badge badge-shadow">shadow</span>}
    </>
  );
}
