import { useMemo, useState } from "react";
import {
  bossChargedMoveReadySeconds,
  bossEffectiveHp,
  buildTeamScenarioUrl,
  MAX_TEAM_RAID_SLOTS,
  parseTeamScenarioFromUrl,
  runTeamRaid,
  type SpeciesDefinition,
  type TeamScenario,
} from "@pogo-analyzer/engine";
import { TeamAssumptionPanel, emptyTeamSlot, type TeamAssumptions, type TeamSlotAssumption } from "./TeamAssumptionPanel.js";
import { TeamDamageChart } from "./TeamDamageChart.js";
import { TeamRaidBreakdownTable } from "./TeamRaidBreakdownTable.js";
import { applyShadowToggle } from "./shadowToggle.js";
import { getBaseUrl } from "./urlUtils.js";
import { candidatePickerOptions, raidTierForSpeciesId, speciesRegistry, targetPickerOptions, unmatchedActiveRaids } from "./registry.js";

// A ready-to-run default roster/target so a fresh page load demonstrates a
// real result immediately, not an empty form — mirrors the comparator's own
// DEFAULT_CANDIDATE_A_ID/DEFAULT_CANDIDATE_B_ID/DEFAULT_TARGET_ID precedent.
// Exactly one slot (latios-mega) carries a boost mechanic and isMega: true;
// every other default slot is deliberately a non-mega species so the roster
// never accidentally exercises the "unflagged slot also happens to carry a
// boost" edge case runTeamRaid's own validation doesn't police (see
// TeamAssumptionPanel's normalization for how a bad decoded link is handled).
const DEFAULT_TARGET_ID = "tyranitar-mega";

const DEFAULT_TEAM_ASSUMPTIONS: TeamAssumptions = {
  slots: [
    { speciesId: "latios-mega", fastMoveId: null, chargedMoveId: null, isMega: true, isShadow: false },
    { speciesId: "garchomp", fastMoveId: null, chargedMoveId: null, isMega: false, isShadow: false },
    { speciesId: "dragonite", fastMoveId: null, chargedMoveId: null, isMega: false, isShadow: false },
    { speciesId: "kartana", fastMoveId: null, chargedMoveId: null, isMega: false, isShadow: false },
    { speciesId: "tyranitar", fastMoveId: null, chargedMoveId: null, isMega: false, isShadow: false },
    { speciesId: "rayquaza", fastMoveId: null, chargedMoveId: null, isMega: false, isShadow: false },
  ],
  targetId: DEFAULT_TARGET_ID,
  bossFastMoveId: null,
  bossChargedMoveId: null,
  level: 40,
  ivAttack: 15,
  ivDefense: 15,
  ivStamina: 15,
  dodge: { kind: "none" },
  dodgeFastAttacks: false,
  holdChargedMoveUntilSafe: false,
  weather: "none",
  bossChargedMoveFrequencySeconds: 15,
  bossStartsPrimed: false,
  bossStartingEnergyFraction: 0.5,
  raidTimerSeconds: 300,
  swapCostSeconds: 0,
  reviveCostSeconds: 0,
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
  isShadow: boolean;
}
interface TeamScenarioWithShadow extends Omit<TeamScenario, "slots"> {
  slots: TeamScenarioSlotWithShadow[];
}

function assumptionsToTeamScenario(a: TeamAssumptions): TeamScenarioWithShadow {
  return {
    slots: a.slots.map((s) => ({
      speciesId: s.speciesId,
      fastMoveId: s.fastMoveId,
      chargedMoveId: s.chargedMoveId,
      isMega: s.isMega,
      isShadow: s.isShadow,
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
    bossStartsPrimed: a.bossStartsPrimed,
    bossStartingEnergyFraction: a.bossStartingEnergyFraction,
    raidTimerSeconds: a.raidTimerSeconds,
    swapCostSeconds: a.swapCostSeconds,
    reviveCostSeconds: a.reviveCostSeconds,
  };
}

function teamScenarioToAssumptions(s: TeamScenarioWithShadow): TeamAssumptions {
  const slots: TeamSlotAssumption[] = s.slots.map((slot) => ({
    speciesId: slot.speciesId ?? null,
    fastMoveId: slot.fastMoveId ?? null,
    chargedMoveId: slot.chargedMoveId ?? null,
    isMega: slot.isMega ?? false,
    // `??` guards a scenario URL encoded before this field existed (it isn't
    // even declared on the engine's own TeamScenarioSlot — see
    // TeamScenarioWithShadow above) rather than surfacing `undefined` into
    // the checkbox below.
    isShadow: slot.isShadow ?? false,
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
    bossStartsPrimed: s.bossStartsPrimed ?? DEFAULT_TEAM_ASSUMPTIONS.bossStartsPrimed,
    bossStartingEnergyFraction: s.bossStartingEnergyFraction ?? DEFAULT_TEAM_ASSUMPTIONS.bossStartingEnergyFraction,
    raidTimerSeconds: s.raidTimerSeconds ?? DEFAULT_TEAM_ASSUMPTIONS.raidTimerSeconds,
    swapCostSeconds: s.swapCostSeconds ?? 0,
    reviveCostSeconds: s.reviveCostSeconds ?? 0,
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
function normalizeTeamAssumptions(a: TeamAssumptions): TeamAssumptions {
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

function initialTeamAssumptions(): TeamAssumptions {
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
export function TeamRaidView() {
  const [assumptions, setAssumptionsRaw] = useState<TeamAssumptions>(initialTeamAssumptions);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  function setAssumptions(next: TeamAssumptions) {
    setAssumptionsRaw(normalizeTeamAssumptions(next));
  }

  const slotOptions = useMemo(() => candidatePickerOptions(), []);
  const targetOptions = useMemo(() => targetPickerOptions(), []);
  const unmatchedRaids = useMemo(() => unmatchedActiveRaids(), []);

  const ivs = useMemo(
    () => ({ attack: assumptions.ivAttack, defense: assumptions.ivDefense, stamina: assumptions.ivStamina }),
    [assumptions.ivAttack, assumptions.ivDefense, assumptions.ivStamina],
  );

  const slotSpecies = useMemo(() => assumptions.slots.map((s) => resolveSpecies(s.speciesId)), [assumptions.slots]);
  const bossSpecies = useMemo(() => resolveSpecies(assumptions.targetId), [assumptions.targetId]);

  // Which real raid tier the selected target counts as, if it's currently a
  // live active-raid entry — same derivation/precedent as ComparatorView's
  // bossRaidTier (see registry.ts's raidTierForSpeciesId doc comment for why
  // this isn't its own Scenario/TeamScenario field).
  const bossRaidTier = useMemo(() => raidTierForSpeciesId(assumptions.targetId) ?? undefined, [assumptions.targetId]);

  const selectedBossChargedMove = useMemo(() => {
    if (!bossSpecies) return undefined;
    return bossSpecies.chargedMoves.find((m) => m.id === assumptions.bossChargedMoveId) ?? bossSpecies.chargedMoves[0];
  }, [bossSpecies, assumptions.bossChargedMoveId]);

  const bossStartingEnergy = useMemo(() => {
    if (!assumptions.bossStartsPrimed || !bossSpecies) return 0;
    const cost = selectedBossChargedMove?.energyCost ?? 0;
    return assumptions.bossStartingEnergyFraction * cost;
  }, [assumptions.bossStartsPrimed, assumptions.bossStartingEnergyFraction, bossSpecies, selectedBossChargedMove]);

  const bossReadySeconds = useMemo(() => {
    if (!bossSpecies) return null;
    const fastMove = bossSpecies.fastMoves.find((m) => m.id === assumptions.bossFastMoveId) ?? bossSpecies.fastMoves[0];
    if (!fastMove || !selectedBossChargedMove) return null;
    return bossChargedMoveReadySeconds(fastMove, selectedBossChargedMove, bossStartingEnergy);
  }, [bossSpecies, assumptions.bossFastMoveId, selectedBossChargedMove, bossStartingEnergy]);

  const bossHp = useMemo(() => (bossSpecies ? bossEffectiveHp(bossSpecies, bossRaidTier) : null), [bossSpecies, bossRaidTier]);

  // There is no user-selectable "combat phase" here either — same standing
  // decision as ComparatorView. Boss HP depletion and the raid timer are read
  // entirely as post-processing over runTeamRaid's own per-slot simulation
  // output (see teamRaid.ts's top doc comment); nothing here reimplements
  // combat math.
  const result = useMemo(() => {
    if (!bossSpecies) return { data: null, error: null as string | null };
    try {
      const data = runTeamRaid({
        // Each slot's species stays RAW everywhere else in this component
        // (slotSpecies above, used for the panel's movepool/badge/boost
        // checks) — the Shadow toggle is applied ONLY here, at the boundary
        // into runTeamRaid, same convention as ComparatorView's
        // shadowAdjustedCandidates (see shadowToggle.ts's file doc comment).
        slots: assumptions.slots.map((s) => ({
          species: applyShadowToggle(resolveSpecies(s.speciesId), s.isShadow),
          fastMoveId: s.fastMoveId,
          chargedMoveId: s.chargedMoveId,
          isMega: s.isMega,
        })),
        boss: bossSpecies,
        bossRaidTier,
        bossFastMoveId: assumptions.bossFastMoveId,
        bossChargedMoveId: assumptions.bossChargedMoveId,
        level: assumptions.level,
        ivs,
        dodge: assumptions.dodge,
        dodgeFastAttacks: assumptions.dodgeFastAttacks,
        holdChargedMoveUntilSafe: assumptions.holdChargedMoveUntilSafe,
        bossChargedMoveMeanIntervalSeconds: assumptions.bossChargedMoveFrequencySeconds,
        bossStartingEnergy,
        weather: assumptions.weather,
        raidTimerSeconds: assumptions.raidTimerSeconds,
        swapCostSeconds: assumptions.swapCostSeconds,
        reviveCostSeconds: assumptions.reviveCostSeconds,
      });
      return { data, error: null as string | null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }, [
    assumptions.slots,
    bossSpecies,
    bossRaidTier,
    assumptions.bossFastMoveId,
    assumptions.bossChargedMoveId,
    assumptions.level,
    ivs,
    assumptions.dodge,
    assumptions.dodgeFastAttacks,
    assumptions.holdChargedMoveUntilSafe,
    assumptions.bossChargedMoveFrequencySeconds,
    bossStartingEnergy,
    assumptions.weather,
    assumptions.raidTimerSeconds,
    assumptions.swapCostSeconds,
    assumptions.reviveCostSeconds,
  ]);

  function handleShare() {
    // Stamps `view=team-raid` alongside the `ts` param so reloading this
    // link restores THIS tab, not whichever one App.tsx happened to default
    // to — see App.tsx's tab-switch scaffold.
    const url = new URL(buildTeamScenarioUrl(getBaseUrl(), assumptionsToTeamScenario(assumptions)));
    url.searchParams.set("view", "team-raid");
    window.history.replaceState(null, "", url.toString());
    setShareUrl(url.toString());
  }

  const rosterNames = slotSpecies.filter((s): s is SpeciesDefinition => s !== null).map((s) => speciesLabel(s));

  return (
    <>
      <p className="subtitle">
        {rosterNames.length > 0 ? rosterNames.join(" → ") : "Build a 6-slot team"} vs{" "}
        {bossSpecies ? speciesLabel(bossSpecies) : "a raid boss"} — one trainer's own sequential lineup against the
        boss's real HP pool and countdown timer, with wipe-and-revive looping.
      </p>

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
      />

      {result.error && (
        <section className="panel">
          <p style={{ color: "#ff6b6b" }}>Could not compute this raid: {result.error}</p>
        </section>
      )}

      {result.data && (
        <>
          <section className="panel">
            <h2>Raid result</h2>
            <p
              style={{
                fontSize: "1.05rem",
                fontWeight: 600,
                marginTop: 0,
                color: result.data.outcome === "cleared" ? "var(--good)" : "#ff6b6b",
              }}
            >
              {result.data.outcome === "cleared" ? "Cleared" : "Timer expired — raid failed"}
            </p>
            <div className="result-card">
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
          </section>

          <section className="panel">
            <h2>Cumulative team damage vs. boss HP over the raid timer</h2>
            <TeamDamageChart
              slots={result.data.slots}
              bossHp={bossHp ?? 0}
              raidTimerSeconds={assumptions.raidTimerSeconds}
              outcome={result.data.outcome}
              timeToClearSeconds={result.data.timeToClearSeconds}
            />
          </section>

          <section className="panel">
            <h2>Per-cycle/per-slot breakdown</h2>
            <TeamRaidBreakdownTable
              rows={result.data.slots}
              clearingCycleIndex={result.data.clearingCycleIndex}
              clearingSlotIndex={result.data.clearingSlotIndex}
            />
          </section>
        </>
      )}

      <section className="panel">
        <h2>Share this scenario</h2>
        <div className="share-row">
          <button onClick={handleShare}>Build link</button>
          {shareUrl && <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />}
        </div>
      </section>

      <section className="panel">
        <h2>Known caveats</h2>
        <p className="caveats">
          Solo-trainer scope only: the mega/primal team-wide damage boost never applies to the mega-bringer's own
          party in the real game (only to OTHER trainers simultaneously present in the same raid) — so bringing a
          mega into this roster only ever boosts that ONE slot's own damage while it's the active attacker, and
          there is no "other trainers in this raid" modeling here at all (a deliberately separate, out-of-scope
          axis — see the design doc's Section 7). V1 assumes unlimited healing items on a full wipe (a real resource
          constraint the game enforces via Bag items, not modeled here) and no cap on wipe-and-rejoin cycles other
          than a purely-engineering safety guard against a degenerate near-zero-damage roster looping indefinitely
          (MAX_TEAM_RAID_CYCLES). The boss's charged-move cooldown carries forward continuously across every slot
          handoff and every wipe-and-revive — it's one continuous encounter from the boss's own side; it doesn't
          reset just because the trainer swapped Pokémon or briefly returned to the lobby to heal.
          swapCostSeconds/reviveCostSeconds have no confirmed real value from any official or community source —
          both default to 0 (fastest-possible play) rather than a fabricated "realistic" number; a labeled ~13s
          community estimate is offered as an optional preset for reviveCostSeconds only. A boss badged
          "approximate" in the target picker is one the live raid feed named but whose exact form this data layer
          couldn't resolve, so a documented stand-in species' stats are used — treat those runs as directional.
          The other four tabs already spelled this out; this one didn't, which is the only reason it's stated here
          rather than being left to the badge alone.
        </p>
      </section>
    </>
  );
}
