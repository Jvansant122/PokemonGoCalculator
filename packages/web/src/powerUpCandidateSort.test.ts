import { describe, expect, it } from "vitest";
import {
  compareCandidatesByEfficiency,
  efficiencyForRankBy,
  sortCandidatesByEfficiency,
  type RankableCandidateFields,
} from "./powerUpCandidateSort.js";

function field(overrides: Partial<RankableCandidateFields> = {}): RankableCandidateFields {
  return { delta: 0, isSignificant: true, costStardust: 1000, efficiency: 1, ...overrides };
}

describe("efficiencyForRankBy", () => {
  it("picks the stardust field for rankBy=stardust", () => {
    expect(efficiencyForRankBy("stardust", 0.5, 0.7, 0.9)).toBe(0.5);
  });

  it("picks the candy field for rankBy=candy", () => {
    expect(efficiencyForRankBy("candy", 0.5, 0.7, 0.9)).toBe(0.7);
  });

  it("picks the XL candy field for rankBy=xlCandy", () => {
    expect(efficiencyForRankBy("xlCandy", 0.5, 0.7, 0.9)).toBe(0.9);
  });

  it("passes through null when that resource's cost was 0", () => {
    expect(efficiencyForRankBy("candy", 0.5, null, 0.9)).toBeNull();
  });
});

describe("compareCandidatesByEfficiency", () => {
  it("ranks measurable gains above within-noise rows above measurable losses", () => {
    const gain = field({ delta: 1, isSignificant: true, efficiency: 0.1 });
    const noise = field({ delta: 0.001, isSignificant: false });
    const loss = field({ delta: -1, isSignificant: true, efficiency: -0.1 });
    const sorted = [noise, loss, gain].sort(compareCandidatesByEfficiency);
    expect(sorted).toEqual([gain, noise, loss]);
  });

  it("within measurable gains, sorts by efficiency descending", () => {
    const low = field({ delta: 1, isSignificant: true, efficiency: 0.05 });
    const high = field({ delta: 1, isSignificant: true, efficiency: 0.5 });
    const sorted = [low, high].sort(compareCandidatesByEfficiency);
    expect(sorted).toEqual([high, low]);
  });

  it("sinks a null efficiency to the bottom of the measurable-gains group rather than treating it as zero", () => {
    const withEfficiency = field({ delta: 1, isSignificant: true, efficiency: 0.01 });
    const nullEfficiency = field({ delta: 1, isSignificant: true, efficiency: null });
    const sorted = [nullEfficiency, withEfficiency].sort(compareCandidatesByEfficiency);
    expect(sorted).toEqual([withEfficiency, nullEfficiency]);
  });

  it("within within-noise rows, sorts by stardust cost ascending", () => {
    const cheap = field({ isSignificant: false, costStardust: 500 });
    const pricey = field({ isSignificant: false, costStardust: 9000 });
    const sorted = [pricey, cheap].sort(compareCandidatesByEfficiency);
    expect(sorted).toEqual([cheap, pricey]);
  });

  it("within measurable losses, sorts most-negative delta last", () => {
    const mild = field({ delta: -0.1, isSignificant: true });
    const severe = field({ delta: -5, isSignificant: true });
    const sorted = [mild, severe].sort(compareCandidatesByEfficiency);
    expect(sorted).toEqual([mild, severe]);
  });
});

describe("sortCandidatesByEfficiency", () => {
  it("does not mutate the input array", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const toRankable = (item: { id: string }): RankableCandidateFields =>
      item.id === "a" ? field({ delta: -1, isSignificant: true }) : field({ delta: 1, isSignificant: true, efficiency: 1 });
    const result = sortCandidatesByEfficiency(items, toRankable);
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(result.map((i) => i.id)).toEqual(["b", "a"]);
  });
});
