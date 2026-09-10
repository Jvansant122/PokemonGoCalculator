import type { CrossoverPoint } from "@pogo-analyzer/engine";
import { CollapsibleSection } from "./CollapsibleSection.js";
import { FlipBar } from "./SensitivityView.js";
import { PARTY_SIZE_FLIP_MAX, PARTY_SIZE_FLIP_MIN } from "./run/runComparator.js";

interface Props {
  flip: CrossoverPoint | null;
  currentPartySize: number;
  candidateAName: string;
  candidateBName: string;
}

/**
 * IDEAS #19 — "the same crossing-detection shape [rankingFlip.ts already
 * applies to time] on a different axis": does the ranking flip somewhere
 * across the sensible party-size range (0-20 other trainers in the raid),
 * holding every other assumption fixed at its current value? This is a
 * dedicated, prominent headline — NOT a replacement for sensitivity.ts's
 * own "Other trainers in this raid" row (check 1), which still reports the
 * DISTANCE from the current value for the ranked "what's closest to
 * flipping" list. This component instead always renders (never buried
 * behind 9 other rows sorted by distance) and states the flip in the same
 * "crossing marker + caption sentence" shape DamageOverTimeChart.tsx uses
 * for the time-axis flip, reusing its exact FlipBar visual.
 *
 * `flip === null` covers TWO different real situations, both worth
 * distinguishing in the caption: no crossing was found anywhere in 0-20
 * (one candidate leads at every party size), or the party-size axis is
 * inert altogether (neither candidate has an active boost — see
 * run/runComparator.ts's own gating comment on ComparatorRunResult.
 * partySizeFlip). The caller only renders this component in the first
 * case; see ComparatorView.tsx's own guard.
 */
export function PartySizeFlipView({ flip, currentPartySize, candidateAName, candidateBName }: Props) {
  if (!flip) return null;

  const { partySize: crossingPartySize, leaderBelow, leaderAtOrAbove } = flip;

  const headline =
    crossingPartySize !== null ? (
      <>
        Ranking flips at <strong>{crossingPartySize}</strong> other trainer{crossingPartySize === 1 ? "" : "s"} in the raid:{" "}
        <strong>{leaderBelow ?? "neither candidate"}</strong> leads below that, <strong>{leaderAtOrAbove}</strong> leads at {crossingPartySize} or
        more.
      </>
    ) : leaderAtOrAbove ? (
      <>
        <strong>{leaderAtOrAbove}</strong> leads at every party size from {PARTY_SIZE_FLIP_MIN} to {PARTY_SIZE_FLIP_MAX} other trainers under these
        assumptions — no flip found.
      </>
    ) : (
      <>Own damage plus team contribution is tied across the whole {PARTY_SIZE_FLIP_MIN}-{PARTY_SIZE_FLIP_MAX} party-size range — no clear leader.</>
    );

  const label = `${crossingPartySize !== null ? `flips at ${crossingPartySize}` : "no flip found"} — currently ${currentPartySize} other trainers`;

  return (
    <CollapsibleSection
      id="comparator-party-size-flip"
      heading="Ranking flip by party size (other trainers in this raid)"
      defaultOpen
    >
      <p className="caveats" style={{ marginBottom: 12 }}>
        Holds every other assumption at its current value and sweeps ONLY how many other trainers are simultaneously in the raid ({
          PARTY_SIZE_FLIP_MIN
        }-{PARTY_SIZE_FLIP_MAX}) — the one input the mega/primal team-boost mechanic actually scales with. {candidateAName} vs {candidateBName}.
      </p>
      <FlipBar
        check={{
          rangeMin: PARTY_SIZE_FLIP_MIN,
          rangeMax: PARTY_SIZE_FLIP_MAX,
          currentNumericValue: currentPartySize,
          flipNumericValue: crossingPartySize,
        }}
      />
      <p className={`crossover-note ${crossingPartySize !== null ? "crossover-note--flip" : "crossover-note--steady"}`} aria-label={label}>
        {headline} (currently {currentPartySize} other trainer{currentPartySize === 1 ? "" : "s"}.)
      </p>
    </CollapsibleSection>
  );
}
