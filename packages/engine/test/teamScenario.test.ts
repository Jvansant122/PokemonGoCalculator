import { describe, expect, it } from "vitest";
import {
  buildTeamScenarioUrl,
  decodeTeamScenario,
  encodeTeamScenario,
  parseTeamScenarioFromUrl,
  type TeamScenario,
} from "../src/teamScenario.js";

const sampleTeamScenario: TeamScenario = {
  slots: [
    { speciesId: "raichu-mega-x", fastMoveId: null, chargedMoveId: null, isMega: true, megaLevel: null },
    { speciesId: "fragile", fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null },
    { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null },
    { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null },
    { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null },
    { speciesId: null, fastMoveId: null, chargedMoveId: null, isMega: false, megaLevel: null },
  ],
  target: "kyogre-primal",
  bossFastMoveId: null,
  bossChargedMoveId: null,
  level: 35,
  ivs: { attack: 15, defense: 15, stamina: 15 },
  dodgeModel: { kind: "none" },
  dodgeFastAttacks: false,
  holdChargedMoveUntilSafe: false,
  weather: "none",
  bossChargedMoveFrequencySeconds: 15,
  bossStartsPrimed: false,
  bossStartingEnergyFraction: 0,
  raidTimerSeconds: 300,
  swapCostSeconds: 0,
  reviveCostSeconds: 0,
};

describe("team scenario serialization", () => {
  it("round-trips through encode/decode", () => {
    expect(decodeTeamScenario(encodeTeamScenario(sampleTeamScenario))).toEqual(sampleTeamScenario);
  });

  it("produces a URL-safe string with no padding characters", () => {
    const encoded = encodeTeamScenario(sampleTeamScenario);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("round-trips through a full shareable URL", () => {
    const url = buildTeamScenarioUrl("https://pogo-analyzer.example/team", sampleTeamScenario);
    expect(parseTeamScenarioFromUrl(url)).toEqual(sampleTeamScenario);
  });

  it("returns null when the URL carries no team scenario", () => {
    expect(parseTeamScenarioFromUrl("https://pogo-analyzer.example/team")).toBeNull();
  });

  it("round-trips a non-default reviveCostSeconds rather than silently reverting to 0", () => {
    // Regression guard: reviveCostSeconds is a new user-facing assumption
    // (Section 9 of proposal_sequential_team_raid_tab.md) — a shared link
    // that silently reverts a non-default value to the fastest-possible-play
    // default would misrepresent an intentionally slower/more-cautious
    // scenario as a faster one.
    const withRevive: TeamScenario = { ...sampleTeamScenario, reviveCostSeconds: 13 };
    expect(decodeTeamScenario(encodeTeamScenario(withRevive)).reviveCostSeconds).toBe(13);
    expect(
      parseTeamScenarioFromUrl(buildTeamScenarioUrl("https://pogo-analyzer.example/team", withRevive))!.reviveCostSeconds,
    ).toBe(13);
  });

  it("round-trips a non-default swapCostSeconds independently of reviveCostSeconds", () => {
    // These are two distinct assumptions (per-faint swap vs full-wipe
    // revive) that must not collapse into one shared value on the wire.
    const custom: TeamScenario = { ...sampleTeamScenario, swapCostSeconds: 2, reviveCostSeconds: 13 };
    const decoded = decodeTeamScenario(encodeTeamScenario(custom));
    expect(decoded.swapCostSeconds).toBe(2);
    expect(decoded.reviveCostSeconds).toBe(13);
  });

  it("round-trips the per-slot isMega flag and null (empty) slots", () => {
    const decoded = decodeTeamScenario(encodeTeamScenario(sampleTeamScenario));
    expect(decoded.slots[0]!.isMega).toBe(true);
    expect(decoded.slots[1]!.isMega).toBe(false);
    expect(decoded.slots[2]!.speciesId).toBeNull();
    expect(decoded.slots).toHaveLength(6);
  });

  it("round-trips a non-default per-slot megaLevel rather than silently reverting to no Mega Level assumed", () => {
    // Regression guard, same shape as the others above.
    const withMegaLevel: TeamScenario = {
      ...sampleTeamScenario,
      slots: [
        { ...sampleTeamScenario.slots[0]!, megaLevel: "super-max" },
        ...sampleTeamScenario.slots.slice(1),
      ],
    };
    const decoded = decodeTeamScenario(encodeTeamScenario(withMegaLevel));
    expect(decoded.slots[0]!.megaLevel).toBe("super-max");
    expect(decoded.slots[1]!.megaLevel).toBeNull();
    expect(
      parseTeamScenarioFromUrl(buildTeamScenarioUrl("https://pogo-analyzer.example/team", withMegaLevel))!.slots[0]!.megaLevel,
    ).toBe("super-max");
  });
});
