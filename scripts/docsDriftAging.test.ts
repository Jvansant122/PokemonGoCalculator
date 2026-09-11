import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain JS module (the checker runs under `node`, not tsx); typecheck:scripts
// has no allowJs, so importing it from a .test.ts has no ambient types. Exercised at runtime.
import { findAgingClaims, liveLineRange, STALE_SHAPE } from "./docsDriftAging.mjs";

const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 11);
/** Per-line blame timestamps: every line `ageDays` old. */
const aged = (lineCount: number, ageDays: number) => Array.from({ length: lineCount }, () => NOW - ageDays * DAY);

describe("STALE_SHAPE", () => {
  it("matches the negative-claim shapes that age worst", () => {
    for (const s of ["does not yet have a roster case", "It does not yet exist", "doesn't exist yet", "Not Yet built"]) {
      expect(STALE_SHAPE.test(s)).toBe(true);
    }
  });

  it("does not match ordinary prose", () => {
    for (const s of ["the sweep runs every combination", "shipped 2026-09-10", "yet another tab"]) {
      expect(STALE_SHAPE.test(s)).toBe(false);
    }
  });
});

describe("liveLineRange", () => {
  const doc = ["# Title", "", "## Newest", "not yet built", "", "## Older", "not yet wired"].join("\n");

  it("limits HANDOFF-style docs to the newest ## section, so historical records aren't flagged", () => {
    // Older sections record what was true in a PAST session — they are not live claims.
    expect(liveLineRange(doc, true)).toEqual({ start: 2, end: 5 });
  });

  it("covers the whole file for CLAUDE-style docs, which are durable claims throughout", () => {
    expect(liveLineRange(doc, false)).toEqual({ start: 0, end: 7 });
  });
});

describe("findAgingClaims", () => {
  it("flags a negative claim older than the threshold, reporting a 1-indexed line number", () => {
    const text = ["intro", "run-scenario.ts does not yet have a roster case"].join("\n");
    const found = findAgingClaims(text, aged(2, 30), { maxAgeDays: 14, now: NOW });
    expect(found).toHaveLength(1);
    expect(found[0].lineNo).toBe(2);
    expect(found[0].ageDays).toBe(30);
  });

  it("leaves a recently re-affirmed claim alone — committing the line re-dates it", () => {
    const text = "run-scenario.ts does not yet have a roster case";
    expect(findAgingClaims(text, aged(1, 3), { maxAgeDays: 14, now: NOW })).toEqual([]);
  });

  it("honours the drift-ok marker, for prose that discusses the concept rather than asserting it", () => {
    const text = '*blocked* is "not yet" and evidence rescues it <!-- drift-ok -->';
    expect(findAgingClaims(text, aged(1, 90), { maxAgeDays: 14, now: NOW })).toEqual([]);
  });

  it("ignores an uncommitted line, which git blame gives a bogus zero timestamp", () => {
    // Otherwise a line someone is editing right now reports as ~57 years stale.
    expect(findAgingClaims("not yet built", [0], { maxAgeDays: 14, now: NOW })).toEqual([]);
  });

  it("skips a stale claim in an older section when scoped to the newest one", () => {
    const text = ["## Newest", "all good here", "## Older", "this does not yet exist"].join("\n");
    expect(findAgingClaims(text, aged(4, 90), { onlyNewestSection: true, maxAgeDays: 14, now: NOW })).toEqual([]);
    // ...but still finds it when the whole file is the live surface.
    expect(findAgingClaims(text, aged(4, 90), { onlyNewestSection: false, maxAgeDays: 14, now: NOW })).toHaveLength(1);
  });

  it("sorts oldest first, so the least-trustworthy claim is read first", () => {
    const text = ["not yet A", "not yet B", "not yet C"].join("\n");
    const dates = [NOW - 20 * DAY, NOW - 90 * DAY, NOW - 40 * DAY];
    expect(findAgingClaims(text, dates, { maxAgeDays: 14, now: NOW }).map((f: { ageDays: number }) => f.ageDays)).toEqual([90, 40, 20]);
  });
});
