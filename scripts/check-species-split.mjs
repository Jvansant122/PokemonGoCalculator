/**
 * Guards PLAN_species_moves_split.md Stage 1's derived files against
 * staleness: `data/normalized/speciesCore.json` (species.json minus its two
 * move arrays) and `data/normalized/speciesMoves.json` (a deduped move
 * dictionary plus per-species id lists) are written by
 * scripts/sync-data/speciesSplit.ts's `deriveSpeciesSplit`, from the exact
 * same in-memory `species` array that produces `species.json` itself, in the
 * SAME sync run. Nothing currently stops a future change from writing one of
 * the three files and not the other two (a partial commit, a hand edit, a
 * future refactor that forgets one write call) — and since packages/web is
 * meant to eventually read the derived pair INSTEAD of species.json, a silent
 * mismatch there would ship a wrong app with every test green, because
 * nothing else in this repo compares these three files to each other.
 *
 * So this re-joins speciesCore.json + speciesMoves.json (core entry, plus its
 * fastMoves/chargedMoves looked up via bySpecies through the move
 * dictionaries) and asserts deep equality against species.json, species by
 * species. That makes staleness between canonical and derived mechanically
 * impossible rather than merely unlikely.
 *
 *     npm run check-species-split
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPECIES = "data/normalized/species.json";
const SPECIES_CORE = "data/normalized/speciesCore.json";
const SPECIES_MOVES = "data/normalized/speciesMoves.json";

function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}

const speciesPath = path.join(repoRoot, SPECIES);
const corePath = path.join(repoRoot, SPECIES_CORE);
const movesPath = path.join(repoRoot, SPECIES_MOVES);

for (const [label, p] of [
  [SPECIES, speciesPath],
  [SPECIES_CORE, corePath],
  [SPECIES_MOVES, movesPath],
]) {
  if (!fs.existsSync(p)) {
    console.log(`skip  ${label} does not exist yet — nothing to check (run npm run sync-data first).`);
    process.exit(0);
  }
}

const species = JSON.parse(fs.readFileSync(speciesPath, "utf8"));
const speciesCore = JSON.parse(fs.readFileSync(corePath, "utf8"));
const speciesMoves = JSON.parse(fs.readFileSync(movesPath, "utf8"));

const { fastMoves, chargedMoves, bySpecies } = speciesMoves;

// ---------------------------------------------------------------------------
// 1. Same set of species ids, same order (order isn't semantically required,
//    but a silent reorder is itself a sign something regenerated one file and
//    not the other, so it's worth flagging rather than tolerating).
// ---------------------------------------------------------------------------
const speciesIds = species.map((s) => s.id);
const coreIds = speciesCore.map((s) => s.id);
if (speciesIds.length !== coreIds.length) {
  fail(`species.json has ${speciesIds.length} entries but speciesCore.json has ${coreIds.length}.`);
}
const idOrderMismatch = speciesIds.some((id, i) => id !== coreIds[i]);
if (idOrderMismatch) {
  fail(`speciesCore.json's species order does not match species.json's — the two were not written from the same sync run.`);
}

// ---------------------------------------------------------------------------
// 2. Re-join and deep-compare, species by species.
// ---------------------------------------------------------------------------
const coreById = new Map(speciesCore.map((s) => [s.id, s]));
const mismatches = [];
const missingBySpecies = [];
const missingMoveIds = new Map(); // speciesId -> [move ids not found in the dictionary]

for (const original of species) {
  const core = coreById.get(original.id);
  if (!core) {
    mismatches.push(`${original.id}: absent from speciesCore.json entirely`);
    continue;
  }
  const idLists = bySpecies[original.id];
  if (!idLists) {
    missingBySpecies.push(original.id);
    continue;
  }

  const missing = [];
  const rejoinedFastMoves = idLists.f.map((id) => {
    const m = fastMoves[id];
    if (m === undefined) missing.push(`fast:${id}`);
    return m;
  });
  const rejoinedChargedMoves = idLists.c.map((id) => {
    const m = chargedMoves[id];
    if (m === undefined) missing.push(`charged:${id}`);
    return m;
  });
  if (missing.length > 0) {
    missingMoveIds.set(original.id, missing);
    continue;
  }

  const rejoined = { ...core, fastMoves: rejoinedFastMoves, chargedMoves: rejoinedChargedMoves };
  // Rebuild key order to match `original` exactly before stringifying, since
  // object-literal spread order (core's fields, then fastMoves/chargedMoves
  // appended) will not match species.json's natural fromGameMaster field
  // order — this check is about VALUE equality, not incidental key order.
  const reordered = {};
  for (const key of Object.keys(original)) reordered[key] = rejoined[key];
  // Any key rejoined carries that original didn't (shouldn't happen, but
  // don't let it hide silently behind key-order reconstruction).
  for (const key of Object.keys(rejoined)) {
    if (!(key in reordered)) reordered[key] = rejoined[key];
  }

  if (JSON.stringify(reordered) !== JSON.stringify(original)) {
    mismatches.push(`${original.id}: rejoined entry does not deep-equal species.json's entry`);
  }
}

console.log(`species.json: ${species.length} entries`);
console.log(`speciesCore.json: ${speciesCore.length} entries`);
console.log(`speciesMoves.json: ${Object.keys(fastMoves).length} fast moves, ${Object.keys(chargedMoves).length} charged moves, ${Object.keys(bySpecies).length} bySpecies entries`);

if (missingBySpecies.length > 0) {
  fail(`${missingBySpecies.length} species have a speciesCore.json entry but no speciesMoves.json bySpecies entry: ${missingBySpecies.slice(0, 10).join(", ")}${missingBySpecies.length > 10 ? ", ..." : ""}`);
}
if (missingMoveIds.size > 0) {
  const shown = [...missingMoveIds.entries()].slice(0, 10).map(([id, ids]) => `${id} (${ids.join(", ")})`);
  fail(`${missingMoveIds.size} species reference a move id not present in speciesMoves.json's dictionaries: ${shown.join("; ")}${missingMoveIds.size > 10 ? ", ..." : ""}`);
}
if (mismatches.length > 0) {
  fail(`${mismatches.length} species do not re-join to their species.json entry: ${mismatches.slice(0, 10).join("; ")}${mismatches.length > 10 ? ", ..." : ""}`);
}

// ---------------------------------------------------------------------------
// 3. No orphaned dictionary/bySpecies entries either direction (a species
//    removed from species.json but left behind in speciesMoves.json's
//    bySpecies map would be silent bloat, not a correctness bug for the
//    join above, but still means the two files are out of sync).
// ---------------------------------------------------------------------------
const bySpeciesIds = Object.keys(bySpecies);
const orphanedBySpecies = bySpeciesIds.filter((id) => !speciesIds.includes(id));
if (orphanedBySpecies.length > 0) {
  fail(`speciesMoves.json's bySpecies map has ${orphanedBySpecies.length} id(s) not present in species.json: ${orphanedBySpecies.slice(0, 10).join(", ")}${orphanedBySpecies.length > 10 ? ", ..." : ""}`);
}

if (!process.exitCode) {
  console.log(`\nok    speciesCore.json + speciesMoves.json re-join to exactly species.json (${species.length} species checked).`);
}
