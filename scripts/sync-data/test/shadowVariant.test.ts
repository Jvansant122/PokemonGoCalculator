import { describe, expect, it } from "vitest";
import { shadowVariantIdFor, getOrCreateShadowVariant } from "../shadowVariant.ts";
import type { SpeciesDefinition } from "@pogo-analyzer/engine";

const abra: SpeciesDefinition = {
  id: "abra",
  name: "Abra",
  types: ["psychic"],
  baseAttack: 195,
  baseDefense: 82,
  baseStamina: 93,
  fastMoves: [],
  chargedMoves: [],
};

describe("shadowVariantIdFor", () => {
  it("appends -shadow to the base id", () => {
    expect(shadowVariantIdFor("abra")).toBe("abra-shadow");
  });
});

describe("getOrCreateShadowVariant", () => {
  it("copies base stats RAW/unmultiplied and sets isShadow", () => {
    const map = new Map<string, SpeciesDefinition>();
    const shadow = getOrCreateShadowVariant(abra, map);
    expect(shadow.id).toBe("abra-shadow");
    expect(shadow.name).toBe("Shadow Abra");
    expect(shadow.isShadow).toBe(true);
    expect(shadow.baseAttack).toBe(abra.baseAttack);
    expect(shadow.baseDefense).toBe(abra.baseDefense);
    expect(shadow.baseStamina).toBe(abra.baseStamina);
  });

  it("strips any boost field defensively even though a shadow base is never itself a mega/primal", () => {
    const megaLike: SpeciesDefinition = { ...abra, boost: { multiplier: 1.3, boostedType: "psychic" } };
    const map = new Map<string, SpeciesDefinition>();
    const shadow = getOrCreateShadowVariant(megaLike, map);
    expect(shadow.boost).toBeUndefined();
  });

  it("memoizes by base species id — a second call for the same base returns the SAME instance", () => {
    const map = new Map<string, SpeciesDefinition>();
    const first = getOrCreateShadowVariant(abra, map);
    const second = getOrCreateShadowVariant(abra, map);
    expect(second).toBe(first);
    expect(map.size).toBe(1);
  });
});
