/**
 * Static guard for a bug class this project has already hit once.
 *
 * `data/normalized/raidHistory.json` rows carry a `source` discriminator, and
 * `packages/web` both types it (`RawRaidHistoryEntry.source` in registry.ts) and
 * branches on it (badge selection, and the tier-resolution split between archive
 * rows and live/researched rows). Those are three separate places that must all
 * learn about a new source value, and NOTHING enforces it: `sync-data.ts` can
 * introduce one, the JSON is cast with `as unknown as`, so TypeScript never sees
 * the mismatch and the app renders wrong rows with no error.
 *
 * That is not hypothetical. When `"bulbapedia-archive"` was added, registry.ts's
 * union and two of its branches still keyed literally on `"pogoapi-previous"` —
 * 32 of the 75 new rows were silently mis-tiered and mis-sorted until an agent
 * happened to look. It is the same shape as the Mega Mewtwo Y incident CLAUDE.md
 * describes (a value carried by one gate, invisible to the consumer that depends
 * on it, failing silently), just recurring at the data-shape level instead of the
 * roster level.
 *
 * So this asserts two things:
 *   1. Every distinct `source` present in the data appears in the web layer's
 *      declared union. A value missing here is a hard failure.
 *   2. Every such value is actually MENTIONED somewhere in `packages/web/src`
 *      beyond that union — i.e. some branch plausibly handles it. A value that
 *      only appears in the type is reported as a warning, not a failure, since
 *      "no special-casing needed" is a legitimate outcome; it just should be a
 *      deliberate one rather than an oversight.
 *
 * Deliberate limitation, same spirit as check-scenario-roundtrip.mjs: this is a
 * cheap name-level check. It proves a value is known and mentioned, not that the
 * branch handling it is correct.
 *
 *     npm run check-raid-history-sources
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HISTORY = 'data/normalized/raidHistory.json';
const REGISTRY = 'packages/web/src/registry.ts';
const WEB_SRC = 'packages/web/src';

function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}

const historyPath = path.join(repoRoot, HISTORY);
if (!fs.existsSync(historyPath)) {
  console.log(`skip  ${HISTORY} does not exist yet — nothing to check.`);
  process.exit(0);
}

const rows = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
const inData = [...new Set(rows.map((r) => r.source).filter(Boolean))].sort();

const registrySrc = fs.readFileSync(path.join(repoRoot, REGISTRY), 'utf8');
// The `source:` field of RawRaidHistoryEntry — a union of string literals.
const unionMatch = registrySrc.match(/source:\s*((?:"[^"]+"\s*\|\s*)*"[^"]+")\s*;/);
if (!unionMatch) {
  fail(`could not find a \`source:\` string-literal union in ${REGISTRY} — did the type move or get renamed?`);
  process.exit(1);
}
const declared = [...unionMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();

// Every other .ts/.tsx file in the web layer, for the "is it actually handled" scan.
const otherSrc = fs
  .readdirSync(path.join(repoRoot, WEB_SRC))
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => fs.readFileSync(path.join(repoRoot, WEB_SRC, f), 'utf8'))
  .join('\n');
// registry.ts minus the union line itself, so the declaration doesn't count as "handled".
const registryBeyondUnion = registrySrc.replace(unionMatch[0], '');

console.log(`sources in ${HISTORY}: ${inData.join(', ')}`);
console.log(`declared in ${REGISTRY}: ${declared.join(', ')}`);
console.log('');

for (const value of inData) {
  if (!declared.includes(value)) {
    fail(
      `source "${value}" appears in ${HISTORY} but is NOT in ${REGISTRY}'s union. ` +
        `The JSON is cast with \`as unknown as\`, so TypeScript will not catch this — ` +
        `rows with this source will fall through every branch that keys on the union.`,
    );
  }
}

const unhandled = inData.filter(
  (v) => declared.includes(v) && !otherSrc.includes(`"${v}"`) && !registryBeyondUnion.includes(`"${v}"`),
);
for (const value of unhandled) {
  console.log(
    `warn  source "${value}" is declared but never referenced outside the union — ` +
      `confirm no badge or tier-resolution branch needs to special-case it.`,
  );
}

const stale = declared.filter((v) => !inData.includes(v));
for (const value of stale) {
  console.log(`note  source "${value}" is declared but absent from the current data (fine — history only grows).`);
}

// ---------------------------------------------------------------------------
// Shadow durability.
//
// Shadow variants used to be synthesized ONLY inside the active-raid matching
// loop, so a shadow species existed just while its raid was live and silently
// vanished on rotation — the same live-raid-gate fragility behind the Mega
// Skarmory and Mega Mewtwo Y incidents, but invisible to check-mega-gates.ts,
// which filters on `.boost` and so only ever sees mega/primal. Synthesis is now
// anchored on raidHistory.json, which is accumulate-only and never shrinks.
//
// The invariant worth asserting is the FRAGILITY direction, not its inverse. A
// shadow species with no raidHistory row AND no first-party GAME_MASTER
// `shadow` block has no durable anchor: it exists only because something
// transient mentioned it (today's live feed, or a third-party archive that
// could change), and it will disappear when that stops. The reverse check —
// "every history row has a species" — would be near-tautological here, since
// synthesis reads that same file.
//
// A shadow species can ALSO be anchored by GAME_MASTER's own first-party
// `shadow` block (2026-09-11, IDEAS.md #15 — "Shadow forms exist only for
// species that have been shadow raid bosses"), which is stronger evidence
// than a third-party raid archive, not weaker, and is the ONLY anchor that
// can ever cover a Team GO Rocket grunt-only shadow (e.g. Shadow Alolan
// Sandshrew) — raidHistory.json is structurally raid-shaped and can never
// record one. sync-data.ts writes the base-species-id list this anchor
// implies to data/normalized/shadowFirstPartyAnchors.json (see that file's
// own doc comment in sync-data.ts) specifically so this check can see it
// without re-running the sync pipeline itself.
const speciesPath = path.join(repoRoot, 'data/normalized/species.json');
const shadowFirstPartyAnchorsPath = path.join(repoRoot, 'data/normalized/shadowFirstPartyAnchors.json');
if (fs.existsSync(speciesPath)) {
  const species = JSON.parse(fs.readFileSync(speciesPath, 'utf8'));
  const shadowIds = species.map((s) => s.id).filter((id) => id.endsWith('-shadow'));
  const anchoredByHistory = new Set(rows.map((r) => r.speciesId));
  let firstPartyAnchoredShadowIds = new Set();
  if (fs.existsSync(shadowFirstPartyAnchorsPath)) {
    const baseIds = JSON.parse(fs.readFileSync(shadowFirstPartyAnchorsPath, 'utf8'));
    firstPartyAnchoredShadowIds = new Set(baseIds.map((baseId) => `${baseId}-shadow`));
  } else {
    console.log(`warn  ${shadowFirstPartyAnchorsPath} does not exist — first-party GAME_MASTER shadow anchoring cannot be checked this run (treated as zero, not skipped).`);
  }
  const unanchored = shadowIds.filter((id) => !anchoredByHistory.has(id) && !firstPartyAnchoredShadowIds.has(id));
  const anchoredByFirstPartyOnly = shadowIds.filter((id) => !anchoredByHistory.has(id) && firstPartyAnchoredShadowIds.has(id));
  console.log('');
  console.log(
    `shadow species: ${shadowIds.length}, anchored in raidHistory: ${shadowIds.length - unanchored.length - anchoredByFirstPartyOnly.length}, ` +
      `anchored ONLY by GAME_MASTER's first-party shadow block: ${anchoredByFirstPartyOnly.length}`,
  );
  if (unanchored.length > 0) {
    const shown = unanchored.slice(0, 10).join(', ') + (unanchored.length > 10 ? ', ...' : '');
    fail(
      `${unanchored.length} shadow species have NO raidHistory row and NO first-party GAME_MASTER shadow block, so they are carried only by a ` +
        `transient source and will vanish when it stops mentioning them: ${shown}`,
    );
  }
}

if (!process.exitCode) {
  console.log(`\nok    all ${inData.length} source value(s) known to the web layer; every shadow species is anchored.`);
}
