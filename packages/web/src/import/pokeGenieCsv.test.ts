import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePokeGenieCsv, PokeGenieFormatError } from "./pokeGenieCsv.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "test", "pokeGenieSample.csv");

const HEADER =
  "Index,Name,Form,Pokemon,Gender,CP,HP,Atk IV,Def IV,Sta IV,IV Avg,Level Min,Level Max,Quick Move,Charge Move,Charge Move 2,Scan Date,Catch Date,Weight,Height,Lucky,Shadow/Purified,Favorite,Dust";

describe("parsePokeGenieCsv", () => {
  it("parses the real 23-row fixture with zero skipped rows and header-indexed values", () => {
    const text = fs.readFileSync(FIXTURE_PATH, "utf8");
    const result = parsePokeGenieCsv(text);
    expect(result.rows).toHaveLength(23);
    expect(result.skipped).toHaveLength(0);
    // Every row is accounted for: rows.length + skipped.length === every data line in the file.
    const dataLineCount = text.trim().split("\n").length - 1; // minus the header
    expect(result.rows.length + result.skipped.length).toBe(dataLineCount);

    const first = result.rows[0]!;
    expect(first.values["Name"]).toBe("Palkia");
    expect(first.values["Form"]).toBe("Normal");
    expect(first.values["Pokemon"]).toBe("484");
    // A quoted field containing no comma but wrapped in quotes anyway (the
    // real export's own convention for its Scan Date column).
    expect(first.values["Scan Date"]).toBe("2026-09-08 16:19");
  });

  it("rejects a file that plainly isn't a Poke Genie export, naming the missing columns", () => {
    const notPokeGenie = "Name,Species,Level\nPikachu,Pikachu,20\n";
    expect(() => parsePokeGenieCsv(notPokeGenie)).toThrow(PokeGenieFormatError);
    try {
      parsePokeGenieCsv(notPokeGenie);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PokeGenieFormatError);
      expect((err as Error).message).toMatch(/missing required column/i);
      expect((err as Error).message).toMatch(/Atk IV/);
    }
  });

  it("rejects a genuinely empty file with a clear error, not zero silent rows", () => {
    expect(() => parsePokeGenieCsv("")).toThrow(PokeGenieFormatError);
  });

  it("handles RFC-4180 quoted fields containing commas, and the \"\" escape for a literal quote", () => {
    const text = `${HEADER}\n1,"Say, Hi",Normal,25,,500,50,15,15,15,100,20.0,20.0,Thundershock,,,"2026-01-01 00:00",,,,0,0,0,100\n`;
    const result = parsePokeGenieCsv(text);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.values["Name"]).toBe("Say, Hi");
  });

  it('preserves a doubled "" as one literal quote character inside a quoted field', () => {
    const text = `${HEADER}\n1,"Bob ""The Bat""",Normal,169,,500,50,15,15,15,100,20.0,20.0,,,,,,,,0,0,0,0\n`;
    const result = parsePokeGenieCsv(text);
    expect(result.rows[0]!.values["Name"]).toBe('Bob "The Bat"');
  });

  it("handles CRLF line endings identically to LF", () => {
    const text = `${HEADER}\r\n1,Palkia,Normal,484,,500,50,,,,68.3,20.0,20.0,,,,,,,,0,1,0,0\r\n`;
    const result = parsePokeGenieCsv(text);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.values["Name"]).toBe("Palkia");
  });

  it("reports a row with the wrong column count as skipped, never throwing and never silently dropping it", () => {
    const text = `${HEADER}\n1,Palkia,Normal,484,,500,50,,,,68.3,20.0,20.0\n2,Mewtwo,Normal,150,,500,50,15,15,15,100,20.0,20.0,,,,,,,,0,0,0,0\n`;
    const result = parsePokeGenieCsv(text);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.values["Name"]).toBe("Mewtwo");
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toMatch(/column/i);
  });

  it("reports a blank line as skipped rather than silently dropping it", () => {
    const text = `${HEADER}\n1,Palkia,Normal,484,,500,50,,,,68.3,20.0,20.0,,,,,,,,0,1,0,0\n\n2,Mewtwo,Normal,150,,500,50,15,15,15,100,20.0,20.0,,,,,,,,0,0,0,0\n`;
    const result = parsePokeGenieCsv(text);
    expect(result.rows).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toMatch(/blank/i);
  });

  it("reports header columns it doesn't recognize via unknownColumns, without blocking the parse", () => {
    const text = `${HEADER},Totally New Column\n1,Palkia,Normal,484,,500,50,,,,68.3,20.0,20.0,,,,,,,,0,1,0,0,surprise\n`;
    const result = parsePokeGenieCsv(text);
    expect(result.unknownColumns).toContain("Totally New Column");
    expect(result.rows).toHaveLength(1);
  });

  it("classifies Poke Genie's PvP-rank block as ignored, not unknown, so a healthy export reports zero unknown columns", () => {
    // A real export carries 25 recognized-but-unused columns (the 8-column
    // PvP-rank block x 3 leagues, plus "Marked for PvP use"). Reporting
    // those as "unrecognized" made a completely successful import open with
    // a wall of column names that read as a failure — and buried the
    // numbers that actually matter. `unknownColumns` must stay reserved for
    // genuine schema drift.
    const text = fs.readFileSync(FIXTURE_PATH, "utf8");
    const result = parsePokeGenieCsv(text);
    expect(result.unknownColumns).toEqual([]);
    expect(result.ignoredColumns).toHaveLength(25);
    expect(result.ignoredColumns).toContain("Rank % (G)");
    expect(result.ignoredColumns).toContain("Candy Cost (L)");
    expect(result.ignoredColumns).toContain("Marked for PvP use");
  });

  it("still reports a genuinely unrecognized column as unknown, not ignored", () => {
    const text = `${HEADER},Totally New Column\n1,Palkia,Normal,484,,500,50,,,,68.3,20.0,20.0,,,,,,,,0,1,0,0,surprise\n`;
    const result = parsePokeGenieCsv(text);
    expect(result.unknownColumns).toEqual(["Totally New Column"]);
    expect(result.ignoredColumns).not.toContain("Totally New Column");
  });

  it("strips a leading UTF-8 BOM rather than corrupting the first header name", () => {
    const text = `\uFEFF${HEADER}\n1,Palkia,Normal,484,,500,50,,,,68.3,20.0,20.0,,,,,,,,0,1,0,0\n`;
    const result = parsePokeGenieCsv(text);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.values["Name"]).toBe("Palkia");
  });
});
