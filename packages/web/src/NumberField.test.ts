import { describe, expect, it } from "vitest";
import { resolveNumberFieldBlurValue } from "./NumberField.js";

describe("resolveNumberFieldBlurValue", () => {
  it("clamps an out-of-range value up to max (the level-357 case)", () => {
    expect(resolveNumberFieldBlurValue("357", { min: 1, max: 50 })).toBe(50);
  });

  it("clamps an out-of-range value down to min", () => {
    expect(resolveNumberFieldBlurValue("0", { min: 1, max: 50 })).toBe(1);
    expect(resolveNumberFieldBlurValue("-5", { min: 0 })).toBe(0);
  });

  it("leaves an in-range value untouched", () => {
    expect(resolveNumberFieldBlurValue("25", { min: 1, max: 50 })).toBe(25);
  });

  it("does not invent a ceiling when max is undefined (candy/stardust case)", () => {
    expect(resolveNumberFieldBlurValue("10050", { min: 0 })).toBe(10050);
  });

  it("returns null for unparseable text instead of guessing a value", () => {
    expect(resolveNumberFieldBlurValue("-", {})).toBeNull();
    expect(resolveNumberFieldBlurValue("1e", {})).toBeNull();
  });

  it("treats a bare empty string as 0 when allowEmpty is not set (matches prior Number('') behavior)", () => {
    expect(resolveNumberFieldBlurValue("", { min: 0, max: 50 })).toBe(0);
  });

  it("returns undefined for an empty string when allowEmpty is set", () => {
    expect(resolveNumberFieldBlurValue("", { allowEmpty: true })).toBeUndefined();
    expect(resolveNumberFieldBlurValue("   ", { allowEmpty: true })).toBeUndefined();
  });

  it("still parses a real number when allowEmpty is set", () => {
    expect(resolveNumberFieldBlurValue("12", { allowEmpty: true, min: 0 })).toBe(12);
  });

  it("clamps a fraction field's out-of-range percentage-typed-as-fraction input", () => {
    // e.g. the dodge missedFraction field is 0-1; someone typing "5" meaning
    // "50%" should land on the field's own max, not silently overshoot it.
    expect(resolveNumberFieldBlurValue("5", { min: 0, max: 1 })).toBe(1);
  });
});
