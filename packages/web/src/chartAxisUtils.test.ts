import { describe, expect, it } from "vitest";
import { formatTick, niceStep } from "./chartAxisUtils.js";

describe("niceStep", () => {
  it("returns 1 for a non-positive range", () => {
    expect(niceStep(0, 5)).toBe(1);
    expect(niceStep(-10, 5)).toBe(1);
  });

  it("picks a round 1/2/5 x power-of-10 step near range/targetTicks", () => {
    expect(niceStep(100, 5)).toBe(20);
    expect(niceStep(50, 5)).toBe(10);
    expect(niceStep(9, 5)).toBe(2);
  });
});

describe("formatTick", () => {
  it("formats sub-1000 integers as-is", () => {
    expect(formatTick(42)).toBe("42");
    expect(formatTick(0)).toBe("0");
  });

  it("formats sub-1000 non-integers to one decimal", () => {
    expect(formatTick(4.25)).toBe("4.3");
  });

  it("formats >=1000 values as a k-suffixed number", () => {
    expect(formatTick(1000)).toBe("1k");
    expect(formatTick(1500)).toBe("1.5k");
    expect(formatTick(-2000)).toBe("-2k");
  });
});
