import { describe, expect, it } from "vitest";
import { canClearRoster, rosterClearConfirmMessage } from "./rosterClearConfirm.js";

describe("canClearRoster", () => {
  it("is false for an empty roster (matches the button's disabled gating)", () => {
    expect(canClearRoster(0)).toBe(false);
  });

  it("is true for any non-empty roster", () => {
    expect(canClearRoster(1)).toBe(true);
    expect(canClearRoster(164)).toBe(true);
  });
});

describe("rosterClearConfirmMessage", () => {
  it("states the exact count and names the save code as the recovery path", () => {
    const message = rosterClearConfirmMessage(164);
    expect(message).toContain("164");
    expect(message).toContain("entries");
    expect(message.toLowerCase()).toContain("save code");
    expect(message.toLowerCase()).toContain("this browser");
  });

  it("uses singular 'entry' for a roster of exactly one", () => {
    const message = rosterClearConfirmMessage(1);
    expect(message).toContain("1 entry?");
    expect(message).not.toContain("1 entries");
  });

  it("never ships the generic 'are you sure?' the task explicitly rejected", () => {
    expect(rosterClearConfirmMessage(5).toLowerCase()).not.toBe("are you sure?");
  });
});
