/**
 * Standalone, READ-ONLY, NO-NETWORK advisory check — NOT part of the
 * sync-data pipeline.
 *
 * WHY THIS IS A SEPARATE CHECK FROM check-mega-gaps.ts, NOT A TWEAK TO IT:
 * check-mega-gaps.ts is an ABSENCE detector — it diffs this project's own
 * mega/primal roster against Bulbapedia and can only ever fire once a real,
 * released species is already MISSING from data/normalized/species.json.
 * That is exactly the failure mode it's built for, but it structurally can't
 * catch a species that is CURRENTLY PRESENT yet fragile — carried by a gate
 * that is guaranteed to stop carrying it the moment circumstances change,
 * with nothing else backing it up.
 *
 * Two real incidents prove this gap in the absence-only strategy:
 *
 *   - Mega Mewtwo Y (2026-09-07): present in species.json for its entire
 *     life ONLY because it happened to be an active ScrapedDuck raid boss
 *     that morning (megaOrPrimalRaidGaps in scripts/sync-data.ts). It is
 *     absent from data/raw/mega_pokemon.json entirely and, at the time, had
 *     no RELEASED_MEGA_PRIMAL_ALLOWLIST entry either. The moment that raid
 *     rotation ended, it silently vanished from the picker. check-mega-gaps
 *     could only ever have caught this AFTER the disappearance, and only if
 *     a scheduled run happened to land inside the narrow window before
 *     someone noticed and re-added it.
 *
 *   - Mega Skarmory (2026-09-07, same day): identical mechanism. Reachable
 *     only through the live-raid gate, never through the allowlist. Raiding
 *     hours earlier the same day it dropped out.
 *
 * Both are now fixed by adding entries to RELEASED_MEGA_PRIMAL_ALLOWLIST
 * (scripts/sync-data/releasedMegaPrimalAllowlist.ts) — but that fix only
 * protects the two species someone happened to notice. This script is the
 * generalization: a gate-PROVENANCE audit that classifies every mega/primal
 * species currently in the roster by which gate is carrying it, and fails
 * loudly the moment ANY of them is carried solely by the fragile live-raid
 * gate — continuously, while the species is still present, rather than only
 * after it's already gone. That is strictly better than tightening the
 * check-mega-gaps.ts cron: a fragile species is detectable in every run
 * instead of only in the narrow post-breakage window before a fix lands.
 *
 * Classification (same `.boost`-field filter check-mega-gaps.ts already uses
 * for "is a mega" — see SpeciesDefinition.boost in packages/engine/src/
 * types.ts and how scripts/sync-data.ts sets it; not redefined here):
 *
 *   - "mega-pokemon-json": name appears in data/raw/mega_pokemon.json
 *     (pogoapi.net's roster). Durable across raid rotations — pogoapi
 *     doesn't drop an entry just because it isn't raiding today.
 *   - "allowlist": name appears in RELEASED_MEGA_PRIMAL_ALLOWLIST. Durable
 *     by construction — that table exists specifically to survive a raid
 *     rotation ending.
 *   - "live-raid-only": neither of the above. FRAGILE: the only reason this
 *     species is in species.json right now is that scripts/sync-data.ts's
 *     megaOrPrimalRaidGaps happened to see it as a currently-active raid
 *     boss on this run's ScrapedDuck fetch. It will silently disappear from
 *     species.json the instant that rotation ends, exactly as Mega Mewtwo Y
 *     and Mega Skarmory did.
 *
 * This script does NOT re-derive "is currently an active raid" itself (that
 * would require a network fetch, which this script deliberately never does)
 * — it doesn't need to. Everything already IN species.json with a `.boost`
 * field is, by construction of scripts/sync-data.ts's own gating logic, only
 * there because it matched pogoapi's roster, the allowlist, OR a live raid
 * at sync time. So "matches neither of the two durable gates" is exactly
 * "was let in by the live-raid gate" — no re-fetch required to determine
 * that.
 *
 * Never writes to data/raw/ or data/normalized/, never touches
 * scripts/sync-data.ts (imports the extracted, network-free
 * ./sync-data/releasedMegaPrimalAllowlist.ts module only — see that module's
 * own doc comment for why it had to be extracted for exactly this purpose).
 * Only ever prints a report and writes a small JSON summary to $RUNNER_TEMP
 * (falling back to the OS temp dir when unset) for the companion GitHub
 * Actions workflow to read, matching check-mega-gaps.ts's own report-shape
 * conventions (`checkedAt`, `status` of "ok"/"error", counts, offending
 * entries) so the workflow can read both checks consistently.
 *
 * Run via: npx tsx scripts/check-mega-gates.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { RELEASED_MEGA_PRIMAL_ALLOWLIST } from "./sync-data/releasedMegaPrimalAllowlist.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SPECIES_PATH = join(REPO_ROOT, "data", "normalized", "species.json");
const MEGA_POKEMON_PATH = join(REPO_ROOT, "data", "raw", "mega_pokemon.json");

type Gate = "mega-pokemon-json" | "allowlist" | "live-raid-only";

interface NormalizedSpeciesLite {
  id: string;
  name: string;
  boost?: unknown;
}

interface MegaPokemonRawEntry {
  mega_name: string;
  [key: string]: unknown;
}

interface GateClassification {
  id: string;
  name: string;
  gate: Gate;
}

interface GateReport {
  checkedAt: string;
  status: "ok" | "error";
  error: string | null;
  totalMegaPrimalCount: number;
  megaPokemonJsonCount: number;
  allowlistCount: number;
  liveRaidOnlyCount: number;
  liveRaidOnly: GateClassification[];
}

function loadOwnMegaPrimalRoster(): NormalizedSpeciesLite[] {
  const raw = readFileSync(SPECIES_PATH, "utf-8");
  const all = JSON.parse(raw) as NormalizedSpeciesLite[];
  return all.filter((s) => Boolean(s.boost));
}

function loadMegaPokemonJsonNames(): Set<string> {
  const raw = readFileSync(MEGA_POKEMON_PATH, "utf-8");
  const entries = JSON.parse(raw) as MegaPokemonRawEntry[];
  return new Set(entries.map((e) => e.mega_name.toLowerCase()));
}

function classify(
  roster: NormalizedSpeciesLite[],
  megaPokemonJsonNames: Set<string>,
  allowlistNames: Set<string>,
): GateClassification[] {
  return roster.map((s) => {
    const key = s.name.toLowerCase();
    let gate: Gate;
    if (megaPokemonJsonNames.has(key)) {
      gate = "mega-pokemon-json";
    } else if (allowlistNames.has(key)) {
      gate = "allowlist";
    } else {
      gate = "live-raid-only";
    }
    return { id: s.id, name: s.name, gate };
  });
}

function finish(report: GateReport) {
  const summaryPath = join(process.env.RUNNER_TEMP ?? tmpdir(), "mega-gate-report.json");
  writeFileSync(summaryPath, JSON.stringify(report, null, 2));

  console.log(`Mega/primal gate-provenance audit — ${report.checkedAt}`);
  console.log(`Summary written to: ${summaryPath}`);
  console.log("");

  if (report.status === "error") {
    console.log("STATUS: ERROR");
    console.log(`ERROR: ${report.error}`);
    console.log("");
    console.log("This is a broken/uninformative check, NOT a confirmed all-clear. Needs human investigation.");
    return;
  }

  console.log(`Total mega/primal species in roster (.boost set): ${report.totalMegaPrimalCount}`);
  console.log(`  - mega-pokemon-json (durable, pogoapi.net roster): ${report.megaPokemonJsonCount}`);
  console.log(`  - allowlist (durable, RELEASED_MEGA_PRIMAL_ALLOWLIST): ${report.allowlistCount}`);
  console.log(`  - live-raid-only (FRAGILE): ${report.liveRaidOnlyCount}`);
  console.log("");

  if (report.liveRaidOnlyCount === 0) {
    console.log("STATUS: NO FRAGILE SPECIES FOUND");
    console.log("Every mega/primal species currently in the roster is carried by a durable gate.");
    return;
  }

  console.log("STATUS: FRAGILE SPECIES FOUND");
  console.log(
    "The following species are in the roster ONLY because they are (or were, as of this sync) a live raid boss —",
  );
  console.log(
    "they will silently disappear from data/normalized/species.json the moment that raid rotation ends, exactly",
  );
  console.log("as happened to Mega Mewtwo Y and Mega Skarmory on 2026-09-07:");
  for (const entry of report.liveRaidOnly) {
    console.log(`  - ${entry.name} (id: ${entry.id})`);
  }
  console.log("");
  console.log(
    "Action needed: after a human independently verifies each of these is genuinely released, permanently-unlockable",
  );
  console.log(
    "content (not datamined/unreleased GAME_MASTER data), add it to RELEASED_MEGA_PRIMAL_ALLOWLIST in",
  );
  console.log("scripts/sync-data/releasedMegaPrimalAllowlist.ts with its own citation, same pattern as every existing entry there.");
}

function main() {
  const checkedAt = new Date().toISOString();

  let roster: NormalizedSpeciesLite[];
  let megaPokemonJsonNames: Set<string>;
  try {
    roster = loadOwnMegaPrimalRoster();
    megaPokemonJsonNames = loadMegaPokemonJsonNames();
  } catch (err) {
    const report: GateReport = {
      checkedAt,
      status: "error",
      error: `Could not read/parse required local data files: ${(err as Error).message}`,
      totalMegaPrimalCount: 0,
      megaPokemonJsonCount: 0,
      allowlistCount: 0,
      liveRaidOnlyCount: 0,
      liveRaidOnly: [],
    };
    finish(report);
    process.exitCode = 1;
    return;
  }

  const allowlistNames = new Set(RELEASED_MEGA_PRIMAL_ALLOWLIST.map((e) => e.name.toLowerCase()));
  const classifications = classify(roster, megaPokemonJsonNames, allowlistNames);

  const megaPokemonJsonCount = classifications.filter((c) => c.gate === "mega-pokemon-json").length;
  const allowlistCount = classifications.filter((c) => c.gate === "allowlist").length;
  const liveRaidOnly = classifications.filter((c) => c.gate === "live-raid-only");

  const report: GateReport = {
    checkedAt,
    status: "ok",
    error: null,
    totalMegaPrimalCount: classifications.length,
    megaPokemonJsonCount,
    allowlistCount,
    liveRaidOnlyCount: liveRaidOnly.length,
    liveRaidOnly,
  };
  finish(report);

  if (liveRaidOnly.length > 0) {
    process.exitCode = 1;
  }
}

main();
