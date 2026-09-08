/**
 * Standalone, READ-ONLY advisory check — NOT part of the sync-data pipeline.
 *
 * Compares this project's own real mega/primal roster (data/normalized/
 * species.json, filtered to entries with a `.boost` field set — see
 * SpeciesDefinition.boost in packages/engine/src/types.ts and how
 * scripts/sync-data.ts sets it) against Bulbapedia's own Pokémon-GO-specific
 * "Mega Evolution (GO)" article, which maintains a sortable table of every
 * Mega Evolution/Primal Reversion actually RELEASED in Pokémon GO with a
 * release date per entry:
 * https://bulbapedia.bulbagarden.net/wiki/Mega_Evolution_(GO)
 *
 * This is deliberately NOT Bulbapedia's general "which species have a Mega
 * Evolution in the mainline games" list/category — that would flag dozens of
 * real mainline Megas Niantic has simply never brought to GO at all (expected,
 * not a gap). Verified 2026-09-06 that this specific page is GO-specific and
 * current: it already lists Mega Charizard X/Y, Mega Steelix, Primal Kyogre/
 * Groudon, and Mega Skarmory (all already correctly in this project's data),
 * AND it lists Mega Raichu X/Y with a 2026-07-18 release date — the exact
 * species/date that fell through every other automated gate this pipeline had
 * (pogoapi.net's mega_pokemon.json hadn't added it, and it wasn't a currently-
 * active raid) and was only caught because a user asked about it directly.
 * This script exists to catch the *next* one automatically instead.
 *
 * The page's own table also lists real mainline Megas Niantic has announced
 * but not yet shipped as of the page's last edit (e.g. a future-dated
 * "Release date" cell, or a literal "TBA" display text with the real date
 * hidden in a wiki comment) and, separately, dozens of real mainline Megas
 * with NO GO release info at all — Bulbapedia's own editors keep those
 * entirely wrapped in HTML comments (`<!-- ... -->`) inside the same table
 * rather than mixing them into the visible, dated rows. This script strips
 * comments first (so those never get parsed as rows at all) and then filters
 * whatever visible rows remain to `releaseDate <= today` (so an announced-but-
 * not-yet-live future date, e.g. a "TBA" row whose sortable date is still in
 * the future, is correctly NOT treated as a released-content gap).
 *
 * Never writes to data/raw/ or data/normalized/ — reads data/normalized/
 * species.json, fetches Bulbapedia live, and only ever prints a report (plus
 * a small JSON summary written to $RUNNER_TEMP for the companion GitHub
 * Actions workflow to read). Never touches scripts/sync-data.ts or its
 * submodules.
 *
 * Run via: npx tsx scripts/check-mega-gaps.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SPECIES_PATH = join(REPO_ROOT, "data", "normalized", "species.json");

const BULBAPEDIA_SOURCE_URL = "https://bulbapedia.bulbagarden.net/wiki/Mega_Evolution_(GO)";
// action=raw returns the page's wikitext directly, which is far more stable
// to parse than rendered HTML (no template/CSS churn to fight) and exposes
// the sortable table's machine-readable `data-sort-value="YYYY-MM-DD"` dates
// even when the human-visible text says "TBA".
const BULBAPEDIA_RAW_URL = `${BULBAPEDIA_SOURCE_URL}?action=raw`;

const TABLE_SECTION_HEADING = "==List of Mega Evolutions and Primal Reversions==";
const NEXT_SECTION_HEADING = "==Updates==";

interface BulbapediaEntry {
  /** e.g. "Mega Charizard X", "Primal Kyogre" — same convention as SpeciesDefinition.name for these. */
  name: string;
  /** ISO YYYY-MM-DD, as given by the table's own sortable date attribute. */
  releaseDate: string;
}

interface NormalizedSpeciesLite {
  id: string;
  name: string;
  boost?: unknown;
}

interface GapReport {
  checkedAt: string;
  sourceUrl: string;
  status: "ok" | "error";
  error: string | null;
  releasedCount: number;
  ownRosterCount: number;
  gapCount: number;
  gaps: BulbapediaEntry[];
}

/** Strips MediaWiki `<!-- ... -->` comments (used on this page to hold unreleased mainline Megas out of the visible table entirely). */
function stripWikiComments(wikitext: string): string {
  return wikitext.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Parses the "List of Mega Evolutions and Primal Reversions" wikitable into
 * one entry per released row. Row blocks are split on `|-`; within a block:
 *  - A `Mega {{p|Base}}` / `Mega {{p|Base|Base X}}` / `Primal {{p|Base}}` line
 *    gives the species name (reconstructed as "Mega Base[ X]" / "Primal Base",
 *    matching SpeciesDefinition.name's own convention for these).
 *  - A `data-sort-value="YYYY-MM-DD"` line (digits-only date pattern — this
 *    exact shape never collides with the table's OTHER data-sort-value
 *    columns, which sort by type-name or a plain cost number) gives that row
 *    its own release date.
 *  - A literal `data-sort-value="YYYY-MM-DD"` placeholder (the un-substituted
 *    template text) means "no real date yet" — explicitly unreleased, and
 *    intentionally NOT carried forward to later rows.
 *  - A row with NEITHER a real date nor a placeholder is a genuine `rowspan`
 *    continuation of the immediately preceding row's date cell (e.g. Mega
 *    Charizard Y inheriting Mega Charizard X's date) — its release date is
 *    the last real date seen, whatever that currently is.
 */
function parseBulbapediaTable(wikitext: string): BulbapediaEntry[] {
  const cleaned = stripWikiComments(wikitext);
  const startIdx = cleaned.indexOf(TABLE_SECTION_HEADING);
  if (startIdx === -1) {
    throw new Error(`Could not find section heading "${TABLE_SECTION_HEADING}" in fetched page — page shape may have changed.`);
  }
  const endIdx = cleaned.indexOf(NEXT_SECTION_HEADING, startIdx);
  const tableSection = endIdx === -1 ? cleaned.slice(startIdx) : cleaned.slice(startIdx, endIdx);

  const rows = tableSection.split("|-");
  const entries: BulbapediaEntry[] = [];
  let lastDate: string | null = null;

  const nameLinePattern = /(Mega|Primal)\s*\{\{p\|([^|}]+?)(?:\|([^}]+))?\}\}/g;
  const realDatePattern = /data-sort-value="(\d{4}-\d{2}-\d{2})"/;
  const placeholderDatePattern = /data-sort-value="YYYY-MM-DD"/;

  for (const row of rows) {
    const namesInRow: BulbapediaEntry["name"][] = [];
    let match: RegExpExecArray | null;
    nameLinePattern.lastIndex = 0;
    while ((match = nameLinePattern.exec(row)) !== null) {
      const prefix = match[1] as "Mega" | "Primal";
      // match[2] is the regex's second capture group `([^|}]+?)`, a mandatory
      // (non-optional) group — it is always present whenever `match` itself
      // is non-null, so this is provably safe under noUncheckedIndexedAccess.
      const baseName = match[2]!.trim();
      const altText = match[3]?.trim();
      // altText looks like "Charizard X" / "Mewtwo Y" for the X/Y forms this
      // project models; anything else (e.g. Tatsugiri's "Curly Form" link
      // text with no X/Y) has no separately-modeled suffix here.
      const suffixMatch = altText?.match(/\s(X|Y)$/);
      const suffix = suffixMatch ? suffixMatch[1] : undefined;
      namesInRow.push(suffix ? `${prefix} ${baseName} ${suffix}` : `${prefix} ${baseName}`);
    }
    if (namesInRow.length === 0) continue;

    let releaseDate: string | null;
    const realDateMatch = row.match(realDatePattern);
    if (realDateMatch) {
      // realDateMatch[1] is realDatePattern's mandatory `(\d{4}-\d{2}-\d{2})`
      // capture group — always present whenever realDateMatch itself is
      // truthy, so the `?? null` fallback is unreachable in practice.
      releaseDate = realDateMatch[1] ?? null;
      lastDate = releaseDate;
    } else if (placeholderDatePattern.test(row)) {
      releaseDate = null;
      lastDate = null; // explicit "no date" — don't let a later rowspan continuation inherit a stale real date
    } else {
      releaseDate = lastDate; // genuine rowspan continuation of the previous row's date cell
    }

    if (releaseDate) {
      for (const name of namesInRow) entries.push({ name, releaseDate });
    }
  }

  return entries;
}

function loadOwnMegaPrimalRoster(): NormalizedSpeciesLite[] {
  const raw = readFileSync(SPECIES_PATH, "utf-8");
  const all = JSON.parse(raw) as NormalizedSpeciesLite[];
  return all.filter((s) => Boolean(s.boost));
}

async function main() {
  const checkedAt = new Date().toISOString();
  const today = checkedAt.slice(0, 10); // ISO date, safe lexicographic compare against YYYY-MM-DD

  let ownRoster: NormalizedSpeciesLite[];
  try {
    ownRoster = loadOwnMegaPrimalRoster();
  } catch (err) {
    const report: GapReport = {
      checkedAt,
      sourceUrl: BULBAPEDIA_SOURCE_URL,
      status: "error",
      error: `Could not read/parse ${SPECIES_PATH}: ${(err as Error).message}`,
      releasedCount: 0,
      ownRosterCount: 0,
      gapCount: 0,
      gaps: [],
    };
    finish(report);
    process.exitCode = 1;
    return;
  }

  let wikitext: string;
  try {
    const res = await fetch(BULBAPEDIA_RAW_URL, {
      headers: { "User-Agent": "pogo-analyzer-data-sync mega-gap-check (advisory, non-commercial)" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    wikitext = await res.text();
  } catch (err) {
    const report: GapReport = {
      checkedAt,
      sourceUrl: BULBAPEDIA_SOURCE_URL,
      status: "error",
      error: `Failed to fetch Bulbapedia source: ${(err as Error).message}`,
      releasedCount: 0,
      ownRosterCount: ownRoster.length,
      gapCount: 0,
      gaps: [],
    };
    finish(report);
    process.exitCode = 1;
    return;
  }

  let allEntries: BulbapediaEntry[];
  try {
    allEntries = parseBulbapediaTable(wikitext);
    if (allEntries.length === 0) {
      throw new Error("Parsed zero entries from the table — page shape likely changed.");
    }
  } catch (err) {
    const report: GapReport = {
      checkedAt,
      sourceUrl: BULBAPEDIA_SOURCE_URL,
      status: "error",
      error: `Failed to parse Bulbapedia table: ${(err as Error).message}`,
      releasedCount: 0,
      ownRosterCount: ownRoster.length,
      gapCount: 0,
      gaps: [],
    };
    finish(report);
    process.exitCode = 1;
    return;
  }

  // Only entries actually released as of today (excludes announced-but-future
  // dates, e.g. a "TBA" row whose real sortable date is still ahead of us).
  const releasedEntries = allEntries.filter((e) => e.releaseDate <= today);

  const ownNameSet = new Set(ownRoster.map((s) => s.name.toLowerCase()));
  const gaps = releasedEntries.filter((e) => !ownNameSet.has(e.name.toLowerCase()));
  // De-dupe (shouldn't happen given the table's own structure, but cheap insurance).
  const seen = new Set<string>();
  const dedupedGaps = gaps.filter((g) => {
    const key = g.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const report: GapReport = {
    checkedAt,
    sourceUrl: BULBAPEDIA_SOURCE_URL,
    status: "ok",
    error: null,
    releasedCount: releasedEntries.length,
    ownRosterCount: ownRoster.length,
    gapCount: dedupedGaps.length,
    gaps: dedupedGaps.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate)),
  };
  finish(report);
}

function finish(report: GapReport) {
  const summaryPath = join(process.env.RUNNER_TEMP ?? tmpdir(), "mega-gap-report.json");
  writeFileSync(summaryPath, JSON.stringify(report, null, 2));

  console.log(`Bulbapedia mega/primal gap check — ${report.checkedAt}`);
  console.log(`Source: ${report.sourceUrl}`);
  console.log(`Summary written to: ${summaryPath}`);
  console.log("");

  if (report.status === "error") {
    console.log("STATUS: ERROR");
    console.log(`ERROR: ${report.error}`);
    console.log("");
    console.log("This is a broken/uninformative check, NOT a confirmed all-clear. Needs human investigation of the source page/parser.");
    return;
  }

  console.log(`Bulbapedia-listed releases as of today: ${report.releasedCount}`);
  console.log(`This project's own modeled mega/primal roster (.boost set): ${report.ownRosterCount}`);
  console.log("");

  if (report.gapCount === 0) {
    console.log("STATUS: NO GAP FOUND");
    console.log("Every Bulbapedia-listed released Mega/Primal has a matching entry in this project's data.");
  } else {
    console.log("STATUS: GAP FOUND");
    console.log(`GAP COUNT: ${report.gapCount}`);
    console.log("The following Bulbapedia-listed RELEASED Mega/Primal forms have NO entry in this project's data at all:");
    for (const gap of report.gaps) {
      console.log(`  - ${gap.name} (released ${gap.releaseDate})`);
    }
    console.log("");
    console.log("This is advisory only — nothing has been changed. A human should decide whether/how to add these (data-sync's sync-data.ts pipeline, same pattern as the existing GAME_MASTER-fallback/allowlist mega-gap handling).");
  }
}

await main();
