#!/usr/bin/env node
/**
 * Summarizes what changed in data/normalized/*.json against a baseline,
 * because a raw `git diff` on species.json (2.6 MB) is unreadable for a
 * routine data-sync commit.
 *
 * USAGE
 *   npm run diff-normalized [-- --base <ref>] [-- --dir <path>] [-- --json] [-- --strict]
 *   node scripts/diff-normalized.mjs [--base <ref>] [--dir <path>] [--json] [--strict]
 *
 *   --base <ref>   Git ref to diff against (default: HEAD). Baseline files are
 *                  read via `git show <ref>:data/normalized/<file>`, so this
 *                  works uncommitted (compares the working tree to a commit).
 *   --dir <path>   Compare against normalized JSON files in an arbitrary local
 *                  directory instead of a git ref (e.g. a snapshot saved before
 *                  a sync run). Mutually exclusive with --base.
 *   --json         Emit the full machine-readable report as JSON instead of
 *                  the human summary.
 *   --strict       Exit non-zero if raidHistory.json lost any row — that file
 *                  is accumulate-only (see CLAUDE.md), so a removal is always
 *                  a bug. Without --strict the removal is still printed loudly
 *                  to stderr, just without the non-zero exit.
 *
 * WHAT IT DIFFS, per file in data/normalized/:
 *   - species.json: added/removed/changed species by `id`. A changed entry
 *     names WHICH fields changed (stats, types, boost, shadow flag, moves,
 *     lastKnownRaidTier, rarity, name, imageUrl, or any other field found).
 *   - activeRaids.json: boss rotation changes, keyed by `raidName` (added =
 *     newly rotated in, removed = rotated out, changed = same raid name but a
 *     different tier and/or resolved speciesId).
 *   - raidHistory.json: added rows, and any REMOVED row flagged as a bug (see
 *     --strict above) — this file only ever grows.
 *   - powerUpCosts.json: top-level scalar fields (multipliers, maxLevel) plus
 *     the `steps` array (diffed by `fromLevel`), the RAW
 *     `perSpeciesUpgradeOverrides` array and the INTERPRETED
 *     `perSpeciesOverridesByPokemonId` map (both keyed by `pokemonId`,
 *     2026-09-10). Any top-level key it recognizes in NEITHER list is
 *     reported as unrecognized rather than skipped.
 *   - any other *.json file present: falls back to a generic array diff keyed
 *     on whichever of `id`/`speciesId`/`raidName` is present, or a whole-file
 *     equality check if it's not a recognizable keyed array.
 *
 * LIMITATIONS (deliberate, keeping this a fast local sanity check, not a full
 * data-integrity tool):
 *   - In --base (git) mode, a normalized file that existed at the baseline ref
 *     but has been deleted entirely from the working tree today is NOT
 *     detected (this script only iterates the CURRENT data/normalized/
 *     directory listing) — only --dir mode iterates both sides. In practice a
 *     sync-data run only adds/modifies known files, never removes one wholesale.
 *   - "Changed" is a deep-equality check per entry (JSON.stringify), not a
 *     structural diff — it tells you an entry differs and, for species/
 *     powerUpCosts steps, which named field group differs, not a line-level diff.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const NORMALIZED_DIR = path.join(REPO_ROOT, "data", "normalized");

function printHelp() {
  console.log(`Usage: node scripts/diff-normalized.mjs [--base <ref>] [--dir <path>] [--json] [--strict]

  --base <ref>   Git ref to diff against (default: HEAD).
  --dir <path>   Compare against normalized JSON files in a local directory instead of a git ref.
  --json         Emit the full report as JSON instead of the human summary.
  --strict       Exit non-zero if raidHistory.json lost any row (accumulate-only file).
`);
}

function parseArgs(argv) {
  const args = { base: "HEAD", dir: null, json: false, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") args.base = argv[++i];
    else if (a === "--dir") args.dir = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      printHelp();
      process.exit(2);
    }
  }
  if (args.dir && args.base !== "HEAD") {
    console.error("--base and --dir are mutually exclusive.");
    process.exit(2);
  }
  return args;
}

function loadBaseline(filename, args) {
  if (args.dir) {
    const p = path.join(args.dir, filename);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf-8"));
  }
  const relPath = `data/normalized/${filename}`;
  try {
    const text = execFileSync("git", ["show", `${args.base}:${relPath}`], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 64,
    });
    return JSON.parse(text);
  } catch {
    return null; // didn't exist at that ref (or git failed) — treated as "new file"
  }
}

function loadCurrent(filename) {
  const p = path.join(NORMALIZED_DIR, filename);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Diffs two arrays of objects by a shared key field. Returns added/removed keys and changed keys, plus lookup maps for detail formatting. */
function diffByKey(prevArr, nextArr, key) {
  const prevMap = new Map((prevArr ?? []).map((e) => [e[key], e]));
  const nextMap = new Map((nextArr ?? []).map((e) => [e[key], e]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [k, nv] of nextMap) {
    const pv = prevMap.get(k);
    if (pv === undefined) {
      added.push(k);
      continue;
    }
    if (!deepEqual(pv, nv)) changed.push(k);
  }
  for (const k of prevMap.keys()) {
    if (!nextMap.has(k)) removed.push(k);
  }
  return { added, removed, changed, prevMap, nextMap };
}

const SPECIES_KNOWN_FIELDS = new Set([
  "id",
  "baseAttack",
  "baseDefense",
  "baseStamina",
  "types",
  "boost",
  "isShadow",
  "fastMoves",
  "chargedMoves",
  "lastKnownRaidTier",
  "rarity",
  "name",
  "imageUrl",
]);

/** Names WHICH field group changed between two species entries with the same id — see this file's header comment for the tracked groups. */
function speciesChangedFields(prev, next) {
  const fields = [];
  if (prev.baseAttack !== next.baseAttack || prev.baseDefense !== next.baseDefense || prev.baseStamina !== next.baseStamina) {
    fields.push("stats");
  }
  if (!deepEqual(prev.types, next.types)) fields.push("types");
  if (!deepEqual(prev.boost ?? null, next.boost ?? null)) fields.push("boost");
  if (Boolean(prev.isShadow) !== Boolean(next.isShadow)) fields.push("shadow flag");
  if (!deepEqual(prev.fastMoves, next.fastMoves) || !deepEqual(prev.chargedMoves, next.chargedMoves)) fields.push("moves");
  if ((prev.lastKnownRaidTier ?? null) !== (next.lastKnownRaidTier ?? null)) fields.push("lastKnownRaidTier");
  if ((prev.rarity ?? null) !== (next.rarity ?? null)) fields.push("rarity");
  if (prev.name !== next.name) fields.push("name");
  if ((prev.imageUrl ?? null) !== (next.imageUrl ?? null)) fields.push("imageUrl");

  const otherKeys = new Set([...Object.keys(prev), ...Object.keys(next)].filter((k) => !SPECIES_KNOWN_FIELDS.has(k)));
  for (const k of otherKeys) {
    if (!deepEqual(prev[k], next[k])) fields.push(k);
  }
  if (fields.length === 0) fields.push("(unrecognized field changed — see raw JSON)");
  return fields;
}

function diffSpeciesFile(prev, next) {
  const { added, removed, changed, prevMap, nextMap } = diffByKey(prev, next, "id");
  return {
    added: added.map((id) => ({ id, name: nextMap.get(id).name })),
    removed: removed.map((id) => ({ id, name: prevMap.get(id).name })),
    changed: changed.map((id) => ({ id, fields: speciesChangedFields(prevMap.get(id), nextMap.get(id)) })),
  };
}

function diffActiveRaidsFile(prev, next) {
  const { added, removed, changed, prevMap, nextMap } = diffByKey(prev, next, "raidName");
  return {
    added: added.map((n) => ({ raidName: n, tier: nextMap.get(n).tier })),
    removed: removed.map((n) => ({ raidName: n, tier: prevMap.get(n).tier })),
    changed: changed.map((n) => ({
      raidName: n,
      from: prevMap.get(n).tier,
      to: nextMap.get(n).tier,
      speciesChanged: prevMap.get(n).speciesId !== nextMap.get(n).speciesId,
    })),
  };
}

function genericChangedFields(prev, next) {
  const keys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);
  const fields = [];
  for (const k of keys) {
    if (!deepEqual(prev?.[k], next?.[k])) fields.push(k);
  }
  return fields;
}

/** raidHistory.json is accumulate-only (CLAUDE.md) — a `removed` entry here is always a bug, surfaced loudly by the caller. */
function diffRaidHistoryFile(prev, next) {
  const { added, removed, changed, prevMap, nextMap } = diffByKey(prev, next, "speciesId");
  return {
    added: added.map((id) => ({ speciesId: id, raidName: nextMap.get(id).raidName, source: nextMap.get(id).source })),
    removed,
    changed: changed.map((id) => ({ speciesId: id, fields: genericChangedFields(prevMap.get(id), nextMap.get(id)) })),
  };
}

const POWER_UP_TOP_LEVEL_FIELDS = [
  "maxLevel",
  "shadowStardustMultiplier",
  "shadowCandyMultiplier",
  "purifiedStardustMultiplier",
  "purifiedCandyMultiplier",
  "luckyStardustMultiplier",
  "sourceUrl",
];

/**
 * Top-level keys of powerUpCosts.json that a dedicated branch below already
 * reports on, plus the pure-metadata one. Anything in the file that is in
 * NEITHER this list nor POWER_UP_TOP_LEVEL_FIELDS is reported as unrecognized
 * rather than silently skipped.
 *
 * Why the guard exists (2026-09-10): this file grew
 * `perSpeciesOverridesByPokemonId` — the interpreted per-species cost tables
 * the engine reads for EVERY price it quotes — and this diff reported only
 * "+1 override" on the raw array beside it, because the field enumeration
 * above is hand-maintained. `luckyStardustMultiplier` had likewise been
 * missing from POWER_UP_TOP_LEVEL_FIELDS since it was added, so a change to
 * the Lucky discount would not have shown up here at all. A hand-maintained
 * allowlist silently under-reports; it must say so when it doesn't recognize
 * something.
 */
const POWER_UP_STRUCTURED_FIELDS = ["steps", "perSpeciesUpgradeOverrides", "perSpeciesOverridesByPokemonId", "fetchedAt"];

/** Which levels' step costs differ between two PowerUpCostTable-shaped objects. */
function changedStepLevels(prevTable, nextTable) {
  const d = diffByKey(prevTable?.steps ?? [], nextTable?.steps ?? [], "fromLevel");
  return [...d.added, ...d.removed, ...d.changed].sort((a, b) => a - b);
}

export function diffPowerUpCostsFile(prev, next) {
  const changedTop = POWER_UP_TOP_LEVEL_FIELDS.filter((f) => !deepEqual(prev[f], next[f]));
  const stepsDiff = diffByKey(prev.steps ?? [], next.steps ?? [], "fromLevel");
  // Per-species power-up cost overrides (2026-09-10) — keyed by pokemonId,
  // same diffByKey shape as steps above. Reported separately from
  // changedTop since it's an array of records, not a scalar.
  const overridesDiff = diffByKey(prev.perSpeciesUpgradeOverrides ?? [], next.perSpeciesUpgradeOverrides ?? [], "pokemonId");

  // The INTERPRETED per-species tables (2026-09-10) — an object map keyed by
  // raw pokemonId, not an array, so diffByKey doesn't apply. This is the half
  // the engine actually prices against (powerUpCostTableFor), so a change here
  // moves real numbers in the app; the raw array above only moves provenance.
  const prevInterp = prev.perSpeciesOverridesByPokemonId ?? {};
  const nextInterp = next.perSpeciesOverridesByPokemonId ?? {};
  const prevIds = Object.keys(prevInterp);
  const nextIds = Object.keys(nextInterp);
  const interpretedAdded = nextIds.filter((id) => !(id in prevInterp));
  const interpretedRemoved = prevIds.filter((id) => !(id in nextInterp));
  const interpretedChanged = nextIds
    .filter((id) => id in prevInterp && !deepEqual(prevInterp[id], nextInterp[id]))
    .map((id) => ({ pokemonId: id, levels: changedStepLevels(prevInterp[id], nextInterp[id]) }));

  // Anything this handler doesn't know about at all.
  const known = new Set([...POWER_UP_TOP_LEVEL_FIELDS, ...POWER_UP_STRUCTURED_FIELDS]);
  const unrecognized = [...new Set([...Object.keys(prev), ...Object.keys(next)])]
    .filter((k) => !known.has(k))
    .filter((k) => !deepEqual(prev[k], next[k]));

  return {
    changedTop,
    interpretedAdded,
    interpretedRemoved,
    interpretedChanged,
    unrecognized,
    stepsAdded: stepsDiff.added,
    stepsRemoved: stepsDiff.removed,
    changedSteps: stepsDiff.changed.map((lvl) => ({ fromLevel: lvl, before: stepsDiff.prevMap.get(lvl), after: stepsDiff.nextMap.get(lvl) })),
    overridesAdded: overridesDiff.added.map((id) => ({ pokemonId: id, sourceTemplateId: overridesDiff.nextMap.get(id).sourceTemplateId })),
    overridesRemoved: overridesDiff.removed,
    changedOverrides: overridesDiff.changed.map((id) => ({ pokemonId: id, before: overridesDiff.prevMap.get(id), after: overridesDiff.nextMap.get(id) })),
  };
}

/** Fallback for any normalized *.json file this script doesn't have a dedicated handler for. */
function diffGenericFile(prev, next) {
  if (!Array.isArray(next)) {
    return { note: "unrecognized non-array normalized file; whole-file equality check only", changed: !deepEqual(prev, next) };
  }
  const sample = next[0] ?? prev?.[0] ?? {};
  const key = ["id", "speciesId", "raidName"].find((k) => sample[k] !== undefined);
  if (!key) {
    return { note: "no recognizable id-like key field; showing raw counts only", prevCount: prev?.length ?? 0, nextCount: next.length };
  }
  const { added, removed, changed } = diffByKey(prev, next, key);
  return { added, removed, changed };
}

const HANDLERS = {
  "species.json": diffSpeciesFile,
  "activeRaids.json": diffActiveRaidsFile,
  "raidHistory.json": diffRaidHistoryFile,
  "powerUpCosts.json": diffPowerUpCostsFile,
};

function hasAnyChange(result) {
  if (!result) return false;
  if (result.newFile) return true;
  for (const v of Object.values(result)) {
    if (Array.isArray(v) && v.length > 0) return true;
    if (typeof v === "boolean" && v) return true;
  }
  return false;
}

function clip(arr, n = 5) {
  return { shown: arr.slice(0, n), extra: Math.max(0, arr.length - n) };
}

function printClipped(arr, formatter, n = 5) {
  const { shown, extra } = clip(arr, n);
  for (const e of shown) console.log(formatter(e));
  if (extra > 0) console.log(`  ... and ${extra} more`);
}

function printFileResult(filename, result) {
  if (result.newFile) {
    console.log("  (new file, no baseline)");
    return;
  }
  if (filename === "species.json") {
    console.log(`  +${result.added.length} added, -${result.removed.length} removed, ~${result.changed.length} changed`);
    printClipped(result.added, (e) => `  + ${e.id} (${e.name})`);
    printClipped(result.removed, (e) => `  - ${e.id} (${e.name})`);
    printClipped(result.changed, (e) => `  ~ ${e.id}: ${e.fields.join(", ")}`);
  } else if (filename === "activeRaids.json") {
    console.log(`  +${result.added.length} added, -${result.removed.length} removed, ~${result.changed.length} changed`);
    printClipped(result.added, (e) => `  + ${e.raidName} (${e.tier})`);
    printClipped(result.removed, (e) => `  - ${e.raidName} (was ${e.tier})`);
    printClipped(result.changed, (e) => `  ~ ${e.raidName}: ${e.from} -> ${e.to}${e.speciesChanged ? " (speciesId changed)" : ""}`);
  } else if (filename === "raidHistory.json") {
    const removedFlag = result.removed.length > 0 ? "  <-- SHOULD NEVER HAPPEN, accumulate-only file" : "";
    console.log(`  +${result.added.length} added, -${result.removed.length} removed, ~${result.changed.length} changed${removedFlag}`);
    printClipped(result.added, (e) => `  + ${e.speciesId} (${e.raidName}, source ${e.source})`);
    printClipped(result.removed, (id) => `  - ${id}`);
    printClipped(result.changed, (e) => `  ~ ${e.speciesId}: ${e.fields.join(", ")}`);
  } else if (filename === "powerUpCosts.json") {
    if (result.changedTop.length > 0) console.log(`  top-level changed: ${result.changedTop.join(", ")}`);
    console.log(`  steps: +${result.stepsAdded.length} -${result.stepsRemoved.length} ~${result.changedSteps.length}`);
    printClipped(result.changedSteps, (e) => `  ~ level ${e.fromLevel}: ${JSON.stringify(e.before)} -> ${JSON.stringify(e.after)}`);
    console.log(`  perSpeciesUpgradeOverrides: +${result.overridesAdded.length} -${result.overridesRemoved.length} ~${result.changedOverrides.length}`);
    printClipped(result.overridesAdded, (e) => `  + ${e.pokemonId} (${e.sourceTemplateId})`);
    printClipped(result.overridesRemoved, (id) => `  - ${id}`);
    printClipped(result.changedOverrides, (e) => `  ~ ${e.pokemonId}: ${JSON.stringify(e.before)} -> ${JSON.stringify(e.after)}`);
    console.log(
      `  perSpeciesOverridesByPokemonId (INTERPRETED — what the engine prices against): ` +
        `+${result.interpretedAdded.length} -${result.interpretedRemoved.length} ~${result.interpretedChanged.length}`,
    );
    printClipped(result.interpretedAdded, (id) => `  + ${id}`);
    printClipped(result.interpretedRemoved, (id) => `  - ${id}`);
    printClipped(
      result.interpretedChanged,
      (e) => `  ~ ${e.pokemonId}: ${e.levels.length} level(s) changed${e.levels.length > 0 ? ` (from ${e.levels[0]})` : ""}`,
    );
    if (result.unrecognized.length > 0) {
      console.log(`  !! unrecognized top-level field(s) CHANGED and were not diffed: ${result.unrecognized.join(", ")}`);
      console.log(`     add them to POWER_UP_TOP_LEVEL_FIELDS or POWER_UP_STRUCTURED_FIELDS in scripts/diff-normalized.mjs`);
    }
  } else if (result.note) {
    console.log(`  ${result.note}`);
    if ("prevCount" in result) console.log(`  prev count: ${result.prevCount}, next count: ${result.nextCount}`);
    if (result.added) printClipped(result.added, (id) => `  + ${id}`);
    if (result.removed) printClipped(result.removed, (id) => `  - ${id}`);
    if (result.changed) printClipped(result.changed, (id) => `  ~ ${id}`);
  } else {
    console.log(`  ${JSON.stringify(result)}`);
  }
}

function printHumanSummary(report) {
  console.log(`diff-normalized: data/normalized/ vs ${report.baseline}`);
  const changedFiles = Object.entries(report.files).filter(([, result]) => hasAnyChange(result));
  if (changedFiles.length === 0) {
    console.log("no changes");
    return;
  }
  for (const [filename, result] of changedFiles) {
    console.log(`\n${filename}:`);
    printFileResult(filename, result);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const filenames = new Set(readdirSync(NORMALIZED_DIR).filter((f) => f.endsWith(".json")));
  if (args.dir && existsSync(args.dir)) {
    for (const f of readdirSync(args.dir).filter((f) => f.endsWith(".json"))) filenames.add(f);
  }

  const report = { baseline: args.dir ? `dir:${args.dir}` : `git:${args.base}`, files: {} };
  let raidHistoryRemovedCount = 0;

  for (const filename of [...filenames].sort()) {
    const prev = loadBaseline(filename, args);
    const next = loadCurrent(filename);

    let result;
    if (next === null) {
      result = { note: "file present at baseline but missing from data/normalized/ today", changed: true };
    } else if (prev === null) {
      result = { newFile: true };
    } else if (HANDLERS[filename]) {
      result = HANDLERS[filename](prev, next);
      if (filename === "raidHistory.json") raidHistoryRemovedCount += result.removed.length;
    } else {
      result = diffGenericFile(prev, next);
    }
    report.files[filename] = result;
  }

  report.raidHistoryRemovedCount = raidHistoryRemovedCount;

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanSummary(report);
  }

  if (raidHistoryRemovedCount > 0) {
    console.error(
      `\nERROR: raidHistory.json lost ${raidHistoryRemovedCount} row(s) — that file is accumulate-only per CLAUDE.md; a removal is always a bug, never expected.`,
    );
    if (args.strict) process.exitCode = 1;
  }
}

// Only run the CLI when invoked directly — scripts/sync-data/test/diff.test.ts
// imports diffPowerUpCostsFile from here, and importing must not diff the repo.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
