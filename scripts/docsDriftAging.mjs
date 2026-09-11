/**
 * The pure half of check-docs-drift's "aging negative claim" section, split out so it can be
 * unit-tested without importing the checker (which runs its whole suite at import time and can
 * call process.exit).
 *
 * Why this check exists: on 2026-09-11 one session hit three separate stale claims of the shape
 * "X does not yet exist" — two in CLAUDE.md (scripts/run-scenario.ts's roster case, and
 * check-scenario-roundtrip's Roster row, both of which HAD been built) and one in HANDOFF.md
 * (a dodge-lockout engine feature that had never existed at all). Each was true when written and
 * silently became false. The CLAUDE.md pair nearly cost two subagent spawns to rebuild work that
 * already existed.
 *
 * A NEGATIVE claim is the shape that ages worst: it is falsified by someone doing the work, and
 * whoever does the work has no reason to grep the docs for prose describing its absence. This
 * cannot know whether a claim is still true — only that nobody has re-affirmed it in a while.
 *
 * ⚠️ Calibration note: this repo moves fast enough that all three claims above went stale within
 * about a day, which is far below any workable age threshold. So treat this as a BACKSTOP that
 * catches the long tail, never as the primary defence — the primary defence is checking a doc's
 * claim against the code before acting on it.
 */

/** Lines matching this shape are claims about something NOT existing. */
export const STALE_SHAPE = /\bnot yet\b|\bdoes not exist\b|\bdoesn't exist\b/i;

/** Opt out for prose that discusses the concept rather than asserting a fact about this codebase. */
export const SUPPRESS_MARKER = "<!-- drift-ok -->";

/**
 * The live claim surface of a doc. HANDOFF.md's older sections are a historical record of what
 * was true in a past session — flagging them is pure noise — so only its newest `## ` section
 * counts. CLAUDE.md is durable claims throughout, so all of it counts.
 */
export function liveLineRange(text, onlyNewestSection) {
  const lines = text.split("\n");
  if (!onlyNewestSection) return { start: 0, end: lines.length };
  const headings = [];
  lines.forEach((l, i) => {
    if (/^## /.test(l)) headings.push(i);
  });
  if (headings.length === 0) return { start: 0, end: lines.length };
  return { start: headings[0], end: headings.length > 1 ? headings[1] : lines.length };
}

/**
 * @param text      the doc's full contents
 * @param dates     per-line commit timestamps in ms, 1:1 with text's lines (from `git blame`)
 * @param opts      { onlyNewestSection, maxAgeDays, now }
 * @returns         [{ lineNo (1-indexed), ageDays, text }]
 */
export function findAgingClaims(text, dates, { onlyNewestSection = false, maxAgeDays = 14, now = Date.now() } = {}) {
  const lines = text.split("\n");
  const { start, end } = liveLineRange(text, onlyNewestSection);
  const found = [];
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (!STALE_SHAPE.test(line)) continue;
    if (line.includes(SUPPRESS_MARKER)) continue;
    const ts = dates[i];
    // An UNCOMMITTED working-tree line blames to the all-zero sha with a bogus time; skipping a
    // missing/zero timestamp keeps a line someone is editing right now from being reported.
    if (!ts) continue;
    const ageDays = Math.floor((now - ts) / 86400000);
    if (ageDays > maxAgeDays) found.push({ lineNo: i + 1, ageDays, text: line.trim() });
  }
  return found.sort((a, b) => b.ageDays - a.ageDays);
}
