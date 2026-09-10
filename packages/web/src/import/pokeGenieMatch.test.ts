import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ChargedMove, FastMove, SpeciesDefinition } from "@pogo-analyzer/engine";
import { parsePokeGenieCsv } from "./pokeGenieCsv.js";
import { matchPokeGenieRows, type RosterEntry } from "./pokeGenieMatch.js";
import type { PokeGenieRow } from "./pokeGenieCsv.js";
import { speciesRegistry } from "../registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "test", "pokeGenieSample.csv");

// ---- Synthetic registry fixtures (isolated from the real ~1000-species data
// layer, so these tests pin the ladder's OWN logic, not incidental facts
// about today's species.json). --------------------------------------------

function fastMove(id: string, name: string): FastMove {
  return { id, name, type: "normal", power: 5, energyGain: 5, durationSeconds: 0.5 };
}

function chargedMove(id: string, name: string): ChargedMove {
  return { id, name, type: "normal", power: 50, energyCost: 50, durationSeconds: 2, vulnerableWindowSeconds: 2 };
}

function species(opts: {
  id: string;
  name: string;
  dex: number;
  fastMoves?: FastMove[];
  chargedMoves?: ChargedMove[];
}): SpeciesDefinition {
  return {
    id: opts.id,
    name: opts.name,
    types: ["normal"],
    baseAttack: 150,
    baseDefense: 150,
    baseStamina: 150,
    fastMoves: opts.fastMoves ?? [fastMove(`${opts.id.toUpperCase()}_TACKLE`, "Tackle")],
    chargedMoves: opts.chargedMoves ?? [chargedMove(`${opts.id.toUpperCase()}_BODY_SLAM`, "Body Slam")],
    imageUrl: `https://example.test/sprites/pokemon/${opts.dex}.png`,
  };
}

function row(lineNumber: number, values: Record<string, string>): PokeGenieRow {
  const base: Record<string, string> = {
    Name: "",
    Form: "",
    Pokemon: "",
    "Atk IV": "",
    "Def IV": "",
    "Sta IV": "",
    "IV Avg": "0",
    "Level Min": "20.0",
    "Level Max": "20.0",
    "Quick Move": "",
    "Charge Move": "",
    "Charge Move 2": "",
    "Shadow/Purified": "0",
    Lucky: "0",
  };
  return { lineNumber, values: { ...base, ...values } };
}

describe("matchPokeGenieRows — matching ladder", () => {
  it("step 1: matches dex + exact species name when Form is Normal/empty", () => {
    const registry = { all: () => [species({ id: "mewtwo", name: "Mewtwo", dex: 150 })] };
    const result = matchPokeGenieRows([row(2, { Name: "Mewtwo", Form: "Normal", Pokemon: "150" })], registry);
    expect(result.unmatched).toHaveLength(0);
    expect(result.matched[0]!.species.id).toBe("mewtwo");
  });

  it("step 2: matches a Mega form via the BASE species' canonical name, ignoring the mega candidate's own (broken) sprite-derived dex number", () => {
    const registry = {
      all: () => [
        species({ id: "delphox", name: "Delphox", dex: 655 }),
        // A mega form's imageUrl encodes a PokeAPI alt-form id, NOT the real
        // dex (10293, not 655) — this must still resolve via the base
        // species' name, not by trusting this candidate's own dex bucket.
        species({ id: "delphox-mega", name: "Mega Delphox", dex: 10293 }),
      ],
    };
    const result = matchPokeGenieRows([row(2, { Name: "Delphox", Form: "Mega", Pokemon: "655" })], registry);
    expect(result.unmatched).toHaveLength(0);
    expect(result.matched[0]!.species.id).toBe("delphox-mega");
    expect(result.matched[0]!.canMega).toBe(true);
  });

  it('step 3: matches "Male" by hyphen-segment prefix, NOT as a raw substring — must not also match "-female"', () => {
    const registry = {
      all: () => [
        species({ id: "indeedee-male", name: "Indeedee (Male)", dex: 876 }),
        species({ id: "indeedee-female", name: "Indeedee (Female)", dex: 876 }),
      ],
    };
    const result = matchPokeGenieRows([row(2, { Name: "Indeedee", Form: "Male", Pokemon: "876" })], registry);
    expect(result.unmatched).toHaveLength(0);
    expect(result.matched[0]!.species.id).toBe("indeedee-male");
  });

  it("step 3: matches non-uniform suffix conventions (Hisui -> '-hisuian', Galar -> '-galarian')", () => {
    const registry = {
      all: () => [
        species({ id: "sneasel", name: "Sneasel", dex: 215 }),
        species({ id: "sneasel-hisuian", name: "Sneasel (Hisuian)", dex: 215 }),
        species({ id: "stunfisk", name: "Stunfisk", dex: 618 }),
        species({ id: "stunfisk-galarian", name: "Stunfisk (Galarian)", dex: 618 }),
      ],
    };
    const result = matchPokeGenieRows(
      [
        row(2, { Name: "Sneasel", Form: "Hisui", Pokemon: "215" }),
        row(3, { Name: "Stunfisk", Form: "Galar", Pokemon: "618" }),
      ],
      registry,
    );
    expect(result.unmatched).toHaveLength(0);
    expect(result.matched.map((m) => m.species.id).sort()).toEqual(["sneasel-hisuian", "stunfisk-galarian"]);
  });

  it("step 4: falls back to the single registered candidate for a dex with no base/exact-name entry (the Sawsbuck/Toxtricity case)", () => {
    // The registry only has "Sawsbuck (Spring)", never bare "Sawsbuck" — steps
    // 1-3 all fail (Form is empty/Normal, so step 1 requires an EXACT name
    // match, which "Sawsbuck (Spring)" isn't).
    const registry = { all: () => [species({ id: "sawsbuck-spring", name: "Sawsbuck (Spring)", dex: 586 })] };
    const result = matchPokeGenieRows([row(2, { Name: "Sawsbuck", Form: "", Pokemon: "586" })], registry);
    expect(result.unmatched).toHaveLength(0);
    expect(result.matched[0]!.species.id).toBe("sawsbuck-spring");
  });

  it("step 6: reports an unmatched row with the candidates it considered, never dropping it", () => {
    const registry = {
      all: () => [
        species({ id: "foo-a", name: "Foo A", dex: 999 }),
        species({ id: "foo-b", name: "Foo B", dex: 999 }),
      ],
    };
    const result = matchPokeGenieRows([row(2, { Name: "Totally Unknown", Form: "", Pokemon: "999" })], registry);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    const u = result.unmatched[0]!;
    expect(u.lineNumber).toBe(2);
    expect(u.name).toBe("Totally Unknown");
    expect(u.dex).toBe(999);
    expect(u.candidatesConsidered.sort()).toEqual(["Foo A", "Foo B"]);
  });

  it("reports a row with a missing/non-numeric dex column as unmatched rather than crashing", () => {
    const registry = { all: () => [species({ id: "mewtwo", name: "Mewtwo", dex: 150 })] };
    const result = matchPokeGenieRows([row(2, { Name: "Mewtwo", Form: "Normal", Pokemon: "" })], registry);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]!.reason).toMatch(/dex/i);
  });

  it("gives duplicate species rows distinct entryIds", () => {
    const registry = { all: () => [species({ id: "houndour", name: "Houndour", dex: 228 })] };
    const result = matchPokeGenieRows(
      [
        row(14, { Name: "Houndour", Form: "", Pokemon: "228" }),
        row(15, { Name: "Houndour", Form: "", Pokemon: "228" }),
      ],
      registry,
    );
    expect(result.matched).toHaveLength(2);
    const ids = result.matched.map((m) => m.entryId);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("matchPokeGenieRows — per-row interpretation", () => {
  const registry = { all: () => [species({ id: "mewtwo", name: "Mewtwo", dex: 150 })] };

  function matchOne(values: Record<string, string>): RosterEntry {
    const result = matchPokeGenieRows([row(2, values)], registry);
    expect(result.unmatched).toHaveLength(0);
    return result.matched[0]!;
  }

  it("uses real Atk/Def/Sta IV when present, and is NOT flagged approximate", () => {
    const entry = matchOne({ Name: "Mewtwo", Form: "Normal", Pokemon: "150", "Atk IV": "15", "Def IV": "14", "Sta IV": "13" });
    expect(entry.ivs).toEqual({ attack: 15, defense: 14, stamina: 13 });
    expect(entry.ivsAreApproximate).toBe(false);
  });

  it("derives an even split from IV Avg when Atk/Def/Sta IV are blank, and flags ivsAreApproximate", () => {
    const entry = matchOne({ Name: "Mewtwo", Form: "Normal", Pokemon: "150", "IV Avg": "68.3" });
    expect(entry.ivsAreApproximate).toBe(true);
    const total = entry.ivs.attack + entry.ivs.defense + entry.ivs.stamina;
    // round(68.3 / 100 * 45) = 31.
    expect(total).toBe(31);
    expect(entry.ivs.attack).toBeGreaterThanOrEqual(0);
    expect(entry.ivs.attack).toBeLessThanOrEqual(15);
  });

  it("uses Level Min and flags levelIsApproximate when Level Min !== Level Max", () => {
    const entry = matchOne({ Name: "Mewtwo", Form: "Normal", Pokemon: "150", "Level Min": "27.0", "Level Max": "28.5" });
    expect(entry.level).toBe(27);
    expect(entry.levelIsApproximate).toBe(true);
  });

  it("does not flag levelIsApproximate when Level Min === Level Max", () => {
    const entry = matchOne({ Name: "Mewtwo", Form: "Normal", Pokemon: "150", "Level Min": "20.0", "Level Max": "20.0" });
    expect(entry.levelIsApproximate).toBe(false);
  });

  it.each([
    ["0", false, false],
    ["1", true, false],
    ["2", false, true],
  ])("maps Shadow/Purified=%s onto isShadow=%s / isPurified=%s", (raw, isShadow, isPurified) => {
    const entry = matchOne({ Name: "Mewtwo", Form: "Normal", Pokemon: "150", "Shadow/Purified": raw });
    expect(entry.costModifiers.isShadow).toBe(isShadow);
    expect(entry.costModifiers.isPurified).toBe(isPurified);
  });

  it("maps Lucky=1 onto costModifiers.isLucky", () => {
    const entry = matchOne({ Name: "Mewtwo", Form: "Normal", Pokemon: "150", Lucky: "1" });
    expect(entry.costModifiers.isLucky).toBe(true);
  });

  it("falls back to the species' first move and reports the raw name when a move name doesn't resolve", () => {
    const withMoves = {
      all: () => [
        species({
          id: "raticate-alola",
          name: "Raticate (Alola)",
          dex: 20,
          fastMoves: [fastMove("QUICK_ATTACK_FAST", "Quick Attack"), fastMove("BITE_FAST", "Bite")],
          chargedMoves: [chargedMove("CRUNCH", "Crunch"), chargedMove("HYPER_BEAM", "Hyper Beam")],
        }),
      ],
    };
    const result = matchPokeGenieRows(
      [row(20, { Name: "Raticate", Form: "Alola", Pokemon: "20", "Quick Move": "Quick Attack", "Charge Move": "Return" })],
      withMoves,
    );
    const entry = result.matched[0]!;
    expect(entry.fastMoveId).toBe("QUICK_ATTACK_FAST"); // matched normally, not defaulted
    expect(entry.chargedMoveId).toBe("CRUNCH"); // fell back to the species' first charged move
    expect(entry.movesetIsDefaulted).toBe(true);
    expect(entry.unmatchedMoveNames).toEqual(["Return"]);
    // Per-slot detail: only the CHARGED move was defaulted, and specifically
    // because "Return" was present but unrecognized — never conflate this
    // with a blank slot (see movesetDefaultBadge, which words these two
    // cases differently).
    expect(entry.fastMoveIsDefaulted).toBe(false);
    expect(entry.chargedMoveIsDefaulted).toBe(true);
    expect(entry.fastMoveUnmatchedName).toBeNull();
    expect(entry.chargedMoveUnmatchedName).toBe("Return");
  });

  it("defaults a BLANK move silently — a blank move is not reported as unmatched", () => {
    const entry = matchOne({ Name: "Mewtwo", Form: "Normal", Pokemon: "150", "Quick Move": "", "Charge Move": "" });
    expect(entry.movesetIsDefaulted).toBe(true);
    expect(entry.unmatchedMoveNames).toEqual([]);
    // Both slots defaulted, and both because the source row was genuinely
    // blank — neither carries an unmatched name.
    expect(entry.fastMoveIsDefaulted).toBe(true);
    expect(entry.chargedMoveIsDefaulted).toBe(true);
    expect(entry.fastMoveUnmatchedName).toBeNull();
    expect(entry.chargedMoveUnmatchedName).toBeNull();
  });

  it("flags only the FAST move as defaulted (blank) when the charged move resolves normally — the mirror image of the Raticate case above", () => {
    // "Body Slam" is this registry's OWN charged move name (see the shared
    // `species()` fixture helper above) — must resolve, not default, or this
    // test would accidentally exercise the "both defaulted" path instead.
    const entry = matchOne({ Name: "Mewtwo", Form: "Normal", Pokemon: "150", "Quick Move": "", "Charge Move": "Body Slam" });
    expect(entry.movesetIsDefaulted).toBe(true);
    expect(entry.fastMoveIsDefaulted).toBe(true);
    expect(entry.chargedMoveIsDefaulted).toBe(false);
    expect(entry.fastMoveUnmatchedName).toBeNull();
    expect(entry.chargedMoveUnmatchedName).toBeNull();
  });

  it("records Charge Move 2 without ever resolving it to a move id (the engine only simulates one charged move)", () => {
    const entry = matchOne({ Name: "Mewtwo", Form: "Normal", Pokemon: "150", "Charge Move 2": "Ice Beam" });
    expect(entry.secondChargedMoveName).toBe("Ice Beam");
  });

  it("leaves secondChargedMoveName undefined when the column is blank", () => {
    const entry = matchOne({ Name: "Mewtwo", Form: "Normal", Pokemon: "150", "Charge Move 2": "" });
    expect(entry.secondChargedMoveName).toBeUndefined();
  });

  it("sets canMega true only when Form is Mega", () => {
    expect(matchOne({ Name: "Mewtwo", Form: "Normal", Pokemon: "150" }).canMega).toBe(false);
  });

  it("carries no evolution field of its own — evolution comes from SpeciesDefinition, never inferred from a Poke Genie column", () => {
    // The importer deliberately has NO isFullyEvolved/evolvesToIds of its own.
    // data-sync writes both onto SpeciesDefinition from GAME_MASTER, and
    // rosterPlanner.ts reads `entry.species.isFullyEvolved`. An import-layer
    // field was drafted before that data existed and was dead on arrival;
    // don't reintroduce one.
    //
    // In particular, never infer it from Poke Genie's "Name (G/U/L)" PvP-rank
    // columns — those name whichever species holds a good PvP rank, frequently
    // the FULLY EVOLVED form even for an unevolved catch. A usable one-off
    // research proxy, not an evolution graph.
    const entry = matchOne({ Name: "Mewtwo", Form: "Normal", Pokemon: "150" });
    expect(entry).not.toHaveProperty("isFullyEvolved");
    expect(entry).not.toHaveProperty("evolvesToIds");
  });
});

describe("matchPokeGenieRows — real fixture against the real species registry", () => {
  const text = fs.readFileSync(FIXTURE_PATH, "utf8");
  const parseResult = parsePokeGenieCsv(text);
  const result = matchPokeGenieRows(parseResult.rows, speciesRegistry);

  it("accounts for every one of the 23 fixture rows: matched + unmatched, never dropped", () => {
    expect(result.matched.length + result.unmatched.length).toBe(parseResult.rows.length);
    expect(parseResult.rows.length).toBe(23);
  });

  it("matches all 23 fixture rows to a real species", () => {
    expect(result.unmatched).toHaveLength(0);
    expect(result.matched).toHaveLength(23);
  });

  it("resolves Sawsbuck and Toxtricity via the dex-only-single-candidate fallback", () => {
    const sawsbuck = result.matched.find((m) => m.species.name.startsWith("Sawsbuck"));
    const toxtricity = result.matched.find((m) => m.species.name.startsWith("Toxtricity"));
    expect(sawsbuck?.species.id).toBe("sawsbuck-spring");
    expect(toxtricity?.species.id).toBe("toxtricity-amped");
  });

  it("resolves both Mega rows (Delphox, Blaziken)", () => {
    expect(result.matched.some((m) => m.species.id === "delphox-mega")).toBe(true);
    expect(result.matched.some((m) => m.species.id === "blaziken-mega")).toBe(true);
  });

  it('falls back Raticate (Alola)\'s "Return" charged move and reports it as unmatched, since it does not exist in this engine\'s move data', () => {
    const withReturn = result.matched.find((m) => m.unmatchedMoveNames.includes("Return"));
    expect(withReturn).toBeDefined();
    expect(withReturn!.species.id).toBe("raticate-alola");
    expect(withReturn!.movesetIsDefaulted).toBe(true);
  });

  it("flags the blank-IV and uncertain-level rows as approximate", () => {
    const approximateIvCount = result.matched.filter((m) => m.ivsAreApproximate).length;
    const approximateLevelCount = result.matched.filter((m) => m.levelIsApproximate).length;
    // Measured directly against the fixture's own raw values (see this
    // module's own scratch verification) — 9 rows have blank Atk/Def/Sta IV,
    // 2 rows have Level Min !== Level Max.
    expect(approximateIvCount).toBe(9);
    expect(approximateLevelCount).toBe(2);
  });

  it("gives the two duplicate Houndour rows and two duplicate Raticate (Alola) rows distinct entryIds", () => {
    const houndourIds = result.matched.filter((m) => m.species.id === "houndour").map((m) => m.entryId);
    const raticateIds = result.matched.filter((m) => m.species.id === "raticate-alola").map((m) => m.entryId);
    expect(houndourIds).toHaveLength(2);
    expect(new Set(houndourIds).size).toBe(2);
    expect(raticateIds).toHaveLength(2);
    expect(new Set(raticateIds).size).toBe(2);
  });
});
