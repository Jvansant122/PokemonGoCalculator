import { fastMoveCadenceTooFastToDodge, type FastMove } from "@pogo-analyzer/engine";

/**
 * Shared wording for the "dodging every fast attack against this boss is
 * physically impossible" warning — see MECHANICS.md's "A boss fast move at
 * <=0.5s cannot be fast-dodged at all — and that is arithmetic, not a bug"
 * (2026-09-10) and breakpoints.ts's fastMoveCadenceTooFastToDodge, whose own
 * doc comment calls this out as "usable for a live warning on the toggle
 * itself." DODGE_COST_SECONDS (0.5s) is added back to the attacker's own
 * fast-move eligibility every time a dodge is attempted against the boss's
 * fast attack — if the boss's own fast move recycles at least that often,
 * that delay arrives at least as fast as real time elapses, so the attacker
 * can never catch up: turning "dodge fast attacks" on against such a boss is
 * a PERMANENT lockout (zero fast-move damage for the rest of the fight), not
 * a bad matchup.
 *
 * Deliberately keyed off the boss's fast move alone, independent of whether
 * "dodge fast attacks" is currently on — a caller can show this the moment a
 * qualifying boss (species + fast move) is selected, before the toggle is
 * even switched on, so the risk is visible before it's triggered rather than
 * only after reading a zeroed result card. Named after the REAL move and its
 * REAL duration (never a generic "this boss") so the reader can verify it
 * isn't guesswork.
 *
 * Returns null when the pairing is safe (or the boss's fast move isn't
 * resolved yet) — callers render nothing in that case rather than an empty
 * warning box.
 */
export function dodgeFastAttackLockoutWarning(fastMove: Pick<FastMove, "name" | "durationSeconds"> | undefined | null): string | null {
  if (!fastMove || !fastMoveCadenceTooFastToDodge(fastMove.durationSeconds)) return null;
  return (
    `${fastMove.name} recycles every ${fastMove.durationSeconds.toFixed(1)}s — dodging every fast attack is physically ` +
    `impossible against this boss. Turning "Also dodge boss's fast attacks?" on results in a permanent lockout (zero ` +
    `fast-move damage, forever), not a bad matchup.`
  );
}

/**
 * Same fact as `dodgeFastAttackLockoutWarning` above, phrased for a result
 * that has ALREADY been computed with the lockout active (the engine's own
 * `dodgeFastAttacksLockout` flag — see StepwiseRunResult/DistributionSummary/
 * TeamRaidSlotResult in packages/engine) rather than as a heads-up before
 * running anything. Meant to sit directly on a zeroed result card, not just
 * next to the toggle that caused it — per the task's explicit instruction
 * that a caveat three clicks away doesn't restore trust in a number that
 * reads as a real matchup result.
 */
export function dodgeFastAttackLockoutResultNote(fastMove: Pick<FastMove, "name" | "durationSeconds"> | undefined | null): string | null {
  if (!fastMove || !fastMoveCadenceTooFastToDodge(fastMove.durationSeconds)) return null;
  return (
    `Dodge lockout active: ${fastMove.name} recycles every ${fastMove.durationSeconds.toFixed(1)}s, too fast to fast-dodge — ` +
    `this result reflects zero fast-move damage for the rest of the fight, not a bad matchup. Turn off "Also dodge boss's ` +
    `fast attacks?" (or this candidate's own override) to see real numbers against this boss.`
  );
}
