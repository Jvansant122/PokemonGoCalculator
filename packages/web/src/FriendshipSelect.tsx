import { FRIENDSHIP_ATTACK_BONUS_MULTIPLIER, type FriendshipLevel } from "@pogo-analyzer/engine";

/**
 * Real tier names (MECHANICS.md's "The friendship attack bonus is a RAID/GYM
 * mechanic, not PvP", GAME_MASTER `FRIENDSHIP_LEVEL_0..5`, `[first-party]`)
 * with each tier's own multiplier folded into the label so the percentage
 * never has to be looked up separately — same "label carries the number"
 * convention WeatherSelect.tsx's fullLabel already uses.
 */
const FRIENDSHIP_LABELS: Record<FriendshipLevel, string> = {
  none: "None (soloing, or no co-participating friend)",
  good: "Good Friend (+3%)",
  great: "Great Friend (+5%)",
  ultra: "Ultra Friend (+7%)",
  best: "Best Friend (+10%)",
  forever: "Forever Friend (+12%)",
};

const FRIENDSHIP_ORDER: FriendshipLevel[] = ["none", "good", "great", "ultra", "best", "forever"];

/**
 * Shared control across every tab that simulates a fight — see
 * bossCadence.tsx's own doc comment for why a genuinely-shared, sourced-fact
 * control lives in one file rather than being copy-pasted per tab. Single-
 * trainer-scoped like weather (see damage.ts's FRIENDSHIP_ATTACK_BONUS_MULTIPLIER
 * doc comment): it boosts only the candidate/slot's OWN fast+charged damage,
 * never the boss's, and it is NOT a team-wide mechanic like the mega/primal
 * boost — a caller is asserting "assume the highest-tier co-participating
 * friend this scenario wants is present," not deriving it from a party-size
 * input this engine has no concept of.
 */
export const FRIENDSHIP_HINT =
  "Real Gym/Raid mechanic (GAME_MASTER FRIENDSHIP_LEVEL_0..5, first-party): the single HIGHEST-tier friend actually " +
  "co-participating in this battle boosts YOUR fast+charged damage only (never the boss's, and never any other " +
  "trainer's damage) — it takes only the top tier present, no stacking across multiple friends, and is zero when " +
  `soloing. Multipliers: ${FRIENDSHIP_ORDER.filter((f) => f !== "none")
    .map((f) => `${FRIENDSHIP_LABELS[f].split(" (")[0]} ${FRIENDSHIP_ATTACK_BONUS_MULTIPLIER[f]}x`)
    .join(", ")}.`;

interface Props {
  idPrefix: string;
  value: FriendshipLevel;
  onChange: (next: FriendshipLevel) => void;
}

export function FriendshipSelect({ idPrefix, value, onChange }: Props) {
  return (
    <div className="field">
      <label htmlFor={`${idPrefix}-friendship`}>Friendship level (with a co-participating friend)</label>
      <select
        id={`${idPrefix}-friendship`}
        value={value}
        onChange={(e) => onChange(e.target.value as FriendshipLevel)}
        title={FRIENDSHIP_HINT}
      >
        {FRIENDSHIP_ORDER.map((f) => (
          <option key={f} value={f}>
            {FRIENDSHIP_LABELS[f]}
          </option>
        ))}
      </select>
    </div>
  );
}
