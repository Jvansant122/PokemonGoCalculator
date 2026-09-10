import { describe, expect, it } from "vitest";
import { typeEffectiveness } from "@pogo-analyzer/engine";
import { classifyEffectiveness, effectivenessAgainstEach } from "./moveEffectiveness.js";

describe("classifyEffectiveness", () => {
  it("classifies a double super-effective dual-type matchup distinctly from a single one", () => {
    expect(classifyEffectiveness(typeEffectiveness("fire", ["grass", "ice"])).tone).toBe("double-super");
    expect(classifyEffectiveness(typeEffectiveness("fire", ["grass"])).tone).toBe("super");
  });

  it("labels double-super and super with different text, not one undifferentiated 'super effective'", () => {
    const doubleSuper = classifyEffectiveness(typeEffectiveness("water", ["fire", "ground"]));
    const single = classifyEffectiveness(typeEffectiveness("water", ["fire"]));
    expect(doubleSuper.label).not.toBe(single.label);
    expect(doubleSuper.multiplierLabel).toBe("2.56x");
    expect(single.multiplierLabel).toBe("1.6x");
  });

  it("classifies exact neutral (1x) as neutral", () => {
    const tier = classifyEffectiveness(typeEffectiveness("normal", ["normal"]));
    expect(tier.tone).toBe("neutral");
    expect(tier.multiplierLabel).toBe("1x");
  });

  it("classifies a resist-then-weak dual matchup that numerically cancels to ~1x as neutral, not as a false resist/weakness", () => {
    // Super effective against one of the pair, not very effective against
    // the other, multiplies back out to (within float noise) exactly 1.
    const tier = classifyEffectiveness(typeEffectiveness("fighting", ["normal", "flying"]));
    expect(tier.tone).toBe("neutral");
  });

  it("distinguishes single-resist from double-resist from the immunity-adjacent tiers, all reading as increasingly bad", () => {
    const singleResist = classifyEffectiveness(typeEffectiveness("fire", ["fire"]));
    // A single NO_EFFECT-type match is itself a "double resist" packed into
    // one type slot (NOT_VERY_EFFECTIVE squared, see classifyEffectiveness's
    // own comment) — electric -> ground.
    const doubleResistViaNoEffect = classifyEffectiveness(typeEffectiveness("electric", ["ground"]));
    // Fighting -> Ghost is a NO_EFFECT match on its own; stacked against a
    // real Ghost/Flying dual type (Fighting -> Flying is a separate,
    // ordinary resist), the two multiply down past that.
    const tripleDown = classifyEffectiveness(typeEffectiveness("fighting", ["ghost", "flying"]));

    expect(singleResist.tone).toBe("resisted");
    expect(doubleResistViaNoEffect.tone).toBe("very-resisted");
    expect(tripleDown.tone).toBe("extreme");

    // Every value below is strictly worse (lower multiplier) than the last.
    expect(singleResist.multiplier).toBeGreaterThan(doubleResistViaNoEffect.multiplier);
    expect(doubleResistViaNoEffect.multiplier).toBeGreaterThan(tripleDown.multiplier);
  });

  it("formats the immunity-adjacent example values from the product spec distinctly", () => {
    // electric -> ground is a single NO_EFFECT match, ~0.39x.
    expect(classifyEffectiveness(typeEffectiveness("electric", ["ground"])).multiplierLabel).toBe("0.391x");
    // fighting -> ghost+flying stacks a second resist past that, ~0.244x —
    // matches the exact example value called out in the product ask.
    expect(classifyEffectiveness(typeEffectiveness("fighting", ["ghost", "flying"])).multiplierLabel).toBe("0.244x");
  });

  it("never returns a negative or zero multiplier label for any real chart value (sanity bound)", () => {
    const tier = classifyEffectiveness(0.0001);
    expect(tier.tone).toBe("extreme");
    expect(tier.multiplier).toBeGreaterThan(0);
  });
});

describe("effectivenessAgainstEach", () => {
  it("returns one classified entry per opponent, in the same order, carrying that opponent's own label", () => {
    const results = effectivenessAgainstEach("water", [
      { label: "A", types: ["fire"] },
      { label: "B", types: ["grass"] },
    ]);
    expect(results.map((r) => r.opponentLabel)).toEqual(["A", "B"]);
    expect(results[0]?.tier.tone).toBe("super"); // water vs fire
    expect(results[1]?.tier.tone).toBe("resisted"); // water vs grass
  });

  it("returns an empty array for no opponents, so a no-meaningful-target call site renders nothing", () => {
    expect(effectivenessAgainstEach("water", [])).toEqual([]);
  });

  it("handles a single opponent the same way as N opponents (caller decides whether to show the label)", () => {
    const [result] = effectivenessAgainstEach("electric", [{ label: "Boss", types: ["water"] }]);
    expect(result?.tier.tone).toBe("super");
    expect(result?.opponentLabel).toBe("Boss");
  });
});
