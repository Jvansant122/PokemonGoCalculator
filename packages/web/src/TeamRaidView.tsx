import { useEffect, useMemo, useState } from "react";
import {
  buildTeamScenarioUrl,
  MAX_TEAM_RAID_SLOTS,
  parseTeamScenarioFromUrl,
  type IVSpread,
  type MegaLevel,
  type SpeciesDefinition,
  type TeamScenario,
} from "@pogo-analyzer/engine";
import { TeamAssumptionPanel, emptyTeamSlot, type TeamAssumptions, type TeamSlotAssumption } from "./TeamAssumptionPanel.js";
import type { TeamRaidPrefill } from "./teamRaidPrefill.js";
import { BOSS_CADENCE_HINT, type BossChargedMoveCadence } from "./bossCadence.js";
import { CollapsibleSection } from "./CollapsibleSection.js";
import { LineupBuilderPanel, type LineupBuilderPanelState } from "./LineupBuilderPanel.js";
import { applyLineupSlotsToTeamAssumptions, runLineupBuilderForTeamRaid } from "./lineupBuilderAction.js";
import { MEGA_LEVEL_HINT } from "./megaLevelSelect.js";
import { TeamDamageChart } from "./TeamDamageChart.js";
import { TeamRaidBreakdownTable } from "./TeamRaidBreakdownTable.js";
import { getBaseUrl } from "./urlUtils.js";
import { candidatePickerOptions, speciesRegistry, targetPickerOptions, unmatchedActiveRaids } from "./registry.js";
import { hydrateRosterPool, loadRosterPool } from "./rosterPool.js";
import { runTeamRaidScenario } from "./run/runTeamRaid.js";
import { teamAssumptionsToPowerUpOptimizerAssumptions, TEAM_RAID_EXPORT_MISSING_NOTE } from "./teamRaidExport.js";
import { assumptionsToScenario as powerUpAssumptionsToScenario } from "./PowerUpOptimizerView.js";
import { buildPowerUpOptimizerScenarioUrl } from "./powerUpOptimizerScenario.js";

// A ready-to-run default roster/target so a fresh page load demonstrates a
// real result immediately, not an empty form — mirrors the comparator's own
// DEFAULT_CANDIDATE_A_ID/DEFAULT_CANDIDATE_B_ID/DEFAULT_TARGET_ID precedent.
// Exactly one slot (mewtwo-mega-x) carries a boost mechanic and isMega: true;
// every other default slot is deliberately a non-mega species so the roster
// never accidentally exercises the "unflagged slot also happens to carry a
// boost" edge case runTeamRaid's own validation doesn't police (see
// TeamAssumptionPanel's normalization for how a bad decoded link is handled).
// The 6th slot is deliberately left EMPTY (`speciesId: null`) — this is a
// real, legal roster (a trainer can field fewer than MAX_TEAM_RAID_SLOTS),
// and leaving it empty here doubles as a live demonstration of that. Lucario
// legitimately appears TWICE (slots 4 and 5) — a trainer really can field the
// same species more than once; this is not a copy-paste mistake.
//
// Roster/boss/level replaced 2026-09-10 (a live audit found the-then-current
// default — Mega Latios/Garchomp/Dragonite/Kartana/Tyranitar/Rayquaza vs.
// tyranitar-mega — failed outright at every level: 0% clear rate, every
// summary stat "n/a"). Root cause was a real type problem, not a level
// problem: mostly Dragon/Flying/Psychic attacking into a Rock/Dark boss (Mega
// Latios's Psychic charged move is FLAT IMMUNE to Dark). The replacement
// roster then used was plain "tyranitar" (3-Star Raids, 3600 HP) rather than
// its Mega form, based on a measurement that a Fighting/Steel counter team
// "fell ~25% short" at level 40 and "8146/9000 HP, 27.15 vs 30.00 DPS,
// ~9.5% short" at level 50 against Mega Tyranitar (9000 HP).
//
// CORRECTED 2026-09-10 (same day, follow-up audit): that measurement does
// NOT reproduce. Re-running comparable Fighting-counter rosters against
// tyranitar-mega at BOTH level 35 and level 50, under perfect/none/50%-missed
// dodging, clears every time with a real margin (e.g. Mega Mewtwo X/
// Machamp/Terrakion/Lucario/Lucario cleared in 280.4s at L35 and 256.1s at
// L50 — see below). The likely cause of the original error: comparing a MEAN
// team-DPS statistic (27.15) against a 9000 HP / 300s = 30 DPS THRESHOLD.
// Those are not the same quantity — the 30 DPS figure assumes zero downtime,
// while the simulation's actual clear time already absorbs swap costs,
// faints, and wipe-and-revive loops, so a run that clears at 256-280s (out of
// a 300s timer) is really running at ~30-35 EFFECTIVE DPS (9000 HP / clear
// time), not the lower mean-DPS readout of the same run. The boss is
// reverted to its Mega form (tyranitar-mega, Mega Raids, 9000 HP) now that
// the reason for demoting it to plain "tyranitar" is known to be a units
// error, not a real shortfall — a Mega raid is a meaningfully better first
// impression than a 3-Star one, and this roster clears it with room to
// spare, not a curbstomp: level 35 (15/15/15 IVs), dodge "perfect",
// dodgeFastAttacks off, verified via `npm run run-scenario` on a built share
// link — Cleared at 280.4s of the 300s timer (+19.6s to spare), 2 wipes, 5
// slots used, 13 faint events. (Level 50, same roster/dodge: cleared at
// 256.1s, +43.9s to spare, 2 wipes, 10 faint events — also re-verified.)
// `mewtwo-mega-x`'s only Fighting-typed charged move is `DYNAMIC_PUNCH_PLUS`
// — NOT `DYNAMIC_PUNCH`, which isn't in its movepool at all and would
// silently fall back to `chargedMoves[0]` (Psychic, flat immune vs. Dark)
// with no error; this is exactly the kind of silent fallback that made the
// ORIGINAL wrong measurement plausible, so this slot's charged move id is set
// explicitly and was confirmed present on the species before use.
const DEFAULT_TARGET_ID = "tyranitar-mega";

export const DEFAULT_TEAM_ASSUMPTIONS: TeamAssumptions = {
  slots: [
    { speciesId: "mewtwo-mega-x", fastMoveId: "COUNTER_FAST", chargedMoveId: "DYNAMIC_PUNCH_PLUS", isMega: true, megaLevel: null, isShadow: false },
    { speciesId: "machamp", fastMoveId: "COUNTER_FAST", chargedMoveId: "CLOSE_COMBAT", isMega: false, megaLevel: null, isShadow: false },
    { speciesId: "terrakion", fastMoveId: "DOUBLE_KICK_FAST", chargedMoveId: "SACRED_SWORD", isMega: false, megaLevel: null, isShadow: false },
    { speciesId: "lucario", fastMoveId: "COUNTER_FAST", chargedMoveId: "AURA_SPHERE", isMega: false, megaLevel: null, isShadow: false },
    { speciesId: "lucario", fastMoveId: "COUNTER_FAST", chargedMoveId: "AURA_SPHERE", isMega: false, megaLevel: null, isShadow: false },
    emptyTeamSlot(),
  ],
  targetId: DEFAULT_TARGET_ID,
  bossFastMoveId: "SMACK_DOWN_FAST",
  bossChargedMoveId: "STONE_EDGE",
  level: 35,
  ivAttack: 15,
  ivDefense: 15,
  ivStamina: 15,
  dodge: { kind: "perfect" },
  dodgeFastAttacks: false,
  holdChargedMoveUntilSafe: false,
  weather: "none",
  bossChargedMoveFrequencySeconds: 15,
  bossChargedMoveCadence: "fixed-interval",
  bossStartsPrimed: false,
  bossStartingEnergyFraction: 0.5,
  raidTimerSeconds: 300,
  swapCostSeconds: 0.5,
  reviveCostSeconds: 15,
  showDetailedAssumptions: false,
};

/**
 * Extends the engine's own `TeamScenario`/`TeamScenarioSlot` with a per-slot
 * Shadow toggle that neither declares (see this feature's AFFECTS note to
 * engine-developer — folding this in properly there is their call, not
 * something web-developer should force by editing packages/engine).
 * `encodeTeamScenario`/`decodeTeamScenario` are pure JSON.stringify/parse
 * pass-throughs with no field enumeration, so this extra per-slot field
 * round-trips through the exact same shared base64url transport
 * (buildTeamScenarioUrl/parseTeamScenarioFromUrl) without any
 * packages/engine change — see ComparatorScenario in ComparatorView.tsx for
 * the identical pattern applied to the two-candidate Scenario.
 */
interface TeamScenarioSlotWithShadow {
  speciesId: string | null;
  fastMoveId: string | null;
  chargedMoveId: string | null;
  isMega: boolean;
  megaLevel: MegaLevel | null;
  isShadow: boolean;
  /** See TeamAssumptionPanel.tsx's TeamSlotAssumption.level — the engine's own TeamScenarioSlot already declares this (teamScenario.ts); mirrored here since this type extends Omit<TeamScenario, "slots"> rather than TeamScenario itself. `undefined`/absent means "use the shared roster-wide level" — same fallback convention as every field on this type. */
  level?: number;
  /** See TeamAssumptionPanel.tsx's TeamSlotAssumption.ivs. */
  ivs?: IVSpread;
}
export interface TeamScenarioWithShadow extends Omit<TeamScenario, "slots"> {
  slots: TeamScenarioSlotWithShadow[];
  /**
   * Same "extend rather than edit packages/engine" reasoning as isShadow
   * above — see ComparatorView.tsx's identical ComparatorScenario.
   * bossChargedMoveCadence?: for a link shared before this field existed to
   * decode via `??` below, matching every optional field's convention on
   * this type.
   */
  bossChargedMoveCadence?: BossChargedMoveCadence;
  /**
   * Same extension pattern again. UNLIKE every other optional field on this
   * type, an ABSENT value here decodes to `true`, not
   * DEFAULT_TEAM_ASSUMPTIONS.showDetailedAssumptions (`false`) — see
   * teamScenarioToAssumptions below for why.
   */
  showDetailedAssumptions?: boolean;
}

export function assumptionsToTeamScenario(a: TeamAssumptions): TeamScenarioWithShadow {
  return {
    slots: a.slots.map((s) => ({
      speciesId: s.speciesId,
      fastMoveId: s.fastMoveId,
      chargedMoveId: s.chargedMoveId,
      isMega: s.isMega,
      megaLevel: s.megaLevel,
      isShadow: s.isShadow,
      level: s.level,
      ivs: s.ivs,
    })),
    target: a.targetId,
    bossFastMoveId: a.bossFastMoveId,
    bossChargedMoveId: a.bossChargedMoveId,
    level: a.level,
    ivs: { attack: a.ivAttack, defense: a.ivDefense, stamina: a.ivStamina },
    dodgeModel: a.dodge,
    dodgeFastAttacks: a.dodgeFastAttacks,
    holdChargedMoveUntilSafe: a.holdChargedMoveUntilSafe,
    weather: a.weather,
    bossChargedMoveFrequencySeconds: a.bossChargedMoveFrequencySeconds,
    bossChargedMoveCadence: a.bossChargedMoveCadence,
    bossStartsPrimed: a.bossStartsPrimed,
    bossStartingEnergyFraction: a.bossStartingEnergyFraction,
    raidTimerSeconds: a.raidTimerSeconds,
    swapCostSeconds: a.swapCostSeconds,
    reviveCostSeconds: a.reviveCostSeconds,
    showDetailedAssumptions: a.showDetailedAssumptions,
  };
}

export function teamScenarioToAssumptions(s: TeamScenarioWithShadow): TeamAssumptions {
  const slots: TeamSlotAssumption[] = s.slots.map((slot) => ({
    speciesId: slot.speciesId ?? null,
    fastMoveId: slot.fastMoveId ?? null,
    chargedMoveId: slot.chargedMoveId ?? null,
    isMega: slot.isMega ?? false,
    // `??` guards a scenario URL encoded before this field existed rather
    // than surfacing `undefined` into the Mega Level <select> below — same
    // discipline as ComparatorView's candidateMegaLevel.
    megaLevel: slot.megaLevel ?? null,
    // `??` guards a scenario URL encoded before this field existed (it isn't
    // even declared on the engine's own TeamScenarioSlot — see
    // TeamScenarioWithShadow above) rather than surfacing `undefined` into
    // the checkbox below.
    isShadow: slot.isShadow ?? false,
    // Straight passthrough, no `??` fallback needed — `undefined`/absent
    // already IS the correct "use the shared roster-wide level/IVs" meaning
    // on both sides (TeamScenarioSlot.level/ivs and TeamSlotAssumption.level/ivs
    // share that exact optional-means-inherit convention), so there is no
    // separate "old link predates this field" case to guard against the way
    // e.g. swapCostSeconds below has to.
    level: slot.level,
    ivs: slot.ivs,
  }));
  // Defensive pad/truncate in case an older or hand-edited link has a
  // different slot count than MAX_TEAM_RAID_SLOTS.
  while (slots.length < MAX_TEAM_RAID_SLOTS) slots.push(emptyTeamSlot());
  return {
    slots: slots.slice(0, MAX_TEAM_RAID_SLOTS),
    targetId: s.target,
    // `??` guards a scenario URL encoded before a field existed rather than
    // surfacing `undefined` into a controlled input — same discipline as
    // App.tsx's scenarioToAssumptions.
    bossFastMoveId: s.bossFastMoveId ?? null,
    bossChargedMoveId: s.bossChargedMoveId ?? null,
    level: s.level,
    ivAttack: s.ivs.attack,
    ivDefense: s.ivs.defense,
    ivStamina: s.ivs.stamina,
    dodge: s.dodgeModel,
    dodgeFastAttacks: s.dodgeFastAttacks ?? DEFAULT_TEAM_ASSUMPTIONS.dodgeFastAttacks,
    holdChargedMoveUntilSafe: s.holdChargedMoveUntilSafe ?? DEFAULT_TEAM_ASSUMPTIONS.holdChargedMoveUntilSafe,
    weather: s.weather ?? "none",
    bossChargedMoveFrequencySeconds: s.bossChargedMoveFrequencySeconds ?? DEFAULT_TEAM_ASSUMPTIONS.bossChargedMoveFrequencySeconds,
    // `??` guards a scenario URL encoded before this field existed (it isn't
    // even declared on the engine's own TeamScenario — see
    // TeamScenarioWithShadow above) rather than surfacing `undefined` into
    // the cadence <select>.
    bossChargedMoveCadence: s.bossChargedMoveCadence ?? DEFAULT_TEAM_ASSUMPTIONS.bossChargedMoveCadence,
    bossStartsPrimed: s.bossStartsPrimed ?? DEFAULT_TEAM_ASSUMPTIONS.bossStartsPrimed,
    bossStartingEnergyFraction: s.bossStartingEnergyFraction ?? DEFAULT_TEAM_ASSUMPTIONS.bossStartingEnergyFraction,
    raidTimerSeconds: s.raidTimerSeconds ?? DEFAULT_TEAM_ASSUMPTIONS.raidTimerSeconds,
    // Deliberately NOT `?? DEFAULT_TEAM_ASSUMPTIONS.swapCostSeconds` (0.5) —
    // a link with these two fields truly absent predates the fields
    // existing at all, back when this tab really did assume 0 (fastest-
    // possible play). Falling back to today's new placeholder default
    // instead would silently change what an old link meant, same principle
    // as showDetailedAssumptions's inverted default below.
    swapCostSeconds: s.swapCostSeconds ?? 0,
    reviveCostSeconds: s.reviveCostSeconds ?? 0,
    // INVERTED default versus every other `??` above: an ABSENT value here
    // means the link was shared before this setting existed, when there was
    // no "simple/derived" mode at all — the sender's stored
    // bossChargedMoveFrequencySeconds WAS the real number in force for that
    // run. Defaulting the absent case to `true` (not
    // DEFAULT_TEAM_ASSUMPTIONS.showDetailedAssumptions, which is `false`)
    // preserves that stored value instead of silently swapping it for a
    // newly-derived one — "a shared link's meaning never silently changes"
    // (see bossCadence.tsx's identical concern). Do not "fix" this to match
    // the DEFAULT_TEAM_ASSUMPTIONS pattern every other field uses.
    showDetailedAssumptions: s.showDetailedAssumptions ?? true,
  };
}

function resolveSpecies(id: string | null): SpeciesDefinition | null {
  return id && speciesRegistry.has(id) ? speciesRegistry.get(id) : null;
}

/**
 * Enforces runTeamRaid's own isMega invariant (at most one slot flagged, and
 * only for a species with a boost mechanic) BEFORE the engine ever sees it,
 * so a decoded shared link that's stale (species swapped since, or hand-
 * edited) degrades to "no mega flagged" instead of throwing a hard error —
 * same UX precedent as SpeciesPicker's own "unknown species id, pick a
 * replacement" warning rather than a crash. Run on every state update (not
 * just on decode), since a live species swap (picking a non-boost species
 * into a slot that was previously the flagged mega) needs the same
 * correction.
 */
export function normalizeTeamAssumptions(a: TeamAssumptions): TeamAssumptions {
  let megaClaimed = false;
  const slots = a.slots.map((s) => {
    const hasBoost = !!resolveSpecies(s.speciesId)?.boost;
    let isMega = s.isMega;
    if (isMega) {
      if (!hasBoost || megaClaimed) isMega = false;
      else megaClaimed = true;
    }
    // Shadow and mega/primal boost are mutually exclusive (shadow.ts's
    // shadowAdjustedBaseStats throws if both are set on the same species) —
    // force this slot's Shadow toggle off whenever ITS OWN species carries a
    // boost, independent of isMega above (a boost-carrying species is never
    // eligible for the Shadow toggle even if this particular slot isn't the
    // one flagged isMega for the raid).
    const isShadow = hasBoost ? false : s.isShadow;
    return { ...s, isMega, isShadow };
  });
  return { ...a, slots };
}

/**
 * `prefill` (the "start from a Pokémon" hand-off from SpeciesReportView, see
 * teamRaidPrefill.ts) takes priority over any URL scenario when present —
 * same "a live click is a stronger, more recent signal" precedent as
 * ComparatorView's own initialAssumptions. Only slot 1 (species + its
 * currently-selected moveset) and the boss target are seeded; every other
 * slot, the shared level/IV spread, dodge/weather/timer, etc. all stay at
 * DEFAULT_TEAM_ASSUMPTIONS, left for the player to adjust — the boss's own
 * fast/charged move selection resets to null (its first move) rather than
 * carrying over DEFAULT_TEAM_ASSUMPTIONS' moves, which belong to a
 * completely different boss.
 */
function initialTeamAssumptions(prefill: TeamRaidPrefill | null): TeamAssumptions {
  if (prefill) {
    return {
      ...DEFAULT_TEAM_ASSUMPTIONS,
      slots: [
        { ...emptyTeamSlot(), speciesId: prefill.speciesId, fastMoveId: prefill.fastMoveId, chargedMoveId: prefill.chargedMoveId },
        ...DEFAULT_TEAM_ASSUMPTIONS.slots.slice(1),
      ],
      targetId: prefill.targetId,
      bossFastMoveId: null,
      bossChargedMoveId: null,
    };
  }
  if (typeof window === "undefined") return DEFAULT_TEAM_ASSUMPTIONS;
  // Cast: parseTeamScenarioFromUrl's return type is the engine's own
  // (narrower) TeamScenario — the actual decoded object still carries each
  // slot's isShadow at runtime if the link was built by this version of the
  // app, see TeamScenarioWithShadow above.
  const fromUrl = parseTeamScenarioFromUrl(window.location.href) as TeamScenarioWithShadow | null;
  return fromUrl ? normalizeTeamAssumptions(teamScenarioToAssumptions(fromUrl)) : DEFAULT_TEAM_ASSUMPTIONS;
}

function speciesLabel(s: SpeciesDefinition): string {
  return s.isHypothetical ? `${s.name} (hypothetical)` : s.name;
}

/**
 * The Team Raid Simulator: a single trainer's own 6-Pokémon sequential
 * lineup against a boss's real HP pool and countdown timer, with
 * wipe-and-revive looping. See
 * .claude/agent-memory/pogo-researcher/proposal_sequential_team_raid_tab.md
 * (Section 9 addendum in particular — a full wipe is a time-cost-and-continue
 * event, NOT a loss condition) and packages/engine/src/teamRaid.ts (the
 * actual engine surface this view calls).
 */
interface TeamRaidViewProps {
  /** See teamRaidPrefill.ts — non-null only immediately after a "Send to Team Raid Simulator" click from the Species Report tab. */
  prefill?: TeamRaidPrefill | null;
  /** Called once, right after this component's initial mount, if it was seeded from a non-null `prefill` — lets App.tsx clear its own prefill state so a later, unrelated remount of this view doesn't silently reapply the same stale hand-off. Same precedent as ComparatorView's own onConsumedPrefill. */
  onConsumedPrefill?: () => void;
}

export function TeamRaidView({ prefill = null, onConsumedPrefill }: TeamRaidViewProps = {}) {
  const [assumptions, setAssumptionsRaw] = useState<TeamAssumptions>(() => normalizeTeamAssumptions(initialTeamAssumptions(prefill)));
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [lineupBuilderState, setLineupBuilderState] = useState<LineupBuilderPanelState>({ kind: "idle" });

  // Runs once, immediately after mount — this component fully unmounts
  // whenever another tab is active, so "mount" and "just received a fresh
  // hand-off" are the same event here (same precedent as ComparatorView).
  useEffect(() => {
    if (prefill) onConsumedPrefill?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setAssumptions(next: TeamAssumptions) {
    setAssumptionsRaw(normalizeTeamAssumptions(next));
  }

  const slotOptions = useMemo(() => candidatePickerOptions(), []);
  const targetOptions = useMemo(() => targetPickerOptions(), []);
  const unmatchedRaids = useMemo(() => unmatchedActiveRaids(), []);

  // The entire engine-facing computation (species resolution, Shadow
  // application, boss tier/energy/readiness/HP, and the runTeamRaid
  // simulation itself) lives in runTeamRaidScenario (run/runTeamRaid.ts) — a
  // pure, React-free function shared with the run-scenario CLI and this
  // tab's own vitest smoke test. Aliased back to their original names so the
  // render code below needs no changes at all.
  const runResult = useMemo(() => runTeamRaidScenario(assumptions, speciesRegistry), [assumptions]);
  const slotSpecies = runResult.slotSpecies;
  const bossSpecies = runResult.bossSpecies;
  const bossReadySeconds = runResult.bossReadySeconds;
  const bossHp = runResult.bossHp;
  const failureSummary = runResult.failureSummary;
  const bossMovesetSweep = runResult.bossMovesetSweep;
  const result = { data: runResult.data, error: runResult.error };

  function handleShare() {
    // Stamps `view=team-raid` alongside the `ts` param so reloading this
    // link restores THIS tab, not whichever one App.tsx happened to default
    // to — see App.tsx's tab-switch scaffold.
    const url = new URL(buildTeamScenarioUrl(getBaseUrl(), assumptionsToTeamScenario(assumptions)));
    url.searchParams.set("view", "team-raid");
    window.history.replaceState(null, "", url.toString());
    setShareUrl(url.toString());
  }

  /**
   * Sends this roster to the Power-Up Optimizer, same "build the destination
   * scenario, stamp its `view=`, navigate" mechanism as App.tsx's own
   * `view=` tab-switch scaffold and every "Build link" button already use —
   * no new lifted App.tsx state, no second cross-tab mechanism (see
   * teamRaidExport.ts's own doc comment for exactly what does/doesn't
   * carry). A real navigation (not an in-SPA tab switch) is required here
   * because App.tsx only reads `view=` once, at its own initial mount.
   */
  function handleExportToPowerUpOptimizer() {
    const puAssumptions = teamAssumptionsToPowerUpOptimizerAssumptions(assumptions);
    const url = new URL(buildPowerUpOptimizerScenarioUrl(getBaseUrl(), powerUpAssumptionsToScenario(puAssumptions)));
    url.searchParams.set("view", "power-up-optimizer");
    window.location.href = url.toString();
  }

  /**
   * The Lineup Builder's own action — see lineupBuilderAction.ts. Reads the
   * imported roster pool fresh from localStorage on click (rosterPool.ts is
   * shared web state Team Raid has never owned or displayed before this
   * feature) rather than subscribing to it, since nothing on this tab needs
   * to react live to an import happening on a different tab. On a genuine
   * result, immediately fills this tab's own six slots with the winning
   * lineup (per-slot level/IVs included) — the "Export roster to Power-Up
   * Optimizer" button above already carries whatever's in those slots
   * onward, so this needs no second export path of its own.
   */
  function handleBuildLineup() {
    const hydrated = hydrateRosterPool(loadRosterPool(), speciesRegistry);
    const outcome = runLineupBuilderForTeamRaid(
      assumptions,
      hydrated.entries,
      bossSpecies,
      runResult.bossRaidTier,
      runResult.effectiveBossChargedMoveFrequencySeconds,
    );
    if (outcome.blockedReason) {
      setLineupBuilderState({ kind: "blocked", reason: outcome.blockedReason });
      return;
    }
    if (outcome.error) {
      setLineupBuilderState({ kind: "error", message: outcome.error });
      return;
    }
    setLineupBuilderState({ kind: "result", result: outcome.result!, rosterSize: hydrated.entries.length });
    setAssumptions(applyLineupSlotsToTeamAssumptions(assumptions, outcome.result!.winner.slots));
  }

  const rosterNames = slotSpecies.filter((s): s is SpeciesDefinition => s !== null).map((s) => speciesLabel(s));

  return (
    <>
      <p className="subtitle">
        {rosterNames.length > 0 ? rosterNames.join(" → ") : "Build a 6-slot team"} vs{" "}
        {bossSpecies ? speciesLabel(bossSpecies) : "a raid boss"} — one trainer's own sequential lineup against the
        boss's real HP pool and countdown timer, with wipe-and-revive looping.
      </p>

      <LineupBuilderPanel state={lineupBuilderState} onBuild={handleBuildLineup} />

      <TeamAssumptionPanel
        value={assumptions}
        onChange={setAssumptions}
        slotOptions={slotOptions}
        targetOptions={targetOptions}
        unmatchedRaids={unmatchedRaids}
        slotSpecies={slotSpecies}
        bossSpecies={bossSpecies}
        bossReadySeconds={bossReadySeconds}
        bossHp={bossHp}
        effectiveBossChargedMoveFrequencySeconds={runResult.effectiveBossChargedMoveFrequencySeconds}
      />

      {result.error && (
        <section className="panel">
          <p className="error-text">Could not compute this raid: {result.error}</p>
        </section>
      )}

      {result.data && (
        <>
          <CollapsibleSection id="team-raid-result" heading="Raid result" defaultOpen>
            <p
              className={`raid-outcome ${result.data.outcome === "cleared" ? "raid-outcome-cleared" : "raid-outcome-failed"}`}
            >
              {result.data.outcome === "cleared" ? "Cleared" : "Timer expired — raid failed"}
            </p>
            {bossMovesetSweep && (
              <p className={`caveats ${bossMovesetSweep.verdictVaries ? "boss-moveset-risk" : ""}`} style={{ marginTop: -4, marginBottom: 12 }}>
                {bossMovesetSweep.verdictVaries ? (
                  <>
                    Boss moveset risk: this roster{" "}
                    <strong>clears against {bossMovesetSweep.results.filter((r) => r.clearsWithinTimer).map((r) => r.moveName).join(", ")}</strong>
                    {" "}but{" "}
                    <strong>fails against {bossMovesetSweep.results.filter((r) => !r.clearsWithinTimer).map((r) => r.moveName).join(", ")}</strong>
                    {" "}— which charged move the boss actually rolls can flip this outcome. Same roster/assumptions throughout.
                  </>
                ) : (
                  <>
                    {result.data.outcome === "cleared" ? "Clears" : "Fails"} against all {bossMovesetSweep.results.length} of this boss's known
                    charged moves, not just the one currently selected above.
                  </>
                )}
              </p>
            )}
            <div className="result-card">
              <div className="stat-tile-headline">
                <span className="stat-tile-value">
                  {result.data.timeToClearSeconds !== null
                    ? `${result.data.timeToClearSeconds.toFixed(1)}s`
                    : failureSummary
                      ? `${(failureSummary.fractionOfBossHpDealt * 100).toFixed(0)}%`
                      : "n/a"}
                </span>
                <span className="stat-tile-unit">
                  {result.data.timeToClearSeconds !== null ? "time to clear" : failureSummary ? "of boss HP dealt" : "time to clear"}
                </span>
              </div>
              <dl>
                <dt>Time to clear</dt>
                <dd>
                  {result.data.timeToClearSeconds === null
                    ? "never (in this simulated run)"
                    : `${result.data.timeToClearSeconds.toFixed(1)}s`}
                </dd>
                <dt>Timer margin</dt>
                <dd>
                  {result.data.timerMarginSeconds === null
                    ? "n/a"
                    : `${result.data.timerMarginSeconds >= 0 ? "+" : ""}${result.data.timerMarginSeconds.toFixed(1)}s ${
                        result.data.timerMarginSeconds >= 0 ? "to spare" : "short"
                      }`}
                </dd>
                {failureSummary && (
                  <>
                    <dt title="How much of the boss's HP this run actually dealt before the timer ran out">Boss HP reached</dt>
                    <dd>
                      {(failureSummary.fractionOfBossHpDealt * 100).toFixed(0)}% ({failureSummary.totalDamageDealt.toFixed(0)} /{" "}
                      {(failureSummary.totalDamageDealt + failureSummary.bossHpRemaining).toFixed(0)} HP)
                    </dd>
                    <dt title="Average team DPS this run actually achieved vs. what the boss's HP over the raid timer would have needed">
                      Team DPS shortfall
                    </dt>
                    <dd>
                      ~{failureSummary.averageTeamDpsShortfall.toFixed(1)} short (avg {failureSummary.achievedAverageTeamDps.toFixed(1)}{" "}
                      of ~{failureSummary.requiredAverageTeamDps.toFixed(1)} needed)
                    </dd>
                    <dt>Time left when the clock ran out</dt>
                    <dd>{failureSummary.timeLeftOnClockSeconds.toFixed(1)}s</dd>
                  </>
                )}
                <dt>Finishing blow</dt>
                <dd>
                  {result.data.clearingCycleIndex === null || result.data.clearingSlotIndex === null
                    ? "n/a"
                    : `Cycle ${result.data.clearingCycleIndex}, Slot ${result.data.clearingSlotIndex + 1} (${
                        slotSpecies[result.data.clearingSlotIndex]?.name ?? "?"
                      })`}
                </dd>
                <dt>Wipe count</dt>
                <dd>{result.data.wipeCount}</dd>
                <dt>Slots used / faint events</dt>
                <dd>
                  {result.data.slotsUsed} used, {result.data.slotsFainted} faint events
                </dd>
              </dl>
            </div>
          </CollapsibleSection>

          <CollapsibleSection id="team-raid-cumulative-chart" heading="Cumulative team damage vs. boss HP over the raid timer" defaultOpen>
            <TeamDamageChart
              slots={result.data.slots}
              bossHp={bossHp ?? 0}
              raidTimerSeconds={assumptions.raidTimerSeconds}
              outcome={result.data.outcome}
              timeToClearSeconds={result.data.timeToClearSeconds}
            />
          </CollapsibleSection>

          <CollapsibleSection id="team-raid-breakdown" heading="Per-cycle/per-slot breakdown" defaultOpen={false}>
            <TeamRaidBreakdownTable
              rows={result.data.slots}
              clearingCycleIndex={result.data.clearingCycleIndex}
              clearingSlotIndex={result.data.clearingSlotIndex}
            />
          </CollapsibleSection>
        </>
      )}

      <section className="panel">
        <h2>Share this scenario</h2>
        <div className="share-row">
          <button onClick={handleShare}>Build link</button>
          {shareUrl && <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />}
        </div>
        <div className="share-row">
          <button type="button" onClick={handleExportToPowerUpOptimizer}>
            Export roster to Power-Up Optimizer →
          </button>
        </div>
        <p className="species-picker-hint">{TEAM_RAID_EXPORT_MISSING_NOTE}</p>
      </section>

      <CollapsibleSection id="team-raid-known-caveats" heading="Known caveats" defaultOpen={false}>
        <div className="note-block">
        <details className="prose-details">
          <summary>Roster &amp; boost scope</summary>
          <p>
          A team can field fewer than {MAX_TEAM_RAID_SLOTS} Pokémon — leave any slot empty ("clear" it) and it
          simply never enters the fight. Solo-trainer scope only: the mega/primal team-wide damage boost never
          applies to the mega-bringer's own party in the real game (only to OTHER trainers simultaneously present in
          the same raid) — so bringing a mega into this roster only ever boosts that ONE slot's own damage while
          it's the active attacker, and there is no "other trainers in this raid" modeling here at all (a
          deliberately separate, out-of-scope axis — see the design doc's Section 7).
          </p>
        </details>
        <details className="prose-details">
          <summary>Simulation model</summary>
          <p>
          V1 assumes unlimited healing items on a full wipe (a real resource constraint the game enforces via Bag
          items, not modeled here) and no cap on wipe-and-rejoin cycles other than a purely-engineering safety guard
          against a degenerate near-zero-damage roster looping indefinitely (MAX_TEAM_RAID_CYCLES). The boss's
          charged-move cooldown carries forward continuously across every slot handoff and every wipe-and-revive —
          it's one continuous encounter from the boss's own side; it doesn't reset just because the trainer swapped
          Pokémon or briefly returned to the lobby to heal. "Boss charged-move cadence model" (in Assumptions)
          defaults to the fixed mean-interval model this tab has always used; two experimental alternatives instead
          derive the boss's timing from its own energy across the WHOLE encounter (every slot, every cycle) —
          "Energy-driven" (a 50% roll per move-completion boundary) and "Energy-gated interval" (one jittered delay
          once eligible) — see "Boss charged-move cadence model" below for what's independently sourced, what's this
          project's own reasoned inference, and what's simply unvalidated. Both stay off by default so a shared
          link's meaning never silently changes. A boss badged "approximate" in the target picker is one the live
          raid feed named but whose exact form this data layer couldn't resolve, so a documented stand-in species'
          stats are used — treat those runs as directional.
          </p>
        </details>
        <details className="prose-details">
          <summary>Mega Level</summary>
          <p>{MEGA_LEVEL_HINT}</p>
        </details>
        <details className="prose-details">
          <summary>Boss charged-move cadence model</summary>
          <p>{BOSS_CADENCE_HINT}</p>
        </details>
        <details className="prose-details">
          <summary>The "More detailed" toggle</summary>
          <p>
          Reveals four advanced knobs (hold-for-safe-window, boss charged-move mean frequency, swap-in cost,
          wipe-and-rejoin cost) whose current values are deliberate placeholders pending further research, not
          confirmed game constants. Leave this unchecked to use the simple, documented defaults instead. With it
          unchecked, the boss's charged-move mean frequency is likewise a placeholder — derived from this boss's own
          fast-move charge time rather than a fixed number, standing in for "the time it takes to charge its first
          charged attack" pending further improvement, not a modeled mechanic.
          </p>
        </details>
        <details className="prose-details">
          <summary>Swap-in / wipe-and-rejoin cost sourcing</summary>
          <p>
          swapCostSeconds/reviveCostSeconds have no confirmed real value from any official or community source —
          they default to 0.5s and 15s respectively rather than 0 (fastest-possible play), both honest placeholders
          rather than fabricated "realistic" numbers: 0.5s for a swap-in, and 15s for a full wipe chosen at the TOP
          of the community-reported 12-15s heal window specifically to allow for user error, not because 15s is any
          more confirmed than the rest of that window. Pokémon GO Hub's "Tips for short-manning raids" is the source
          of that 12-15s figure — a player/hardware-dependent community estimate, not a confirmed game constant; a
          labeled ~13s preset from the same source is offered as an alternative to the default 15s.
          </p>
        </details>
        <details className="prose-details">
          <summary>Raid timer</summary>
          <p>Real, documented per-tier raid countdown — see raidBoss.ts's RAID_TIER_TABLE.</p>
        </details>
        <details className="prose-details">
          <summary>Boss moveset risk callout</summary>
          <p>
          "Clears against X, fails against Y" (shown above the raid result whenever this boss has 2+ known charged
          moves) re-runs this exact roster and every other assumption unchanged, once per charged move this boss is
          actually known to use, and compares only the clear/no-clear verdict. This has no way to know which move a
          real raid will actually roll (that information isn't in the data this project has), so it can't say HOW
          LIKELY the failing moveset is — only that it exists. Treat a flagged risk as "worth a safety margin," not
          as a probability.
          </p>
        </details>
        </div>
      </CollapsibleSection>
    </>
  );
}
