/**
 * Diffing this sync's output against the previously-written
 * data/normalized/*.json, for the CHANGED lines in sync-data.ts's completion
 * report. Split out of sync-data.ts as part of a 2026-09-06
 * code-simplifier-prompted reorg — pure functions, no I/O of their own (the
 * caller reads the previous files and passes them in).
 */

import type { SpeciesDefinition } from "@pogo-analyzer/engine";

import type { ActiveRaidEntry } from "./rawShapes.ts";

export function diffSpecies(prev: SpeciesDefinition[] | null, next: SpeciesDefinition[]): string[] {
  if (!prev) return ["initial sync (no previous species.json baseline)"];
  const diffs: string[] = [];
  const prevById = new Map(prev.map((s) => [s.id, s]));
  const nextById = new Map(next.map((s) => [s.id, s]));
  for (const [id, ns] of nextById) {
    const ps = prevById.get(id);
    if (!ps) {
      diffs.push(`+ ${id} (new species)`);
      continue;
    }
    if (JSON.stringify(ps) !== JSON.stringify(ns)) {
      diffs.push(`~ ${id} changed`);
    }
  }
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) diffs.push(`- ${id} (removed)`);
  }
  return diffs;
}

export function diffRaids(prev: ActiveRaidEntry[] | null, next: ActiveRaidEntry[]): string[] {
  if (!prev) return ["initial sync (no previous activeRaids.json baseline)"];
  const diffs: string[] = [];
  const prevByName = new Map(prev.map((r) => [r.raidName, r]));
  const nextByName = new Map(next.map((r) => [r.raidName, r]));
  for (const [name, nr] of nextByName) {
    const pr = prevByName.get(name);
    if (!pr) {
      diffs.push(`+ ${name} (new raid entry)`);
      continue;
    }
    if (JSON.stringify(pr) !== JSON.stringify(nr)) {
      diffs.push(`~ ${name} changed (${JSON.stringify(pr)} -> ${JSON.stringify(nr)})`);
    }
  }
  for (const name of prevByName.keys()) {
    if (!nextByName.has(name)) diffs.push(`- ${name} (no longer an active raid)`);
  }
  return diffs;
}
