/**
 * Pure Poke Genie "Pokémon list" CSV export parser — no DOM, no I/O.
 * Phase 1 of PLAN_multi_raid_roster_optimizer.md (§4.2). This module ONLY
 * turns raw CSV text into header-keyed string rows; interpreting those
 * strings (species matching, IV/level/move derivation) is deliberately
 * `pokeGenieMatch.ts`'s job, not this one's — keeps each module
 * independently testable and keeps this one honest about doing no
 * "interpretation," per the plan's own instruction.
 *
 * Header-name indexed, never positional: Poke Genie's exact column set
 * varies by app version (extra PvP-rank columns, a renamed field, etc.), so
 * every row is returned as a `Record<string, string>` keyed by the file's
 * OWN header row, not a fixed column order.
 */

export interface PokeGenieRow {
  /**
   * 1-based line number this row's record STARTED on in the source text
   * (the header row is line 1) — used only for user-facing diagnostics
   * (skipped-row reports, unmatched-species reports downstream in
   * pokeGenieMatch.ts), never for ordering.
   */
  lineNumber: number;
  /**
   * Every column this row actually had, keyed by the exact header text from
   * the file's own header row — see KNOWN_HEADERS below for which of these
   * this project's code actually interprets today.
   */
  values: Record<string, string>;
}

export interface PokeGenieSkippedRow {
  lineNumber: number;
  reason: string;
}

export interface PokeGenieParseResult {
  rows: PokeGenieRow[];
  skipped: PokeGenieSkippedRow[];
  /**
   * Header columns present in the file that this project doesn't recognize
   * AT ALL — the real schema-drift signal (a future Poke Genie app version
   * adding or renaming a column). Informational only, never blocks a parse.
   * Expected to be EMPTY for a healthy export; a non-empty value is worth
   * surfacing to the user.
   */
  unknownColumns: string[];
  /**
   * Header columns this project recognizes and deliberately does not read —
   * chiefly Poke Genie's 24-column PvP-rank block (see
   * RECOGNIZED_UNUSED_HEADERS). Always non-empty for a real export, so this
   * is normal, not a warning: keep it out of any summary that a user reads
   * as a problem list.
   */
  ignoredColumns: string[];
}

/**
 * Thrown only when the file as a WHOLE doesn't look like a Poke Genie
 * export (empty file, or missing a required header) — never for a single
 * bad row, which goes to `skipped` instead so one malformed line never
 * blocks the other 163.
 */
export class PokeGenieFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PokeGenieFormatError";
  }
}

/**
 * The minimum header set that identifies a real Poke Genie export — chosen
 * from the columns this project actually reads downstream (see
 * pokeGenieMatch.ts), not the full ~48-column schema, so a slightly
 * different Poke Genie app version (extra/missing PvP-rank columns, say)
 * still validates as long as the columns this tool actually needs exist.
 */
const REQUIRED_HEADERS = [
  "Name",
  "Form",
  "Pokemon",
  "Atk IV",
  "Def IV",
  "Sta IV",
  "IV Avg",
  "Level Min",
  "Level Max",
  "Quick Move",
  "Charge Move",
  "Shadow/Purified",
  "Lucky",
] as const;

/**
 * Poke Genie's PvP-rank block: for each of the three leagues — (G)reat,
 * (U)ltra, (L)ittle — the export repeats eight columns describing the best
 * PvP rank that Pokémon could reach. Recognized, deliberately UNUSED.
 *
 * These are not "unknown columns," and reporting them as such was actively
 * misleading: a completely healthy 164-row export produces 25 of them, so
 * the import summary opened with a wall of column names that read as a
 * failure when nothing had failed. Worse, it buried the numbers that DO
 * matter (unmatched and skipped rows, both 0). Kept separate from
 * `unknownColumns` so the latter retains its one real job — surfacing
 * genuine schema drift in a future Poke Genie version.
 *
 * Note in particular that `Candy Cost (G|U|L)` is NOT candy on hand — it is
 * the candy needed to reach that league's rank, a completely different
 * number. See the plan's §3.4: this export carries no candy-on-hand column
 * at all, and reading these as one would fabricate a budget.
 */
const PVP_RANK_COLUMN_BASES = [
  "Rank %",
  "Rank #",
  "Stat Product",
  "Dust Cost",
  "Candy Cost",
  "Name",
  "Form",
  "Sha/Pur",
] as const;

const RECOGNIZED_UNUSED_HEADERS = new Set<string>([
  ...PVP_RANK_COLUMN_BASES.flatMap((base) => ["G", "U", "L"].map((league) => `${base} (${league})`)),
  "Marked for PvP use",
]);

/**
 * Every header column pokeGenieCsv.ts/pokeGenieMatch.ts actually reads or
 * passes through today — anything in the real header row that is in neither
 * this set nor RECOGNIZED_UNUSED_HEADERS is reported via `unknownColumns` so
 * a schema drift in a future Poke Genie version surfaces as a visible note
 * instead of silently reading nothing.
 */
const KNOWN_HEADERS = new Set<string>([
  "Index",
  "Name",
  "Form",
  "Pokemon",
  "Gender",
  "CP",
  "HP",
  "Atk IV",
  "Def IV",
  "Sta IV",
  "IV Avg",
  "Level Min",
  "Level Max",
  "Quick Move",
  "Charge Move",
  "Charge Move 2",
  "Scan Date",
  "Catch Date",
  "Weight",
  "Height",
  "Lucky",
  "Shadow/Purified",
  "Favorite",
  "Dust",
]);

interface RawRecord {
  lineNumber: number;
  fields: string[];
}

/**
 * RFC-4180 record splitter: handles quoted fields containing commas and
 * embedded newlines, `""` as an escaped literal quote inside a quoted
 * field, and both CRLF/LF line endings. Tracks each record's STARTING line
 * number (1-based) for diagnostics, counting every literal `\n` consumed —
 * including ones inside a quoted field — so line numbers stay accurate even
 * when a field embeds a real newline.
 */
function splitCsvRecords(text: string): RawRecord[] {
  const records: RawRecord[] = [];
  const len = text.length;
  let i = 0;
  let line = 1;

  while (i < len) {
    const recordStartLine = line;
    const fields: string[] = [];
    let field = "";
    let inQuotes = false;

    recordLoop: while (i < len) {
      const ch = text[i]!;
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        if (ch === "\n") {
          field += "\n";
          line += 1;
          i += 1;
          continue;
        }
        if (ch === "\r") {
          // Part of an embedded CRLF inside a quoted field — the following
          // \n (if any) does the line counting; drop the bare \r itself.
          i += 1;
          continue;
        }
        field += ch;
        i += 1;
        continue;
      }

      // Not inside quotes.
      if (ch === '"' && field === "") {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === ",") {
        fields.push(field);
        field = "";
        i += 1;
        continue;
      }
      if (ch === "\r") {
        i += 1;
        continue;
      }
      if (ch === "\n") {
        i += 1;
        line += 1;
        break recordLoop;
      }
      field += ch;
      i += 1;
    }

    fields.push(field);
    records.push({ lineNumber: recordStartLine, fields });
  }

  return records;
}

/**
 * Parses raw Poke Genie CSV export text into header-indexed rows. Never
 * throws on a single malformed row — a column-count mismatch or a genuinely
 * blank line goes to `skipped` with a reason instead; only throws
 * `PokeGenieFormatError` when the file as a whole doesn't look like a Poke
 * Genie export at all.
 */
export function parsePokeGenieCsv(text: string): PokeGenieParseResult {
  // Strip a leading UTF-8 BOM, which some export paths (Excel-opened-then-
  // resaved CSVs in particular) prepend — otherwise it silently corrupts the
  // very first header name and this file would fail header validation for a
  // reason that has nothing to do with it not being a Poke Genie export.
  const BOM_CODE_POINT = 0xfeff;
  const normalized = text.length > 0 && text.charCodeAt(0) === BOM_CODE_POINT ? text.slice(1) : text;

  const records = splitCsvRecords(normalized);
  if (records.length === 0) {
    throw new PokeGenieFormatError("This file is empty — expected a Poke Genie CSV export with a header row.");
  }

  const headerRecord = records[0]!;
  const headers = headerRecord.fields.map((h) => h.trim());

  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new PokeGenieFormatError(
      `This doesn't look like a Poke Genie CSV export — missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
    );
  }

  const unnamedHeaders = headers.filter((h) => h !== "" && !KNOWN_HEADERS.has(h));
  const ignoredColumns = unnamedHeaders.filter((h) => RECOGNIZED_UNUSED_HEADERS.has(h));
  const unknownColumns = unnamedHeaders.filter((h) => !RECOGNIZED_UNUSED_HEADERS.has(h));

  const rows: PokeGenieRow[] = [];
  const skipped: PokeGenieSkippedRow[] = [];

  for (const record of records.slice(1)) {
    const isBlankLine = record.fields.length === 1 && record.fields[0]!.trim() === "";
    if (isBlankLine) {
      skipped.push({ lineNumber: record.lineNumber, reason: "Blank line." });
      continue;
    }
    if (record.fields.length !== headers.length) {
      skipped.push({
        lineNumber: record.lineNumber,
        reason: `Expected ${headers.length} column${headers.length === 1 ? "" : "s"}, found ${record.fields.length}.`,
      });
      continue;
    }
    const values: Record<string, string> = {};
    headers.forEach((h, i) => {
      values[h] = record.fields[i] ?? "";
    });
    rows.push({ lineNumber: record.lineNumber, values });
  }

  return { rows, skipped, unknownColumns, ignoredColumns };
}
