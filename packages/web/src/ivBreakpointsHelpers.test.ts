import { describe, expect, it } from "vitest";
import {
  LEVELS_35_TO_50,
  RAID_TIER_NUMERIC,
  TIER_4_PLUS_LABELS,
  ivLabel,
  tallyIvSpreadWins,
} from "./ivBreakpointsHelpers.js";
import type { IvComparisonRow } from "@pogo-analyzer/engine";

describe("ivLabel", () => {
  it("formats an IV spread as attack/defense/stamina", () => {
    expect(ivLabel({ attack: 14, defense: 15, stamina: 13 })).toBe("14/15/13");
  });
});

describe("LEVELS_35_TO_50", () => {
  it("covers levels 35 through 50 inclusive in 0.5 steps (31 total)", () => {
    expect(LEVELS_35_TO_50.length).toBe(31);
    expect(LEVELS_35_TO_50[0]).toBe(35);
    expect(LEVELS_35_TO_50[LEVELS_35_TO_50.length - 1]).toBe(50);
    expect(LEVELS_35_TO_50[1]).toBe(35.5);
  });
});

describe("RAID_TIER_NUMERIC / TIER_4_PLUS_LABELS", () => {
  it("excludes only the two lowest tiers from tier4Plus", () => {
    expect(TIER_4_PLUS_LABELS.has("1-Star Raids")).toBe(false);
    expect(TIER_4_PLUS_LABELS.has("3-Star Raids")).toBe(false);
    expect(TIER_4_PLUS_LABELS.has("Mega Raids")).toBe(true);
    expect(TIER_4_PLUS_LABELS.has("5-Star Raids")).toBe(true);
    expect(TIER_4_PLUS_LABELS.has("Legendary Mega Raids")).toBe(true);
    expect(TIER_4_PLUS_LABELS.has("Primal Raids")).toBe(true);
    expect(TIER_4_PLUS_LABELS.has("Super Mega Raids")).toBe(true);
  });

  it("derives TIER_4_PLUS_LABELS purely from the numeric map (no separate hand-list to drift)", () => {
    for (const tier of TIER_4_PLUS_LABELS) {
      expect(RAID_TIER_NUMERIC[tier]).toBeGreaterThanOrEqual(4);
    }
  });
});

function row(a: { fast: number; charged: number; ttf: number | null }, b: { fast: number; charged: number; ttf: number | null }): IvComparisonRow {
  return {
    level: 40,
    ivA: { fastMoveDamage: a.fast, chargedMoveDamage: a.charged, timeToFaintSeconds: a.ttf },
    ivB: { fastMoveDamage: b.fast, chargedMoveDamage: b.charged, timeToFaintSeconds: b.ttf },
    fastMoveDamageDiffers: a.fast !== b.fast,
    chargedMoveDamageDiffers: a.charged !== b.charged,
    timeToFaintDiffers: a.ttf !== b.ttf,
  } as unknown as IvComparisonRow;
}

describe("tallyIvSpreadWins", () => {
  it("tallies one win per (metric, level) instance where a spread is strictly higher", () => {
    const rows: IvComparisonRow[] = [
      // A wins fast+charged, B wins time-to-faint (ttf higher is better)
      row({ fast: 10, charged: 20, ttf: 30 }, { fast: 8, charged: 15, ttf: 45 }),
    ];
    const { winsA, winsB } = tallyIvSpreadWins(rows);
    expect(winsA).toBe(2);
    expect(winsB).toBe(1);
  });

  it("treats null (outlasted the scan window) as beating any finite time-to-faint", () => {
    const rows: IvComparisonRow[] = [row({ fast: 10, charged: 10, ttf: null }, { fast: 10, charged: 10, ttf: 59 })];
    const { winsA, winsB } = tallyIvSpreadWins(rows);
    expect(winsA).toBe(1);
    expect(winsB).toBe(0);
  });

  it("counts neither spread on an exact tie", () => {
    const rows: IvComparisonRow[] = [row({ fast: 10, charged: 10, ttf: 30 }, { fast: 10, charged: 10, ttf: 30 })];
    const { winsA, winsB } = tallyIvSpreadWins(rows);
    expect(winsA).toBe(0);
    expect(winsB).toBe(0);
  });
});
