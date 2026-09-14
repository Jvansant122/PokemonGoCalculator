import { describe, expect, it } from "vitest";
import { budgetStopReasonSentence, noAffordableImprovementSentence } from "./powerUpOptimizerSentences.js";

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

describe("noAffordableImprovementSentence", () => {
  // Locks in the priority bug from the skeptic pass (2026-09-12): a
  // fast-attack-dodge lockout zeroes every simulated delta, and the ORIGINAL
  // "may already be past its useful power-up headroom" sentence read as a
  // confident, false conclusion about the roster rather than naming the
  // actual (config-level) cause — see dodgeFastAttackLockout.ts.
  it("without an active lockout: unchanged 'past its useful power-up headroom' wording", () => {
    const sentence = noAffordableImprovementSentence(1.5, false, null);
    expect(sentence).toMatch(/past its useful power-up headroom/);
    expect(sentence).toMatch(/±1\.50/);
  });

  it("with an active lockout: REPLACES the headroom conclusion with the lockout note, never claims headroom", () => {
    const note = "Dodge lockout active: Bite recycles every 0.5s, too fast to fast-dodge — this result reflects zero fast-move damage for the rest of the fight, not a bad matchup.";
    const sentence = noAffordableImprovementSentence(0, true, note);
    expect(sentence).toContain(note);
    expect(sentence).not.toMatch(/past its useful power-up headroom/);
    expect(sentence).toMatch(/says nothing about whether this roster still has real power-up headroom/);
  });

  it("active flag but a null note (boss fast move not yet resolved) falls back to the ordinary sentence rather than rendering an empty explanation", () => {
    const sentence = noAffordableImprovementSentence(2, true, null);
    expect(sentence).toMatch(/past its useful power-up headroom/);
  });
});
