import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { RELEASED_MEGA_PRIMAL_ALLOWLIST } from "../releasedMegaPrimalAllowlist.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = join(__dirname, "..", "releasedMegaPrimalAllowlist.ts");

const VALID_RAID_TIERS = new Set([
  "1-Star Raids",
  "3-Star Raids",
  "Mega Raids",
  "5-Star Raids",
  "Legendary Mega Raids",
  "Super Mega Raids",
  "Primal Raids",
]);

describe("RELEASED_MEGA_PRIMAL_ALLOWLIST", () => {
  it("is non-empty", () => {
    expect(RELEASED_MEGA_PRIMAL_ALLOWLIST.length).toBeGreaterThan(0);
  });

  it("has no duplicate names (case-insensitive)", () => {
    const names = RELEASED_MEGA_PRIMAL_ALLOWLIST.map((e) => e.name.toLowerCase());
    const distinct = new Set(names);
    expect(distinct.size).toBe(names.length);
  });

  it("every entry's name starts with 'Mega ' or 'Primal ' (well-formed, matches parseMegaOrPrimalRaidName's expectations)", () => {
    for (const entry of RELEASED_MEGA_PRIMAL_ALLOWLIST) {
      expect(entry.name).toMatch(/^(Mega|Primal) .+/);
    }
  });

  it("every entry's name has no leading/trailing whitespace", () => {
    for (const entry of RELEASED_MEGA_PRIMAL_ALLOWLIST) {
      expect(entry.name).toBe(entry.name.trim());
    }
  });

  it("every entry with a lastKnownRaidTier uses a real, recognized RaidTier value", () => {
    for (const entry of RELEASED_MEGA_PRIMAL_ALLOWLIST) {
      if (entry.lastKnownRaidTier !== undefined) {
        expect(VALID_RAID_TIERS.has(entry.lastKnownRaidTier)).toBe(true);
      }
    }
  });

  it("every entry carries its own citation in a comment directly above it in the source file", () => {
    // Cheap textual proxy for "every entry is cited": each entry's name string
    // literal must appear in the source at a point preceded (within a small
    // window) by prose containing a citation marker (a URL, "confirmed", or
    // a named source like Bulbapedia/Serebii/pokemongohub/leekduck). This
    // doesn't verify the citation is GOOD, only that one was written.
    const source = readFileSync(SOURCE_PATH, "utf-8");
    const citationMarkerRe = /(https?:\/\/|confirmed|Bulbapedia|Serebii|pokemongohub|leekduck|Pokebattler|GAME_MASTER|raids\.json)/i;
    for (const entry of RELEASED_MEGA_PRIMAL_ALLOWLIST) {
      const nameIndex = source.indexOf(`name: "${entry.name}"`);
      expect(nameIndex, `entry literal for "${entry.name}" not found verbatim in source`).toBeGreaterThan(-1);
      // Look backward up to 3000 chars (comfortably covers a multi-paragraph
      // comment block) for a citation marker preceding this entry.
      const precedingText = source.slice(Math.max(0, nameIndex - 3000), nameIndex);
      expect(citationMarkerRe.test(precedingText), `no citation marker found before entry "${entry.name}"`).toBe(true);
    }
  });
});
