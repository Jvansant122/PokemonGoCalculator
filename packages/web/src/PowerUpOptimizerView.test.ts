import { describe, expect, it } from "vitest";
import { budgetStopReasonSentence } from "./PowerUpOptimizerView.js";

describe("budgetStopReasonSentence", () => {
  // TS2366 (missing switch case) is the type-level guard; this locks in the
  // actual wording so a future edit can't silently regress it back into the
  // "every fielded slot has already reached level 50" mislabelling that
  // motivated this variant — see PowerUpBudgetStopReason's own doc comment
  // in packages/engine/src/powerUp.ts.
  it("no-eligible-entries: says the plan never ran and points at the excluded-entries table, not the max-level wording", () => {
    const sentence = budgetStopReasonSentence("no-eligible-entries", 1.5);
    expect(sentence).not.toMatch(/already reached level 50/);
    expect(sentence).toMatch(/excluded/i);
    expect(sentence).toMatch(/Excluded from this plan/);
    expect(sentence).toMatch(/candy/i);
  });

  it("max-level-reached: unchanged — still describes a genuinely-evaluated, fully-leveled roster", () => {
    expect(budgetStopReasonSentence("max-level-reached", 1.5)).toMatch(/already reached level 50/);
  });

  it("budget-exhausted / no-significant-candidate / round-cap-reached: still produce distinct, non-empty sentences", () => {
    const reasons = ["budget-exhausted", "no-significant-candidate", "round-cap-reached"] as const;
    const sentences = reasons.map((r) => budgetStopReasonSentence(r, 2.25));
    for (const s of sentences) expect(s.length).toBeGreaterThan(0);
    expect(new Set(sentences).size).toBe(sentences.length);
  });
});
