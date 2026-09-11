import type { ChargedMove, PlusMovePowerConfidence } from "@pogo-analyzer/engine";

/**
 * Confidence badge for a Super Max "+" charged move's displayed power — a
 * HARD requirement (not polish): the user approved shipping this feature's
 * estimated numbers specifically on the condition that they stay visibly
 * flagged everywhere they reach the user. Follows this project's existing
 * "speculative data gets a visible badge" precedent (SpeciesBadges.tsx's
 * isHypothetical/isShadow, SpeciesPicker.tsx's own isApproximate option
 * badge) rather than inventing a new visual language — same `.badge` base
 * class, same "reuse --warn for the least-trusted tier" convention as
 * `.badge-approximate`.
 *
 * Three tiers, each visibly distinguishable (not just "+ move" for all
 * three, which would fail the requirement that cross-site read as more
 * trustworthy than a single community estimate, and official as more
 * trustworthy still):
 *  - official: stated directly in a first-party pokemongo.com post.
 *  - cross-site: two independent (non-official) community sites agree.
 *  - community-estimate: one self-labelled-estimate source, no corroboration.
 */
const CONFIDENCE_LABEL: Record<PlusMovePowerConfidence, string> = {
  official: "official",
  "cross-site": "cross-site est.",
  "community-estimate": "community est.",
};

const CONFIDENCE_CLASS: Record<PlusMovePowerConfidence, string> = {
  official: "badge-plus-official",
  "cross-site": "badge-plus-crosssite",
  "community-estimate": "badge-plus-estimate",
};

const CONFIDENCE_TITLE: Record<PlusMovePowerConfidence, string> = {
  official: 'This "+" move\'s Base-tier power is stated directly in a first-party pokemongo.com news post.',
  "cross-site": 'This "+" move\'s Base-tier power is corroborated by two independently-run community sites.',
  "community-estimate":
    'This "+" move\'s Base-tier power comes from a single, self-labelled community estimate — no official or cross-site corroboration exists for this specific move.',
};

/** Minimal shape this badge needs — accepts a raw ChargedMove or any narrower object carrying just these two fields (e.g. a resolved move from MoveSelect). */
type PlusMoveLike = Pick<ChargedMove, "isPlusMove" | "plusMovePowerConfidence">;

/**
 * Renders nothing for any ordinary move (isPlusMove falsy — every fast move,
 * every species' normal two charged moves, and every "+" move before this
 * field existed). `plusMovePowerConfidence` is required BY CONVENTION (not a
 * runtime check — see types.ts) on every move that sets `isPlusMove: true`;
 * an isPlusMove move that's somehow missing it still renders the strictest
 * (community-estimate) tier rather than silently showing no badge at all —
 * the honest default when confidence is unknown.
 */
export function PlusMoveBadge({ move }: { move: PlusMoveLike | null | undefined }) {
  if (!move?.isPlusMove) return null;
  const confidence = move.plusMovePowerConfidence ?? "community-estimate";
  return (
    <span className={`badge ${CONFIDENCE_CLASS[confidence]}`} title={CONFIDENCE_TITLE[confidence]}>
      + move ({CONFIDENCE_LABEL[confidence]})
    </span>
  );
}
