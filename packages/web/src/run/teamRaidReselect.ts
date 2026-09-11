/**
 * IDEAS.md #12 — "re-selecting a different six after a wipe." teamRaid.ts's
 * own `TeamRaidReselector`/`TeamRaidReselectContext` doc comments are
 * explicit that packages/engine deliberately implements NO selection
 * heuristic at all (it has no roster pool, no scoring, no idea what
 * "best remaining" means) — this module is that caller-supplied strategy,
 * built from packages/web's own `rosterPool.ts` (read-only from here; see
 * this feature's file-ownership note — rosterPool.ts itself belongs to Web
 * lane 2).
 *
 * STRATEGY (deliberately simple, documented rather than hidden): rank the
 * WHOLE imported roster pool once, up front, by a cheap, non-simulated
 * damage-output proxy against the CURRENT boss —
 *   effective Attack stat x (chargedMove.power / chargedMove.durationSeconds)
 *   x STAB x type-effectiveness(chargedMove.type, boss.types)
 *   x sqrt(effective Stamina)   [a rough bulk factor]
 * — using each entry's OWN level/IVs/moveset (never the roster-wide shared
 * ones). This is NOT rosterPlanner.ts's own Stage-1 screen (screenScoreFor),
 * which calls runSustainedComparison per candidate — far too expensive to
 * re-run on every wipe from inside a UI render, and this closure has none of
 * that module's simulation-batching infrastructure available. It is also
 * NOT a full simulation-based ranking; it is a heuristic, same tier of
 * approximation as e.g. MoveSelect.tsx's own "power/duration" DPS chip.
 *
 * On each wipe, `reselectAfterWipe` excludes only the SIX entries that just
 * fielded (matched back to the pool via `slotId === entry.entryId` — see
 * `toSlotInput` below, which sets `slotId` on every entry it returns) from
 * the top of that ranking, picking the next-best up-to-six from what's left
 * — "avoiding whoever just fainted," not everyone ever fielded, so a strong
 * entry can be re-fielded again two wipes later rather than being
 * permanently benched. Falls back to the ranking's unfiltered top entries
 * (i.e. re-fielding roughly the same six) if excluding would leave nothing
 * — this function must never return an empty array.
 *
 * KNOWN LIMITATION: the very FIRST wipe (cycle 0 -> cycle 1) can't identify
 * "who just fainted" this way, because cycle 0's roster is whatever six the
 * player hand-built in TeamAssumptionPanel — NOT drawn from the roster pool
 * at all, so those slots never got a pool `entryId` as their `slotId` (see
 * runTeamRaid.ts's `buildTeamRaidInputs`, which sets no `slotId` for
 * hand-built slots). That first reselection therefore just returns the
 * pool's unfiltered top six; from cycle 2 onward (every reselection this
 * function itself produced) exclusion works as described above.
 */
import {
  effectiveStatsAtLevel,
  MAX_TEAM_RAID_SLOTS,
  STAB_MULTIPLIER,
  typeEffectiveness,
  type SpeciesDefinition,
  type TeamRaidReselectContext,
  type TeamRaidReselector,
  type TeamRaidSlotInput,
} from "@pogo-analyzer/engine";
import type { RosterEntry } from "../import/pokeGenieMatch.js";

/** See this module's own top doc comment for the full derivation and why it's deliberately a heuristic, not a simulation. */
export function scoreRosterEntryAgainstBoss(entry: RosterEntry, boss: SpeciesDefinition): number {
  const stats = effectiveStatsAtLevel(entry.species, entry.ivs, entry.level);
  const chargedMove =
    entry.species.chargedMoves.find((m) => m.id === entry.chargedMoveId) ?? entry.species.chargedMoves[0];
  if (!chargedMove) return 0;
  const stab = entry.species.types.includes(chargedMove.type) ? STAB_MULTIPLIER : 1;
  const typeEff = typeEffectiveness(chargedMove.type, boss.types);
  const dpsProxy = (chargedMove.power / chargedMove.durationSeconds) * stab * typeEff;
  return stats.attack * dpsProxy * Math.sqrt(Math.max(0, stats.stamina));
}

function toSlotInput(entry: RosterEntry): TeamRaidSlotInput {
  return {
    slotId: entry.entryId,
    species: entry.species,
    fastMoveId: entry.fastMoveId,
    chargedMoveId: entry.chargedMoveId,
    isMega: entry.canMega,
    level: entry.level,
    ivs: entry.ivs,
  };
}

/**
 * Builds a `TeamRaidReselector` from the given roster pool entries and boss —
 * `undefined` when there's nothing usable to build one from (empty pool, or
 * no boss resolved yet), so a caller can pass the result straight through to
 * `TeamRaidInputs.reselectAfterWipe` and get the documented "omitted ==
 * byte-identical to before this feature existed" behavior for free.
 */
export function buildTeamRaidReselector(pool: RosterEntry[], boss: SpeciesDefinition | null): TeamRaidReselector | undefined {
  if (!boss || pool.length === 0) return undefined;
  const ranked = [...pool].sort((a, b) => scoreRosterEntryAgainstBoss(b, boss) - scoreRosterEntryAgainstBoss(a, boss));

  return (context: TeamRaidReselectContext): TeamRaidSlotInput[] => {
    const justFielded = new Set(
      context.previousSlots.map((s) => s.slotId).filter((id): id is string => id !== undefined),
    );
    const eligible = ranked.filter((entry) => !justFielded.has(entry.entryId));
    const pickFrom = eligible.length > 0 ? eligible : ranked;
    const team: RosterEntry[] = [];
    let megaUsed = false;
    for (const entry of pickFrom) {
      if (team.length >= MAX_TEAM_RAID_SLOTS) break;
      if (entry.canMega) {
        if (megaUsed) continue;
        megaUsed = true;
      }
      team.push(entry);
    }
    // Must never return an empty roster (runTeamRaid's own validateRoster
    // throws on that) — falls back to the roster that just fainted unchanged
    // in the pathological case where the pool has zero usable entries left
    // even after the "fall back to the unfiltered ranking" step above (e.g.
    // every pool entry happens to be a second mega).
    if (team.length === 0) return context.previousSlots;
    return team.map(toSlotInput);
  };
}
